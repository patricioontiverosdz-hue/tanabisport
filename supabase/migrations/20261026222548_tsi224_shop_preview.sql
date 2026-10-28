-- TSI 2.2.4 reviewable schema source. Generate the migration with Supabase CLI.
-- Public shop_items contains only rendered previews. Source images stay behind RLS.
begin;

create table public.tsi224_shop_preview (
 id text primary key default 'shop' check (id='shop'),
 bw boolean not null default true,
 motion boolean not null default true,
 watermark boolean not null default true,
 watermark_data text,
 version bigint not null default 1 check (version>0),
 constraint tsi224_watermark_png check (watermark_data is null or (
  octet_length(watermark_data)<=300000 and
  watermark_data ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$' and
  length(split_part(watermark_data,',',2))%4=0))
);
insert into public.tsi224_shop_preview(id) values ('shop');

create table public.tsi224_shop_sources (
 item_id text primary key references public.shop_items(id) on delete cascade,
 img text not null,
 legacy boolean not null default false,
 version bigint not null default 1 check (version>0),
 constraint tsi224_source_jpeg check (octet_length(img)<=500000 and
  img ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$' and
  length(split_part(img,',',2))%4=0)
);

create table public.tsi224_shop_receipts (
 actor_id uuid not null,
 request_id uuid not null,
 request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
 result jsonb not null check (jsonb_typeof(result)='object'),
 primary key(actor_id,request_id)
);

alter table public.tsi224_shop_preview enable row level security;
alter table public.tsi224_shop_sources enable row level security;
alter table public.tsi224_shop_receipts enable row level security;
revoke all on public.tsi224_shop_preview,public.tsi224_shop_sources,public.tsi224_shop_receipts from public,anon,authenticated;
grant select on public.tsi224_shop_preview to anon,authenticated;
grant update on public.tsi224_shop_preview to authenticated;
grant select,insert,update,delete on public.tsi224_shop_sources to authenticated;
grant select,insert on public.tsi224_shop_receipts to authenticated;

create policy tsi224_preview_read on public.tsi224_shop_preview for select to anon,authenticated using (true);
create policy tsi224_preview_edit on public.tsi224_shop_preview for update to authenticated
 using ((select auth.uid()) is not null and (select public.my_role()) in ('admin','editora'))
 with check ((select auth.uid()) is not null and (select public.my_role()) in ('admin','editora'));
create policy tsi224_sources_staff on public.tsi224_shop_sources for all to authenticated
 using ((select auth.uid()) is not null and (select public.my_role()) in ('admin','editora'))
 with check ((select auth.uid()) is not null and (select public.my_role()) in ('admin','editora'));
create policy tsi224_receipts_read on public.tsi224_shop_receipts for select to authenticated
 using (actor_id=(select auth.uid()) and (select public.my_role()) in ('admin','editora'));
create policy tsi224_receipts_insert on public.tsi224_shop_receipts for insert to authenticated
 with check (actor_id=(select auth.uid()) and (select public.my_role()) in ('admin','editora'));

-- RLS permits the editor to change a preview, while this invoker trigger makes
-- the allowed UPDATE field explicit even for clients calling merge_row directly.
create function public.tsi224_shop_guard_item() returns trigger
language plpgsql security invoker set search_path='' as $$
declare role_name text;
begin
 if auth.uid() is null and current_user not in ('anon','authenticated') then
  if tg_op='DELETE' then return old; end if;return new;
 end if;
 role_name:=public.my_role();
 if auth.uid() is null or coalesce(role_name,'') not in ('admin','editora') then
  raise exception 'Sin permiso para modificar la tienda' using errcode='42501';
 end if;
 if tg_op='DELETE' then
  if role_name<>'admin' then raise exception 'Solo administración elimina fotografías' using errcode='42501'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and role_name='editora' and
  (new.id is distinct from old.id or (new.data-'img') is distinct from (old.data-'img')) then
  raise exception 'La editora solo puede actualizar la vista previa' using errcode='42501';
 end if;
 if tg_op='INSERT' then
  if jsonb_typeof(new.data) is distinct from 'object' or
   not (new.data ?& array['id','title','folder','price','img']) or
   (new.data-array['id','title','folder','price','img'])<>'{}'::jsonb or
   new.data->>'id' is distinct from new.id or
   jsonb_typeof(new.data->'title') is distinct from 'string' or
   length(btrim(new.data->>'title')) not between 1 and 60 or
   jsonb_typeof(new.data->'folder') is distinct from 'string' or
   length(btrim(new.data->>'folder')) not between 1 and 60 or
   jsonb_typeof(new.data->'price') is distinct from 'number' or
   (new.data->>'price')::numeric<0 then
   raise exception 'Formato de fotografía no válido' using errcode='22023';
  end if;
  if role_name='editora' and (new.data->>'price')::numeric<>50 then
   raise exception 'Las fotografías nuevas de editora cuestan 50' using errcode='42501';
  end if;
 end if;
 if jsonb_typeof(new.data->'img') is distinct from 'string' or
  not (octet_length(new.data->>'img')<=500000 and
   (new.data->>'img') ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$' and
   length(split_part(new.data->>'img',',',2))%4=0) then
  -- Preserve existing placeholders, but never create an empty new image.
  if tg_op<>'UPDATE' or new.data->>'img' is distinct from '' or old.data->>'img' is distinct from '' then
   raise exception 'La vista previa debe ser JPEG de máximo 500000 bytes' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.tsi224_shop_guard_item() from public,anon,authenticated;
create trigger tsi224_shop_item_fields before insert or update or delete on public.shop_items
 for each row execute function public.tsi224_shop_guard_item();
grant select,insert,update on public.shop_items to authenticated;
create policy tsi224_shop_editor_insert on public.shop_items for insert to authenticated
 with check ((select auth.uid()) is not null and (select public.my_role())='editora' and
  jsonb_typeof(data)='object' and data->>'id'=id and
  jsonb_typeof(data->'price')='number' and (data->>'price')::numeric=50 and
  octet_length(data->>'img')<=500000 and
  data->>'img' ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$');
create policy tsi224_shop_editor_update on public.shop_items for update to authenticated
 using ((select auth.uid()) is not null and (select public.my_role())='editora')
 with check ((select auth.uid()) is not null and (select public.my_role())='editora');

create function public.tsi224_shop_state() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare state jsonb;
begin
 if auth.uid() is null or coalesce(public.my_role(),'') not in ('admin','editora') then
  raise exception 'Solo administración y editora pueden gestionar las vistas previas' using errcode='42501';
 end if;
 select jsonb_build_object(
  'settings',(select to_jsonb(p)-'id' from public.tsi224_shop_preview p where p.id='shop'),
  'sources',coalesce((select jsonb_agg(jsonb_build_object(
   'id',i.id,'img',coalesce(s.img,i.data->>'img',''),'legacy',coalesce(s.legacy,true),
   'version',coalesce(s.version,0)) order by i.id)
   from public.shop_items i left join public.tsi224_shop_sources s on s.item_id=i.id),'[]'::jsonb)
 ) into state;
 return state;
end $$;
revoke all on function public.tsi224_shop_state() from public,anon;
grant execute on function public.tsi224_shop_state() to authenticated;

create function public.tsi224_shop_command(operation text,payload jsonb,request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid(); role_name text:=public.my_role();
 fingerprint text; receipt public.tsi224_shop_receipts%rowtype;
 config public.tsi224_shop_preview%rowtype; source public.tsi224_shop_sources%rowtype;
 entry jsonb; options jsonb; old_data jsonb; image text; source_image text; item_key text;
 current_version bigint; supplied_version bigint; result_state jsonb; total bigint;
begin
 if actor is null or coalesce(role_name,'') not in ('admin','editora') then
  raise exception 'Solo administración y editora pueden gestionar las vistas previas' using errcode='42501';
 end if;
 if request_id is null or operation is null or operation not in ('settings','upload') or
  jsonb_typeof(payload) is distinct from 'object' then
  raise exception 'Solicitud de vistas previas no válida' using errcode='22023';
 end if;
 fingerprint:=encode(sha256(convert_to(operation||E'\n'||payload::text,'UTF8')),'hex');
 select r.* into receipt from public.tsi224_shop_receipts r where r.actor_id=actor and r.request_id=$3;
 if found then
  if receipt.request_hash<>fingerprint then raise exception 'El identificador ya se utilizó para otra solicitud' using errcode='22023'; end if;
  return public.tsi224_shop_state();
 end if;
 select p.* into strict config from public.tsi224_shop_preview p where p.id='shop' for update;
 -- Recheck after waiting: concurrent retries must return the original result.
 select r.* into receipt from public.tsi224_shop_receipts r where r.actor_id=actor and r.request_id=$3;
 if found then
  if receipt.request_hash<>fingerprint then raise exception 'El identificador ya se utilizó para otra solicitud' using errcode='22023'; end if;
  return public.tsi224_shop_state();
 end if;
 -- Also serialize legacy direct DML while checking the complete public catalog.
 lock table public.shop_items,public.tsi224_shop_sources in share row exclusive mode;
 if jsonb_typeof(payload->'items') is distinct from 'array' then
  raise exception 'Falta la lista de fotografías' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(payload->'items') e
  where jsonb_typeof(e) is distinct from 'object' or
   jsonb_typeof(e->'id') not in ('string','number') or coalesce(e->>'id','')='' or length(e->>'id')>160 or
   jsonb_typeof(e->'source_version') is distinct from 'number' or (e->>'source_version')!~'^[0-9]+$') then
  raise exception 'Identidad o versión de fotografía no válida' using errcode='22023';
 end if;
 if (select count(*) from jsonb_array_elements(payload->'items'))<>
  (select count(distinct e->>'id') from jsonb_array_elements(payload->'items') e) then
  raise exception 'Una fotografía está repetida en la solicitud' using errcode='22023';
 end if;

 if operation='settings' then
  if (payload-array['expected_version','settings','items'])<>'{}'::jsonb or
   jsonb_typeof(payload->'expected_version') is distinct from 'number' or
   (payload->>'expected_version')!~'^[0-9]+$' then
   raise exception 'Versión de ajustes no válida' using errcode='22023';
  end if;
  if (payload->>'expected_version')::bigint<>config.version then
   raise exception 'Los ajustes cambiaron; vuelve a cargar antes de guardar' using errcode='40001';
  end if;
  options:=payload->'settings';
  if jsonb_typeof(options) is distinct from 'object' or
   not (options ?& array['bw','motion','watermark','watermark_data']) or
   (options-array['bw','motion','watermark','watermark_data'])<>'{}'::jsonb or
   jsonb_typeof(options->'bw') is distinct from 'boolean' or
   jsonb_typeof(options->'motion') is distinct from 'boolean' or
   jsonb_typeof(options->'watermark') is distinct from 'boolean' or
   (options->'watermark_data'<>'null'::jsonb and jsonb_typeof(options->'watermark_data') is distinct from 'string') then
   raise exception 'Formato de ajustes no válido' using errcode='22023';
  end if;
  select count(*) into total from public.shop_items;
  if total<>jsonb_array_length(payload->'items') or exists(
   select 1 from public.shop_items i where not exists(
    select 1 from jsonb_array_elements(payload->'items') e where e->>'id'=i.id)) then
   raise exception 'Cambió el catálogo; vuelve a cargar todas las fotografías' using errcode='40001';
  end if;
 else
  if (payload-array['settings_version','items'])<>'{}'::jsonb or
   jsonb_typeof(payload->'settings_version') is distinct from 'number' or
   (payload->>'settings_version')!~'^[0-9]+$' or
   jsonb_array_length(payload->'items') not between 1 and 10 then
   raise exception 'Carga no válida; selecciona de una a diez fotografías' using errcode='22023';
  end if;
  if (payload->>'settings_version')::bigint<>config.version then
   raise exception 'Los ajustes cambiaron; vuelve a preparar las fotografías' using errcode='40001';
  end if;
 end if;

 for entry in select e from jsonb_array_elements(payload->'items') e order by e->>'id' loop
  item_key:=entry->>'id';supplied_version:=(entry->>'source_version')::bigint;
  select i.data into old_data from public.shop_items i where i.id=item_key;
  select s.* into source from public.tsi224_shop_sources s where s.item_id=item_key;
  current_version:=coalesce(source.version,0);
  if supplied_version<>current_version then
   raise exception 'La fuente de una fotografía cambió; vuelve a cargar' using errcode='40001';
  end if;
  if operation='settings' then
   if (entry-array['id','img','source_version'])<>'{}'::jsonb or old_data is null then
    raise exception 'Fotografía de reprocesado no válida' using errcode='22023';
   end if;
   source_image:=coalesce(source.img,old_data->>'img','');
   image:=entry->>'img';
   if jsonb_typeof(entry->'img') is distinct from 'string' then
    raise exception 'Falta la vista previa procesada' using errcode='22023';
   end if;
   if source_image='' and current_version=0 then
    if image<>'' then raise exception 'Una fotografía sin fuente debe permanecer vacía' using errcode='22023'; end if;
    continue;
   end if;
   if current_version=0 then
    insert into public.tsi224_shop_sources(item_id,img,legacy,version) values(item_key,source_image,true,1);
   end if;
   update public.shop_items i set data=jsonb_set(i.data,'{img}',to_jsonb(image),true) where i.id=item_key;
  else
   if (entry-array['id','title','folder','price','img','source_img','source_version'])<>'{}'::jsonb or
    jsonb_typeof(entry->'source_img') is distinct from 'string' or
    jsonb_typeof(entry->'img') is distinct from 'string' then
    raise exception 'Formato de carga no válido' using errcode='22023';
   end if;
   source_image:=entry->>'source_img';image:=entry->>'img';
   if old_data is null then
    if supplied_version<>0 then raise exception 'Una fotografía nueva debe tener versión cero' using errcode='40001'; end if;
    -- Preserve numeric JSON IDs: the existing cart uses numeric item IDs.
    insert into public.shop_items(id,data) values(item_key,jsonb_build_object(
     'id',entry->'id','title',entry->'title','folder',entry->'folder',
     'price',case when role_name='editora' then '50'::jsonb else entry->'price' end,'img',image));
   else
    update public.shop_items i set data=jsonb_set(i.data,'{img}',to_jsonb(image),true) where i.id=item_key;
   end if;
   insert into public.tsi224_shop_sources(item_id,img,legacy,version) values(item_key,source_image,false,current_version+1)
    on conflict(item_id) do update set img=excluded.img,legacy=false,version=excluded.version;
  end if;
 end loop;
 if operation='settings' then
  update public.tsi224_shop_preview p set bw=(options->>'bw')::boolean,motion=(options->>'motion')::boolean,
   watermark=(options->>'watermark')::boolean,watermark_data=options->>'watermark_data',version=p.version+1 where p.id='shop';
 end if;
 result_state:=public.tsi224_shop_state();
 -- Receipts retain only a compact acknowledgment, never a second image catalog.
 insert into public.tsi224_shop_receipts(actor_id,request_id,request_hash,result) values(actor,$3,fingerprint,
  jsonb_build_object('operation',operation,'settings_version',result_state->'settings'->'version',
   'items',coalesce((select jsonb_agg(e->>'id') from jsonb_array_elements(payload->'items') e),'[]'::jsonb)));
 return result_state;
end $$;
revoke all on function public.tsi224_shop_command(text,jsonb,uuid) from public,anon;
grant execute on function public.tsi224_shop_command(text,jsonb,uuid) to authenticated;

-- Extend the existing admin-only encrypted-backup path; no new definer function.
create or replace function tsi210_private.backup_tables() returns text[]
language sql immutable set search_path='' as $$
 select array['profiles','settings','matches','pays','loans','expenses','bonuses','notifs','avisos','feedback','feedback_photos','orders','reservations','shop_items','portfolio',
 'editor_capacity_settings','editor_intelligence_alerts','editor_time_estimates','editor_time_events','editor_time_sessions','editor_workload_snapshots','intelligence_model_versions','photographer_availability','role_import_batches','tsi_push_preferences',
 'tsi210_teams','tsi210_team_matches','tsi210_rate_cards','tsi210_quotes','tsi210_quote_costs','tsi210_match_costs','tsi210_deliveries','tsi210_audit_log',
 'tsi224_shop_preview','tsi224_shop_sources','tsi224_shop_receipts']::text[]
$$;
revoke all on function tsi210_private.backup_tables() from public,anon,authenticated;

commit;
