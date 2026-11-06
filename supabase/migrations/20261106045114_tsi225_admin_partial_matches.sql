-- TSI 2.2.5: admin-only incomplete match drafts. Generated from the validated staging definitions.
-- Apply to production only after independent staging validations.
-- No published games or customer records are altered by this migration.
create table public.tsi225_match_drafts (
  id uuid primary key,
  data jsonb not null constraint tsi225_match_drafts_data_check check (jsonb_typeof(data)='object'),
  version integer not null default 1 constraint tsi225_match_drafts_version_check check (version>0),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_match_id text unique,
  published_at timestamptz,
  constraint tsi225_match_drafts_check check (
    (published_match_id is null and published_at is null) or
    (published_match_id=id::text and published_at is not null)
  )
);
create index tsi225_match_drafts_pending on public.tsi225_match_drafts (created_at desc) where published_match_id is null;
create index tsi225_match_drafts_creator on public.tsi225_match_drafts (created_by);
create index tsi225_match_drafts_updater on public.tsi225_match_drafts (updated_by);
alter table public.tsi225_match_drafts enable row level security;
revoke all on table public.tsi225_match_drafts from public, anon, authenticated;
grant select on table public.tsi225_match_drafts to authenticated;
create policy tsi225_match_drafts_admin_read on public.tsi225_match_drafts for select to authenticated using ((select public.is_admin()));

-- Business validation and writes live in private schema and require an authenticated ADMIN session.
CREATE OR REPLACE FUNCTION tsi225_private.match_draft_data(p_data jsonb, p_complete boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare result jsonb:='{}'::jsonb; item record; value text; day date;
 allowed constant text[]:=array['date','time','cat','teams','home','away','team_mode','venue','addr','notes'];
 field text; bound integer; home_name text; away_name text;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Datos del pendiente inválidos' using errcode='22023'; end if;
 for item in select entry.key,entry.value as body from jsonb_each(p_data) as entry loop
  if not item.key=any(allowed) or jsonb_typeof(item.body)<>'string' then raise exception 'Campo no permitido o no textual: %',item.key using errcode='22023'; end if;
 end loop;
 foreach field in array allowed loop
  value:=regexp_replace(coalesce(p_data->>field,''),'^[[:space:]]+|[[:space:]]+$','','g');
  bound:=case field when 'date' then 10 when 'time' then 5 when 'team_mode' then 5 when 'cat' then 100 when 'teams' then 304 when 'home' then 150 when 'away' then 150 when 'venue' then 200 when 'addr' then 2000 else 2000 end;
  if length(value)>bound then raise exception 'Campo demasiado largo: %',field using errcode='22023'; end if;
  result:=result||jsonb_build_object(field,value);
 end loop;
 if result->>'team_mode' not in ('split','text') then raise exception 'Selecciona el modo de equipos' using errcode='22023'; end if;
 if result->>'date'<>'' then
  if result->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Fecha inválida' using errcode='22023'; end if;
  begin day:=(result->>'date')::date; exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Fecha inválida' using errcode='22023'; end;
  if day::text<>result->>'date' then raise exception 'Fecha inválida' using errcode='22023'; end if;
 end if;
 if result->>'time'<>'' and result->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hora inválida' using errcode='22023'; end if;
 if result->>'team_mode'='split' then
  home_name:=result->>'home'; away_name:=result->>'away';
  if home_name<>'' and away_name<>'' and lower(regexp_replace(normalize(home_name,NFKC),'[[:space:]]+',' ','g'))=lower(regexp_replace(normalize(away_name,NFKC),'[[:space:]]+',' ','g')) then
   raise exception 'Selecciona dos equipos distintos' using errcode='22023';
  end if;
  result:=result||jsonb_build_object('teams',case when home_name<>'' and away_name<>'' then home_name||' vs '||away_name else '' end);
 end if;
 if p_complete then
  foreach field in array array['date','time','cat','teams','venue'] loop
   if result->>field='' then raise exception 'Completa % antes de publicar',field using errcode='22023'; end if;
  end loop;
  if result->>'team_mode'='split' and (result->>'home'='' or result->>'away'='') then raise exception 'Completa ambos equipos antes de publicar' using errcode='22023'; end if;
 end if;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION tsi225_private.match_draft_save(p_id uuid, p_data jsonb, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); canonical jsonb; item public.tsi225_match_drafts%rowtype;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Solo administración puede guardar pendientes' using errcode='42501'; end if;
 if p_id is null or p_expected_version is null or p_expected_version<0 or p_expected_version>=2147483647 then raise exception 'Identificador o versión inválidos' using errcode='22023'; end if;
 canonical:=tsi225_private.match_draft_data(p_data,false);
 if p_expected_version=0 then
  insert into public.tsi225_match_drafts(id,data,created_by,updated_by) values(p_id,canonical,uid,uid) on conflict(id) do nothing;
 end if;
 select * into item from public.tsi225_match_drafts where id=p_id for update;
 if not found then raise exception 'El pendiente cambió o ya no existe. Recarga antes de guardar' using errcode='40001'; end if;
 if item.published_match_id is not null then raise exception 'El pendiente ya fue publicado' using errcode='55000'; end if;
 -- Reintento de la misma escritura tras perder la respuesta: conservar versión.
 if item.version=p_expected_version+1 and item.data=canonical then return to_jsonb(item); end if;
 if item.version<>p_expected_version then raise exception 'El pendiente cambió. Recarga antes de guardar' using errcode='40001'; end if;
 update public.tsi225_match_drafts set data=canonical,version=version+1,updated_by=uid,updated_at=clock_timestamp() where id=p_id returning * into item;
 return to_jsonb(item);
end $function$
;

CREATE OR REPLACE FUNCTION tsi225_private.match_draft_publish(p_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); item public.tsi225_match_drafts%rowtype; canonical jsonb; match_data jsonb;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Solo administración puede publicar pendientes' using errcode='42501'; end if;
 if p_id is null or p_expected_version is null or p_expected_version<1 or p_expected_version>=2147483647 then raise exception 'Identificador o versión inválidos' using errcode='22023'; end if;
 select * into item from public.tsi225_match_drafts where id=p_id for update;
 if not found then raise exception 'Pendiente inexistente' using errcode='22023'; end if;
 if item.published_match_id is not null then
  if not exists(select 1 from public.matches where id=item.published_match_id) then raise exception 'El partido publicado fue eliminado. No se volverá a crear desde este pendiente' using errcode='55000'; end if;
  return jsonb_build_object('id',item.id,'match_id',item.published_match_id,'version',item.version,'already_published',true);
 end if;
 if item.version<>p_expected_version then raise exception 'El pendiente cambió. Recarga antes de publicar' using errcode='40001'; end if;
 canonical:=tsi225_private.match_draft_data(item.data,true);
 match_data:=jsonb_build_object('id',item.id::text,'date',canonical->>'date','time',canonical->>'time','cat',canonical->>'cat','teams',canonical->>'teams','venue',canonical->>'venue','addr',canonical->>'addr','notes',canonical->>'notes','f1','','f2','','ed','','stage','','cov',null,'link','');
 -- Las protecciones originales de matches y la autoasignación225 se conservan.
 insert into public.matches(id,data) values(item.id::text,match_data);
 update public.tsi225_match_drafts set data=canonical,version=version+1,updated_by=uid,updated_at=clock_timestamp(),published_match_id=item.id::text,published_at=clock_timestamp() where id=p_id returning * into item;
 return jsonb_build_object('id',item.id,'match_id',item.published_match_id,'version',item.version,'already_published',false);
end $function$
;

CREATE OR REPLACE FUNCTION public.tsi225_match_draft_save(p_id uuid, p_data jsonb, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administración puede guardar pendientes' using errcode='42501'; end if;
 return tsi225_private.match_draft_save(p_id,p_data,p_expected_version);
end $function$
;

CREATE OR REPLACE FUNCTION public.tsi225_match_draft_save_many(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item jsonb; ids uuid[]:='{}'::uuid[]; one_id uuid; result jsonb:='[]'::jsonb;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administración puede guardar pendientes' using errcode='42501'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'El lote debe contener entre 1 y 100 pendientes' using errcode='22023'; end if;
 -- Validar todo el envoltorio antes de escribir; cualquier error revierte el lote.
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or not item ?& array['p_id','p_data','p_expected_version'] then raise exception 'Elemento de lote inválido' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(item) k where k not in ('p_id','p_data','p_expected_version'))
     or jsonb_typeof(item->'p_id')<>'string' or jsonb_typeof(item->'p_expected_version')<>'number'
     or item->>'p_expected_version' !~ '^(0|[1-9][0-9]*)$' then raise exception 'Campos de lote inválidos' using errcode='22023'; end if;
  begin one_id:=(item->>'p_id')::uuid; exception when invalid_text_representation then raise exception 'Identificador de lote inválido' using errcode='22023'; end;
  if one_id is null or one_id=any(ids) then raise exception 'Identificador repetido en el lote' using errcode='22023'; end if;
  ids:=array_append(ids,one_id);
 end loop;
 for item in select value from jsonb_array_elements(p_items) loop
  result:=result||jsonb_build_array(tsi225_private.match_draft_save((item->>'p_id')::uuid,item->'p_data',(item->>'p_expected_version')::integer));
 end loop;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.tsi225_match_draft_publish(p_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administración puede publicar pendientes' using errcode='42501'; end if;
 return tsi225_private.match_draft_publish(p_id,p_expected_version);
end $function$
;

-- Exposed RPC wrappers are callable only by authenticated users, with an ADMIN check in both layers.
revoke all on function public.tsi225_match_draft_save(uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.tsi225_match_draft_save_many(jsonb) from public,anon,authenticated;
revoke all on function public.tsi225_match_draft_publish(uuid,integer) from public,anon,authenticated;
grant execute on function public.tsi225_match_draft_save(uuid,jsonb,integer) to authenticated;
grant execute on function public.tsi225_match_draft_save_many(jsonb) to authenticated;
grant execute on function public.tsi225_match_draft_publish(uuid,integer) to authenticated;
revoke all on function tsi225_private.match_draft_data(jsonb,boolean) from public,anon,authenticated;
revoke all on function tsi225_private.match_draft_save(uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function tsi225_private.match_draft_publish(uuid,integer) from public,anon,authenticated;
-- Invoker wrappers need direct EXECUTE of the private functions; schema is not exposed to PostgREST.
grant execute on function tsi225_private.match_draft_save(uuid,jsonb,integer) to authenticated;
grant execute on function tsi225_private.match_draft_publish(uuid,integer) to authenticated;
