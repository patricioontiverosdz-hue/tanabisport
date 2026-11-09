-- Production only. Additive import support; old rows and Storage remain available.
begin;
alter table public.tsi230_portfolio alter column created_by drop not null;
alter table public.tsi230_portfolio add column legacy_imported boolean not null default false;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.tsi230_portfolio'::regclass and contype='c' and pg_get_constraintdef(oid) like '%octet_length(image)%' loop
 execute format('alter table public.tsi230_portfolio drop constraint %I',c.conname);end loop;
end $$;
alter table public.tsi230_portfolio add constraint tsi230_production_portfolio_image check(
 octet_length(image)<=case when legacy_imported then 1500000 else 500000 end
 and image~'^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$' and length(split_part(image,',',2))%4=0);
create schema if not exists tsi230_release_private;
revoke all on schema tsi230_release_private from public,anon,authenticated;
grant usage on schema tsi230_release_private to service_role;
create table tsi230_release_private.portfolio_imports(
 legacy_id text primary key,photo_id uuid not null unique,image_sha256 text not null check(image_sha256~'^[0-9a-f]{64}$'),
 source_image_sha256 text not null check(source_image_sha256~'^[0-9a-f]{64}$'),
 source_fingerprint text not null check(source_fingerprint~'^[0-9a-f]{64}$'),imported_at timestamptz not null default clock_timestamp()
);
alter table tsi230_release_private.portfolio_imports enable row level security;
revoke all on tsi230_release_private.portfolio_imports from public,anon,authenticated;
grant select,insert on tsi230_release_private.portfolio_imports to service_role;
grant select,update(data) on public.portfolio to service_role; -- UPDATE(data) permits FOR SHARE row locks; import never changes legacy data.
create function public.tsi230_import_legacy_portfolio(source_id text,image_data text,image_sha256 text,source_image_sha256 text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare original jsonb; fingerprint text; recorded tsi230_release_private.portfolio_imports%rowtype; photo uuid;
begin
 if current_user<>'service_role' then raise exception 'Servidor requerido' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(230,232);
 select p.data into original from public.portfolio p where p.id=$1 for share;
 if original is null or original->>'title' is null or length(btrim(original->>'title')) not between 1 and 80 then raise exception 'Legacy photo/title missing' using errcode='22023'; end if;
 if $2 is null or $3 is null or $4 is null or $2 !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$' or octet_length($2)>1500000
 or $4 !~ '^[0-9a-f]{64}$' or encode(sha256(decode(split_part($2,',',2),'base64')),'hex') is distinct from $3 then
  raise exception 'Legacy JPEG/hash mismatch' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('id',$1,'title',original->>'title','sha256',$3,'source_sha256',$4)::text,'UTF8')),'hex');
 select i.* into recorded from tsi230_release_private.portfolio_imports i where i.legacy_id=$1;
 if found then
  if recorded.source_fingerprint<>fingerprint or recorded.image_sha256<>$3 or recorded.source_image_sha256<>$4 then raise exception 'Legacy source changed' using errcode='42501'; end if;
  if not exists(select 1 from public.tsi230_portfolio p where p.id=recorded.photo_id) then raise exception 'Imported photograph was removed; do not recreate it' using errcode='42501'; end if;
  return jsonb_build_object('imported',true,'photo_id',recorded.photo_id,'reused',true);
 end if;
 insert into public.tsi230_portfolio(created_by,request_id,payload_hash,title,image,legacy_imported)
 values(null,gen_random_uuid(),fingerprint,original->>'title',$2,true) returning id into photo;
 insert into tsi230_release_private.portfolio_imports(legacy_id,photo_id,image_sha256,source_image_sha256,source_fingerprint) values($1,photo,$3,$4,fingerprint);
 return jsonb_build_object('imported',true,'photo_id',photo,'reused',false);
end $$;
revoke all on function public.tsi230_import_legacy_portfolio(text,text,text,text) from public,anon,authenticated;
grant execute on function public.tsi230_import_legacy_portfolio(text,text,text,text) to service_role;
commit;
