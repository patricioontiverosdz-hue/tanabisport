-- Ejecutar exclusivamente al iniciar el lanzamiento de 2.1.0, a las 00:00 Monterrey.
-- Copia de seguridad dentro del servidor: no expone datos al repositorio ni al navegador.
begin;
create schema if not exists tsi210_release_safety;
revoke all on schema tsi210_release_safety from public,anon,authenticated;
create table if not exists tsi210_release_safety.snapshots (
 release text primary key, created_at timestamptz not null default now(), code_sha text not null,
 tables jsonb not null, storage_manifest jsonb not null
);
revoke all on tsi210_release_safety.snapshots from public,anon,authenticated;
alter table tsi210_release_safety.snapshots enable row level security;
do $$ declare t text; rows jsonb; data jsonb:='{}'; files jsonb; begin
 if exists(select 1 from tsi210_release_safety.snapshots where release='2.1.0') then return; end if;
 for t in select tablename from pg_tables where schemaname='public' and tablename not like 'tsi210_%' and tablename not in ('tsi_push_subscriptions','tsi_push_receipts','tsi_push_events') loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r',t) into rows;
  data:=data||jsonb_build_object(t,rows);
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'metadata',metadata)),'[]') into files from storage.objects where bucket_id='tsi-feedback';
 insert into tsi210_release_safety.snapshots(release,code_sha,tables,storage_manifest) values('2.1.0','8a18839d31ef93ca13e45342e97a45aa0eb5fcfe',data,files);
end $$;
commit;
