-- TSI 2.2.5: ejecutar SOLO en producción tantlgswituiwkxfgmsr al iniciar
-- el lanzamiento del 2 de noviembre de 2026, 00:00 America/Monterrey.
-- Aplicar con apply_migration, nombre tsi225_predeploy_safety.
-- La captura queda privada dentro de PostgreSQL; nunca exportar su contenido.
-- Incluye datos operativos public (también tsi210_*), definiciones anteriores
-- y manifiesto de Storage. No copia Auth, secretos del servidor ni bytes de archivos.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $window$
begin
 if clock_timestamp() < timestamptz '2026-11-02 06:00:00+00' then
  raise exception 'TSI 2.2.5: no iniciar producción antes de las 00:00 America/Monterrey del 2 de noviembre';
 end if;
end $window$;

create schema if not exists tsi225_release_safety;
revoke all on schema tsi225_release_safety from public, anon, authenticated;
create table if not exists tsi225_release_safety.snapshots (
 release text primary key,
 created_at timestamptz not null default now(),
 code_sha text not null,
 tables jsonb not null,
 storage_manifest jsonb not null,
 functions jsonb not null,
 match_triggers jsonb not null,
 excluded_tables text[] not null
);
revoke all on tsi225_release_safety.snapshots from public, anon, authenticated;
alter table tsi225_release_safety.snapshots enable row level security;

do $snapshot$
declare
 base_sha constant text := 'e7482bb97a9c6f6d90a44912a603b097df3a64a2';
 signatures constant text[] := array[
  'public.auto_assign_editora()',
  'public.tsi11_command(text,jsonb,uuid)',
  'public.tsi11_photo_availability_state()',
  'public.tsi11_state(uuid)',
  'tsi210_private.backup_tables()'
 ];
 expected_md5 constant text[] := array[
  '179b09746dd443110edaee11d888e279',
  '5325f6c08460b5836330e024153778a5',
  '36d27fd683183d1c6c6e46596ca792f8',
  '2ac3dbceaba41347fac9423ef19b1556',
  '5c25b054f1fa0fc4e8348b127ff3a471'
 ];
 -- Mismo límite de seguridad del respaldo 2.1.0: no copiar endpoints,
 -- claves de suscripción push ni su cola de transporte.
 excluded constant text[] := array['tsi_push_subscriptions','tsi_push_receipts','tsi_push_events'];
 table_queries text;
 data_json jsonb := '{}'::jsonb;
 files_json jsonb;
 functions_json jsonb := '{}'::jsonb;
 triggers_json jsonb;
 definition text;
 function_oid oid;
 idx integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('tsi225_release_safety:2.2.5',225));
 -- Reintentos conservan la primera captura, incluso después de migrar funciones.
 if exists(select 1 from tsi225_release_safety.snapshots where release='2.2.5') then
  if exists(select 1 from tsi225_release_safety.snapshots
            where release='2.2.5'
              and (code_sha<>base_sha or not (functions ?& signatures))) then
   raise exception 'TSI 2.2.5: existe una captura con metadata inesperada; revisar sin sobrescribir';
  end if;
  return;
 end if;

 -- Los MD5 corresponden a pg_get_functiondef observado en producción durante
 -- la preparación. Ante deriva, toda la transacción se revierte sin capturar.
 for idx in 1..array_length(signatures,1) loop
  function_oid := to_regprocedure(signatures[idx]);
  if function_oid is null then
   raise exception 'TSI 2.2.5: falta la función previa %',signatures[idx];
  end if;
  definition := pg_get_functiondef(function_oid);
  if md5(definition)<>expected_md5[idx] then
   raise exception 'TSI 2.2.5: deriva en definición previa de %',signatures[idx];
  end if;
  functions_json := functions_json || jsonb_build_object(signatures[idx],
   jsonb_build_object('definition',definition,'md5',md5(definition),
    'owner',pg_get_userbyid((select proowner from pg_proc where oid=function_oid)),
    'acl',(select to_jsonb(proacl) from pg_proc where oid=function_oid)));
 end loop;

 -- Una sola sentencia SELECT captura todas las tablas, Storage y triggers
 -- con la misma vista MVCC incluso en READ COMMITTED. No requiere cambiar
 -- el aislamiento de apply_migration ni bloquea escrituras de usuarios.
 select string_agg(format(
   'select %L::text as table_name, coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) as table_rows from public.%I r',
   tablename,tablename),' union all ' order by tablename)
  into table_queries from pg_tables
  where schemaname='public' and not (tablename=any(excluded));
 if table_queries is null then
  raise exception 'TSI 2.2.5: no se encontraron tablas operativas public';
 end if;
 execute $capture$
  select
   (select coalesce(jsonb_object_agg(table_name,table_rows),'{}'::jsonb) from (
 $capture$ || table_queries || $capture$
   ) captured_tables),
   (select coalesce(jsonb_agg(jsonb_build_object(
     'bucket',bucket_id,'path',name,'metadata',metadata) order by bucket_id,name),'[]'::jsonb)
    from storage.objects),
   (select coalesce(jsonb_agg(jsonb_build_object(
     'name',tgname,'definition',pg_get_triggerdef(oid,true),'enabled',tgenabled)
     order by tgname),'[]'::jsonb)
    from pg_trigger where tgrelid='public.matches'::regclass and not tgisinternal)
 $capture$ into data_json,files_json,triggers_json;

 insert into tsi225_release_safety.snapshots
  (release,code_sha,tables,storage_manifest,functions,match_triggers,excluded_tables)
 values('2.2.5',base_sha,data_json,files_json,functions_json,triggers_json,excluded);
end $snapshot$;
commit;

-- Verificación posterior permitida: solo metadata, nunca tables/functions/storage_manifest.
-- select release,created_at,code_sha,
--  (select count(*) from jsonb_object_keys(functions)) as function_count
-- from tsi225_release_safety.snapshots where release='2.2.5';
