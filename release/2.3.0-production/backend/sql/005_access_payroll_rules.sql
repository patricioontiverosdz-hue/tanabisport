-- TSI 2.3.0. Apply only to the isolated production project.
begin;
create schema if not exists tsi230_rules;
revoke all on schema tsi230_rules from public,anon,authenticated;
grant usage on schema tsi230_rules to authenticated,service_role;

create or replace function tsi230_rules.photo_allowed(p_uid uuid,p_day date,p_time time)
returns boolean language plpgsql security definer set search_path='' as $$
declare schedule_row jsonb; day_row jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_uid and role='foto') then return false; end if;
 if tsi225_private.is_suspended(p_uid,p_day) then return false; end if;
 select a.schedule into schedule_row from public.photographer_availability a
 where a.photographer_id=p_uid and a.week_start=date_trunc('week',p_day)::date
 order by a.version desc limit 1;
 if schedule_row is null or jsonb_typeof(schedule_row)<>'array' then return false; end if;
 day_row:=schedule_row->(extract(isodow from p_day)::integer-1);
 if day_row->>'available' is distinct from 'true' or coalesce(day_row->>'start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or coalesce(day_row->>'end','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
 return p_time>=(day_row->>'start')::time and p_time<(day_row->>'end')::time;
end $$;
revoke all on function tsi230_rules.photo_allowed(uuid,date,time) from public,anon,authenticated;

create or replace function tsi230_rules.guard_photo_selection()
returns trigger language plpgsql security definer set search_path='' as $$
declare prior jsonb:='{}'; slot text; candidate text; day date; hour time;
begin
 if auth.uid() is null then return new; end if; -- Trusted service/SQL restores; browsers are covered by existing RLS.
 if tg_op='UPDATE' then prior:=old.data; end if;
 foreach slot in array array['f1','f2'] loop
  candidate:=nullif(new.data->>slot,'');
  if candidate is null or (candidate is not distinct from prior->>slot and new.data->>'date' is not distinct from prior->>'date' and new.data->>'time' is not distinct from prior->>'time') then continue; end if;
  if candidate!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Selecciona una cuenta de fotografía válida' using errcode='23514'; end if;
  if exists(select 1 from public.profiles where id=candidate::uuid and role='admin') then continue; end if;
  if not exists(select 1 from public.profiles where id=candidate::uuid and role='foto') then raise exception 'Selecciona una cuenta de fotografía válida' using errcode='23514'; end if;
  if coalesce(new.data->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(new.data->>'time','')!~'^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$' then
   raise exception 'Confirma fecha y hora antes de asignar una cobertura' using errcode='23514';
  end if;
  day:=(new.data->>'date')::date;hour:=(new.data->>'time')::time;
  -- Preserve administrative recovery of historical records, not new selections by photographers.
  if public.my_role()='admin' and day<(now() at time zone 'America/Monterrey')::date then continue; end if;
  if not tsi230_rules.photo_allowed(candidate::uuid,day,hour) then
   raise exception 'No se puede tomar el partido: confirma disponibilidad para esa semana, fecha y horario' using errcode='23514';
  end if;
 end loop;
 return new;
end $$;
revoke all on function tsi230_rules.guard_photo_selection() from public,anon,authenticated;
create trigger tsi230_guard_photo_selection before insert or update of data on public.matches
for each row execute function tsi230_rules.guard_photo_selection();

create index if not exists tsi230_editor_clock_lookup on public.editor_time_sessions(editor_id,match_id,kind,status);
create or replace function tsi230_rules.clock_seconds(p_editor uuid,p_match text)
returns numeric language sql security definer set search_path='' as $$
 select coalesce(sum(active_seconds),0) from public.editor_time_sessions
 where editor_id=p_editor and match_id=p_match and kind='original' and status in ('paused','expired') and active_seconds>0
$$;
revoke all on function tsi230_rules.clock_seconds(uuid,text) from public,anon,authenticated;

create or replace function tsi230_rules.guard_editor_pay()
returns trigger language plpgsql security definer set search_path='' as $$
declare editor uuid; owner_role text; row_line jsonb; match_row jsonb; seconds numeric; evidence jsonb:='[]'; seen text[]:='{}'; mid text;
begin
 select id,role into editor,owner_role from public.profiles where id::text=new.owner and role in ('editora','admin');
 if editor is null then return new; end if;
 if tg_op='UPDATE' and (new.data->'lines',new.data->'total',new.owner) is not distinct from (old.data->'lines',old.data->'total',old.owner) then
  if old.data?'tsi230_clock' then new.data:=new.data||jsonb_build_object('tsi230_clock',old.data->'tsi230_clock'); end if;
  return new; -- Existing approved payments keep their status/review/settlement workflow.
 end if;
 if jsonb_typeof(new.data->'lines') is distinct from 'array' then raise exception 'Revisa las líneas de pago de edición' using errcode='23514'; end if;
 for row_line in select value from jsonb_array_elements(new.data->'lines') loop
  mid:=row_line->>'mid';
  if mid is null or mid=any(seen) then raise exception 'La cobertura de edición no es válida o está repetida' using errcode='23514'; end if;
  seen:=array_append(seen,mid);
  select data into match_row from public.matches where id=mid;
  if owner_role='admin' and (match_row->>'f1'=editor::text or match_row->>'f2'=editor::text) then continue; end if;
  if match_row is null or match_row->>'stage' is distinct from 'listos' or nullif(match_row->'cov','null') is null then raise exception 'La edición debe estar concluida antes de generar su pago' using errcode='23514'; end if;
  if coalesce(nullif(match_row->>'ed',''),nullif(match_row->>'edBy',''),case when owner_role='editora' and (select count(*) from public.profiles where role='editora')=1 then editor::text end) is distinct from editor::text then
   raise exception 'La edición no corresponde a esta cuenta' using errcode='23514';
  end if;
  seconds:=tsi230_rules.clock_seconds(editor,mid);
  if seconds<=0 then raise exception 'Pago de edición bloqueado: registra y pausa el cronómetro de cada cobertura' using errcode='23514'; end if;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('match_id',mid,'original_seconds',seconds,'checked_at',now()));
 end loop;
 if cardinality(seen)=0 and coalesce((new.data->>'total')::numeric,0)<>0 then raise exception 'El pago de edición requiere coberturas cronometradas' using errcode='23514'; end if;
 new.data:=new.data||jsonb_build_object('tsi230_clock',evidence);
 return new;
end $$;
revoke all on function tsi230_rules.guard_editor_pay() from public,anon,authenticated;
create trigger tsi230_guard_editor_pay before insert or update on public.pays
for each row execute function tsi230_rules.guard_editor_pay();

create or replace function tsi230_rules.state()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r text;
begin
 select role into r from public.profiles where id=uid;
 if uid is null or r is null or r not in ('admin','foto','editora') then raise exception 'Sin permiso' using errcode='42501'; end if;
 return jsonb_build_object('server_now',now(),
 'availability',coalesce((select jsonb_agg(to_jsonb(a)) from public.photographer_availability a where (r='admin' or a.photographer_id=uid) and a.week_start is not null),'[]'::jsonb),
 'suspensions',coalesce((select jsonb_agg(jsonb_build_object('user_id',s.user_id,'start_date',s.start_date,'end_date',s.end_date)) from public.tsi225_availability_suspensions s where s.released_at is null and (r='admin' or s.user_id=uid)),'[]'::jsonb),
 'clock',coalesce((select jsonb_agg(jsonb_build_object('editor_id',s.editor_id,'match_id',s.match_id,'seconds',s.seconds)) from (select editor_id,match_id,sum(active_seconds) as seconds from public.editor_time_sessions where (r='admin' or editor_id=uid) and kind='original' and status in ('paused','expired') and active_seconds>0 group by editor_id,match_id) s),'[]'::jsonb));
end $$;
revoke all on function tsi230_rules.state() from public,anon;
grant execute on function tsi230_rules.state() to authenticated;
create or replace function public.tsi230_rules_state()
returns jsonb language sql security invoker set search_path='' as $$select tsi230_rules.state()$$;
revoke all on function public.tsi230_rules_state() from public,anon;
grant execute on function public.tsi230_rules_state() to authenticated;
commit;
