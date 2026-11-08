-- STAGING ONLY nksqpoigywfegcbvfhoa. Legacy portfolio is empty in staging.
-- New portfolio images stay inline and private; no Storage public URL is used.
begin;
revoke all on public.portfolio from public,anon,authenticated;
update storage.buckets set public=false where id='portafolio';
create policy tsi230_portfolio_storage_closed on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'portafolio') with check(bucket_id<>'portafolio');

create table public.tsi230_portfolio (
 id uuid primary key default gen_random_uuid(), created_by uuid not null, request_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 title text not null check(length(btrim(title)) between 1 and 80),
 image text not null check(octet_length(image)<=500000 and image ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$' and length(split_part(image,',',2))%4=0),
 created_at timestamptz not null default now(), season_end timestamptz not null, consent_until timestamptz not null,
 expires_at timestamptz not null,
 consent_scope text not null default 'public_portfolio' check(consent_scope='public_portfolio'),
 consent_reference text not null check(consent_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$'),
 consent_checked_at timestamptz not null default now(), contains_minors boolean not null,
 guardian_reference text, guardian_checked_at timestamptz,
 unique(created_by,request_id),
 check(expires_at<=created_at+interval '56 days' and expires_at<=season_end and expires_at<=consent_until),
 check(consent_checked_at<=created_at),
 check((contains_minors and guardian_reference is not null and guardian_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' and guardian_checked_at is not null and guardian_checked_at<=created_at)
  or (not contains_minors and guardian_reference is null and guardian_checked_at is null))
);
alter table public.tsi230_portfolio enable row level security;
revoke all on public.tsi230_portfolio from public,anon,authenticated;
grant all on public.tsi230_portfolio to service_role;
-- Minimal tombstones survive removal of the image and its consent references.
-- A retry can never recreate a withdrawn/expired publication or reset its TTL.
create table public.tsi230_portfolio_receipts (
 actor_id uuid not null, request_id uuid not null, photo_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, retired_at timestamptz,
 primary key(actor_id,request_id)
);
alter table public.tsi230_portfolio_receipts enable row level security;
revoke all on public.tsi230_portfolio_receipts from public,anon,authenticated;
grant all on public.tsi230_portfolio_receipts to service_role;

create function public.tsi230_portfolio_read(item_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Servidor requerido' using errcode='42501'; end if;
 if $1 is null then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'expires_at',p.expires_at) order by p.created_at desc,p.id),'[]'::jsonb) into result
  from (select f.* from public.tsi230_portfolio f where f.expires_at>clock_timestamp() and f.season_end>clock_timestamp()
   and f.consent_until>clock_timestamp() and f.consent_scope='public_portfolio' and f.consent_checked_at is not null
   and (not f.contains_minors or (f.guardian_reference is not null and f.guardian_checked_at is not null)) order by f.created_at desc,f.id limit 12) p;
  return jsonb_build_object('items',result);
 end if;
 select jsonb_build_object('id',f.id,'title',f.title,'image',f.image,'expires_at',f.expires_at) into result
 from public.tsi230_portfolio f where f.id=$1 and f.expires_at>clock_timestamp() and f.season_end>clock_timestamp()
 and f.consent_until>clock_timestamp() and f.consent_scope='public_portfolio' and f.consent_checked_at is not null
 and (not f.contains_minors or (f.guardian_reference is not null and f.guardian_checked_at is not null));
 return coalesce(result,jsonb_build_object('unavailable',true));
end $$;

create function public.tsi230_portfolio_admin(actor_id uuid,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare season timestamptz; consent_end timestamptz; fingerprint text; prior public.tsi230_portfolio_receipts%rowtype; published public.tsi230_portfolio%rowtype;
begin
 if current_user<>'service_role' or not exists(select 1 from public.profiles p where p.id=$1 and p.role in ('admin','editora')) then
  raise exception 'Administración o editora requerida' using errcode='42501'; end if;
 if $2 in ('publish','revoke') then perform pg_advisory_xact_lock(230,231); end if;
 if $2='publish' then
  if payload->>'consent_confirmed' is distinct from 'true' or jsonb_typeof(payload->'contains_minors') is distinct from 'boolean'
   or (payload->>'contains_minors'='true' and payload->>'guardian_confirmed' is distinct from 'true') then
   raise exception 'Confirma la autorización pública y, cuando aplique, la del tutor' using errcode='22023'; end if;
  season:=(payload->>'season_end')::timestamptz;consent_end:=(payload->>'consent_until')::timestamptz;
  if season is null or consent_end is null or season<=clock_timestamp() or consent_end<=clock_timestamp() then
   raise exception 'Confirma fin de temporada y vigencia de autorización' using errcode='22023'; end if;
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  select p.* into prior from public.tsi230_portfolio_receipts p where p.actor_id=$1 and p.request_id=(payload->>'request_id')::uuid for update;
  if found then
   if prior.payload_hash<>fingerprint then raise exception 'El intento pertenece a otra foto o autorización' using errcode='42501'; end if;
   if prior.retired_at is not null or prior.expires_at<=clock_timestamp() or not exists(select 1 from public.tsi230_portfolio p where p.id=prior.photo_id) then
    raise exception 'La publicación fue retirada o caducó; el intento no puede republicarla' using errcode='42501'; end if;
  else
   insert into public.tsi230_portfolio(created_by,request_id,payload_hash,title,image,season_end,consent_until,expires_at,consent_reference,contains_minors,guardian_reference,guardian_checked_at)
   values($1,(payload->>'request_id')::uuid,fingerprint,btrim(payload->>'title'),payload->>'image',season,consent_end,
    least(now()+interval '56 days',season,consent_end),payload->>'consent_reference',(payload->>'contains_minors')::boolean,
    case when payload->>'contains_minors'='true' then payload->>'guardian_reference' end,
    case when payload->>'contains_minors'='true' then now() end) returning * into published;
   insert into public.tsi230_portfolio_receipts(actor_id,request_id,photo_id,payload_hash,expires_at)
   values($1,published.request_id,published.id,fingerprint,published.expires_at);
  end if;
 elsif $2='revoke' then
  update public.tsi230_portfolio_receipts r set retired_at=clock_timestamp() where r.photo_id=(payload->>'id')::uuid;
  delete from public.tsi230_portfolio p where p.id=(payload->>'id')::uuid;
 elsif $2<>'state' then raise exception 'Operación inválida' using errcode='22023'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(f)-array['image','payload_hash','request_id'] order by f.created_at desc,f.id)
  from (select p.* from public.tsi230_portfolio p order by p.created_at desc,p.id limit 50) f),'[]'::jsonb));
end $$;

create function public.tsi230_portfolio_purge() returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(230,231);
 update public.tsi230_portfolio_receipts r set retired_at=coalesce(r.retired_at,clock_timestamp()) where r.expires_at<=clock_timestamp();
 delete from public.tsi230_portfolio p where p.expires_at<=clock_timestamp() or p.season_end<=clock_timestamp() or p.consent_until<=clock_timestamp();
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.tsi230_portfolio_read(uuid),public.tsi230_portfolio_admin(uuid,text,jsonb),public.tsi230_portfolio_purge() from public,anon,authenticated;
grant execute on function public.tsi230_portfolio_read(uuid),public.tsi230_portfolio_admin(uuid,text,jsonb),public.tsi230_portfolio_purge() to service_role;
select cron.schedule('tsi230-portfolio-retention','* * * * *','select public.tsi230_portfolio_purge();');
commit;

-- STAGING ONLY: editing never renews an existing publication's lifetime.
begin;
alter table public.tsi230_portfolio add column updated_at timestamptz;
update public.tsi230_portfolio set updated_at=created_at;
alter table public.tsi230_portfolio alter column updated_at set default clock_timestamp();
alter table public.tsi230_portfolio alter column updated_at set not null;
alter table public.tsi230_portfolio add column modified_by uuid;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.tsi230_portfolio'::regclass and contype='c'
 and (pg_get_constraintdef(oid) like '%consent_checked_at%created_at%' or pg_get_constraintdef(oid) like '%guardian_checked_at%created_at%') loop
 execute format('alter table public.tsi230_portfolio drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.tsi230_portfolio add constraint tsi230_portfolio_checked_revision check(consent_checked_at<=updated_at and created_at<=updated_at);
alter table public.tsi230_portfolio add constraint tsi230_portfolio_guardian_revision check(
 (contains_minors and guardian_reference is not null and guardian_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' and guardian_checked_at is not null and guardian_checked_at<=updated_at)
 or (not contains_minors and guardian_reference is null and guardian_checked_at is null));
create table public.tsi230_portfolio_commands (
 actor_id uuid not null, request_id uuid not null, operation text not null check(operation in ('update','homepage')),
 target_id uuid, payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'), applied_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,request_id)
);
alter table public.tsi230_portfolio_commands enable row level security;
revoke all on public.tsi230_portfolio_commands from public,anon,authenticated;
grant all on public.tsi230_portfolio_commands to service_role;
create table public.tsi230_homepage (
 singleton boolean primary key default true check(singleton), photo_id uuid references public.tsi230_portfolio(id) on delete set null,
 updated_by uuid not null, updated_at timestamptz not null default clock_timestamp()
);
alter table public.tsi230_homepage enable row level security;
revoke all on public.tsi230_homepage from public,anon,authenticated;
grant all on public.tsi230_homepage to service_role;
create or replace function public.tsi230_portfolio_read(item_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Servidor requerido' using errcode='42501'; end if;
 if $1 is null then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'expires_at',p.expires_at) order by p.created_at desc,p.id),'[]'::jsonb) into result
  from (select f.* from public.tsi230_portfolio f where f.expires_at>clock_timestamp() and f.season_end>clock_timestamp()
   and f.consent_until>clock_timestamp() and f.consent_scope='public_portfolio' and f.consent_checked_at is not null
   and (not f.contains_minors or (f.guardian_reference is not null and f.guardian_checked_at is not null)) order by f.created_at desc,f.id limit 12) p;
  return jsonb_build_object('items',result,'homepage',(
   select jsonb_build_object('id',p.id,'title',p.title,'expires_at',p.expires_at)
   from public.tsi230_homepage h join public.tsi230_portfolio p on p.id=h.photo_id
   where h.singleton and p.expires_at>clock_timestamp() and p.season_end>clock_timestamp() and p.consent_until>clock_timestamp()
   and p.consent_scope='public_portfolio' and p.consent_checked_at is not null
   and (not p.contains_minors or (p.guardian_reference is not null and p.guardian_checked_at is not null))));
 end if;
 select jsonb_build_object('id',f.id,'title',f.title,'image',f.image,'expires_at',f.expires_at) into result
 from public.tsi230_portfolio f where f.id=$1 and f.expires_at>clock_timestamp() and f.season_end>clock_timestamp()
 and f.consent_until>clock_timestamp() and f.consent_scope='public_portfolio' and f.consent_checked_at is not null
 and (not f.contains_minors or (f.guardian_reference is not null and f.guardian_checked_at is not null));
 return coalesce(result,jsonb_build_object('unavailable',true));
end $$;

create or replace function public.tsi230_portfolio_admin(actor_id uuid,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare season timestamptz; consent_end timestamptz; fingerprint text; prior public.tsi230_portfolio_receipts%rowtype; published public.tsi230_portfolio%rowtype;
 command public.tsi230_portfolio_commands%rowtype; target uuid; request uuid; actor_role text; full_edit boolean; checked timestamptz;
begin
 if current_user<>'service_role' or not exists(select 1 from public.profiles p where p.id=$1 and p.role in ('admin','editora')) then
  raise exception 'Administración o editora requerida' using errcode='42501'; end if;
 select p.role into actor_role from public.profiles p where p.id=$1;
 if $2 in ('publish','revoke','update','homepage') then perform pg_advisory_xact_lock(230,231); end if;
 if $2 in ('update','homepage') then
  request:=(payload->>'request_id')::uuid;target:=(payload->>'id')::uuid;
  if request is null then raise exception 'Identificador de solicitud requerido' using errcode='22023'; end if;
  if $2='homepage' and actor_role<>'admin' then raise exception 'Solo administración modifica la portada' using errcode='42501'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('operation',$2,'payload',payload)::text,'UTF8')),'hex');
  select c.* into command from public.tsi230_portfolio_commands c where c.actor_id=$1 and c.request_id=request for update;
  if found then
   if command.operation<>$2 or command.payload_hash<>fingerprint or command.target_id is distinct from target then
    raise exception 'El intento pertenece a otra modificación' using errcode='42501'; end if;
   if $2='update' and not exists(select 1 from public.tsi230_portfolio p where p.id=target and p.expires_at>clock_timestamp()) then
    raise exception 'La publicación fue retirada o caducó; no puede restaurarse' using errcode='42501'; end if;
  else
   if exists(select 1 from public.tsi230_portfolio_receipts r where r.actor_id=$1 and r.request_id=request) then
    raise exception 'El identificador pertenece a otra publicación' using errcode='42501'; end if;
   if $2='homepage' then
    if target is not null and not exists(select 1 from public.tsi230_portfolio p where p.id=target and p.expires_at>clock_timestamp()
     and p.season_end>clock_timestamp() and p.consent_until>clock_timestamp()) then
     raise exception 'Selecciona una publicación autorizada vigente' using errcode='42501'; end if;
    insert into public.tsi230_homepage(singleton,photo_id,updated_by) values(true,target,$1)
    on conflict(singleton) do update set photo_id=excluded.photo_id,updated_by=excluded.updated_by,updated_at=clock_timestamp();
   else
    select p.* into published from public.tsi230_portfolio p where p.id=target for update;
    if not found or published.expires_at<=clock_timestamp() or published.season_end<=clock_timestamp() or published.consent_until<=clock_timestamp() then
     raise exception 'La publicación fue retirada o caducó; no puede restaurarse' using errcode='42501'; end if;
    if not (payload?'title') or length(btrim(payload->>'title')) not between 1 and 80 then raise exception 'Título público requerido' using errcode='22023'; end if;
    full_edit:=payload ?| array['image','season_end','consent_until','consent_reference','contains_minors','guardian_reference','consent_confirmed','guardian_confirmed'];
    checked:=clock_timestamp();
    if full_edit then
     if payload->>'consent_confirmed' is distinct from 'true' or jsonb_typeof(payload->'contains_minors') is distinct from 'boolean'
      or (payload->>'contains_minors'='true' and payload->>'guardian_confirmed' is distinct from 'true') then
      raise exception 'Confirma las autorizaciones vigentes de la imagen' using errcode='22023'; end if;
     season:=(payload->>'season_end')::timestamptz;consent_end:=(payload->>'consent_until')::timestamptz;
     if season is null or consent_end is null or season<=checked or consent_end<=checked then raise exception 'Confirma las fechas de autorización' using errcode='22023'; end if;
     update public.tsi230_portfolio p set title=btrim(payload->>'title'),image=case when payload?'image' then payload->>'image' else p.image end,
      season_end=season,consent_until=consent_end,expires_at=least(p.expires_at,season,consent_end),consent_reference=payload->>'consent_reference',
      contains_minors=(payload->>'contains_minors')::boolean,consent_checked_at=checked,
      guardian_reference=case when payload->>'contains_minors'='true' then payload->>'guardian_reference' end,
      guardian_checked_at=case when payload->>'contains_minors'='true' then checked end,updated_at=checked,modified_by=$1 where p.id=target;
    else
     update public.tsi230_portfolio p set title=btrim(payload->>'title'),updated_at=checked,modified_by=$1 where p.id=target;
    end if;
   end if;
   insert into public.tsi230_portfolio_commands(actor_id,request_id,operation,target_id,payload_hash) values($1,request,$2,target,fingerprint);
  end if;
 elsif $2='publish' then
  if exists(select 1 from public.tsi230_portfolio_commands c where c.actor_id=$1 and c.request_id=(payload->>'request_id')::uuid) then
   raise exception 'El identificador pertenece a otra modificación' using errcode='42501'; end if;
  if payload->>'consent_confirmed' is distinct from 'true' or jsonb_typeof(payload->'contains_minors') is distinct from 'boolean'
   or (payload->>'contains_minors'='true' and payload->>'guardian_confirmed' is distinct from 'true') then
   raise exception 'Confirma la autorización pública y, cuando aplique, la del tutor' using errcode='22023'; end if;
  season:=(payload->>'season_end')::timestamptz;consent_end:=(payload->>'consent_until')::timestamptz;
  if season is null or consent_end is null or season<=clock_timestamp() or consent_end<=clock_timestamp() then
   raise exception 'Confirma fin de temporada y vigencia de autorización' using errcode='22023'; end if;
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  select p.* into prior from public.tsi230_portfolio_receipts p where p.actor_id=$1 and p.request_id=(payload->>'request_id')::uuid for update;
  if found then
   if prior.payload_hash<>fingerprint then raise exception 'El intento pertenece a otra foto o autorización' using errcode='42501'; end if;
   if prior.retired_at is not null or prior.expires_at<=clock_timestamp() or not exists(select 1 from public.tsi230_portfolio p where p.id=prior.photo_id) then
    raise exception 'La publicación fue retirada o caducó; el intento no puede republicarla' using errcode='42501'; end if;
  else
   insert into public.tsi230_portfolio(created_by,request_id,payload_hash,title,image,season_end,consent_until,expires_at,consent_reference,contains_minors,guardian_reference,guardian_checked_at)
   values($1,(payload->>'request_id')::uuid,fingerprint,btrim(payload->>'title'),payload->>'image',season,consent_end,
    least(now()+interval '56 days',season,consent_end),payload->>'consent_reference',(payload->>'contains_minors')::boolean,
    case when payload->>'contains_minors'='true' then payload->>'guardian_reference' end,
    case when payload->>'contains_minors'='true' then now() end) returning * into published;
   insert into public.tsi230_portfolio_receipts(actor_id,request_id,photo_id,payload_hash,expires_at)
   values($1,published.request_id,published.id,fingerprint,published.expires_at);
  end if;
 elsif $2='revoke' then
  update public.tsi230_portfolio_receipts r set retired_at=clock_timestamp() where r.photo_id=(payload->>'id')::uuid;
  delete from public.tsi230_portfolio p where p.id=(payload->>'id')::uuid;
 elsif $2<>'state' then raise exception 'Operación inválida' using errcode='22023'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(f)-array['image','payload_hash','request_id'] order by f.created_at desc,f.id)
  from (select p.* from public.tsi230_portfolio p order by p.created_at desc,p.id limit 50) f),'[]'::jsonb),'homepage_id',(select h.photo_id from public.tsi230_homepage h join public.tsi230_portfolio p on p.id=h.photo_id where h.singleton and p.expires_at>clock_timestamp() and p.season_end>clock_timestamp() and p.consent_until>clock_timestamp()));
end $$;

revoke all on function public.tsi230_portfolio_read(uuid),public.tsi230_portfolio_admin(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsi230_portfolio_read(uuid),public.tsi230_portfolio_admin(uuid,text,jsonb) to service_role;
commit;

-- STAGING ONLY. Portafolio e Inicio se retiran manualmente; Tienda no cambia.
begin;
select cron.alter_job(job_id:=jobid, active:=false) from cron.job where jobname='tsi230-portfolio-retention';
alter table public.tsi230_portfolio alter column season_end drop not null;
alter table public.tsi230_portfolio alter column consent_until drop not null;
alter table public.tsi230_portfolio alter column expires_at drop not null;
alter table public.tsi230_portfolio alter column consent_reference drop not null;
alter table public.tsi230_portfolio alter column contains_minors drop not null;
alter table public.tsi230_portfolio alter column consent_checked_at drop not null;
alter table public.tsi230_portfolio alter column consent_checked_at drop default;
alter table public.tsi230_portfolio_receipts alter column expires_at drop not null;
-- Keep historical authorization references, but do not use dates for availability.
update public.tsi230_portfolio set season_end=null,consent_until=null,expires_at=null;
update public.tsi230_portfolio_receipts set expires_at=null;

create or replace function public.tsi230_portfolio_read(item_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Servidor requerido' using errcode='42501'; end if;
 if $1 is null then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'expires_at',null) order by p.created_at desc,p.id),'[]'::jsonb) into result
  from (select f.id,f.title,f.created_at from public.tsi230_portfolio f order by f.created_at desc,f.id limit 12) p;
  return jsonb_build_object('items',result,'homepage',(
   select jsonb_build_object('id',p.id,'title',p.title,'expires_at',null)
   from public.tsi230_homepage h join public.tsi230_portfolio p on p.id=h.photo_id where h.singleton));
 end if;
 select jsonb_build_object('id',f.id,'title',f.title,'image',f.image,'expires_at',null) into result
 from public.tsi230_portfolio f where f.id=$1;
 return coalesce(result,jsonb_build_object('unavailable',true));
end $$;

create or replace function public.tsi230_portfolio_admin(actor_id uuid,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare fingerprint text; prior public.tsi230_portfolio_receipts%rowtype; published public.tsi230_portfolio%rowtype;
 command public.tsi230_portfolio_commands%rowtype; target uuid; request uuid; actor_role text;
begin
 if current_user<>'service_role' or not exists(select 1 from public.profiles p where p.id=$1 and p.role in ('admin','editora')) then
  raise exception 'Administración o editora requerida' using errcode='42501'; end if;
 select p.role into actor_role from public.profiles p where p.id=$1;
 if $2 in ('publish','revoke','update','homepage') then perform pg_advisory_xact_lock(230,231); end if;
 if $2 in ('update','homepage') then
  request:=(payload->>'request_id')::uuid;target:=(payload->>'id')::uuid;
  if request is null then raise exception 'Identificador de solicitud requerido' using errcode='22023'; end if;
  if $2='homepage' and actor_role<>'admin' then raise exception 'Solo administración modifica la portada' using errcode='42501'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('operation',$2,'payload',payload)::text,'UTF8')),'hex');
  select c.* into command from public.tsi230_portfolio_commands c where c.actor_id=$1 and c.request_id=request for update;
  if found then
   if command.operation<>$2 or command.payload_hash<>fingerprint or command.target_id is distinct from target then
    raise exception 'El intento pertenece a otra modificación' using errcode='42501'; end if;
   if $2='update' and not exists(select 1 from public.tsi230_portfolio p where p.id=target) then
    raise exception 'La publicación fue retirada; no puede restaurarse' using errcode='42501'; end if;
  else
   if exists(select 1 from public.tsi230_portfolio_receipts r where r.actor_id=$1 and r.request_id=request) then
    raise exception 'El identificador pertenece a otra publicación' using errcode='42501'; end if;
   if $2='homepage' then
    if target is not null and not exists(select 1 from public.tsi230_portfolio p where p.id=target) then
     raise exception 'Selecciona una fotografía publicada' using errcode='42501'; end if;
    insert into public.tsi230_homepage(singleton,photo_id,updated_by) values(true,target,$1)
    on conflict(singleton) do update set photo_id=excluded.photo_id,updated_by=excluded.updated_by,updated_at=clock_timestamp();
   else
    select p.* into published from public.tsi230_portfolio p where p.id=target for update;
    if not found then raise exception 'La publicación fue retirada; no puede restaurarse' using errcode='42501'; end if;
    if not (payload?'title') or length(btrim(payload->>'title')) not between 1 and 80 then raise exception 'Título público requerido' using errcode='22023'; end if;
    update public.tsi230_portfolio p set title=btrim(payload->>'title'),image=case when payload?'image' then payload->>'image' else p.image end,
     updated_at=clock_timestamp(),modified_by=$1 where p.id=target;
   end if;
   insert into public.tsi230_portfolio_commands(actor_id,request_id,operation,target_id,payload_hash) values($1,request,$2,target,fingerprint);
  end if;
 elsif $2='publish' then
  request:=(payload->>'request_id')::uuid;
  if request is null then raise exception 'Identificador de solicitud requerido' using errcode='22023'; end if;
  if exists(select 1 from public.tsi230_portfolio_commands c where c.actor_id=$1 and c.request_id=request) then
   raise exception 'El identificador pertenece a otra modificación' using errcode='42501'; end if;
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  select p.* into prior from public.tsi230_portfolio_receipts p where p.actor_id=$1 and p.request_id=request for update;
  if found then
   if prior.payload_hash<>fingerprint then raise exception 'El intento pertenece a otra fotografía' using errcode='42501'; end if;
   if prior.retired_at is not null or not exists(select 1 from public.tsi230_portfolio p where p.id=prior.photo_id) then
    raise exception 'La publicación fue retirada; el intento no puede republicarla' using errcode='42501'; end if;
  else
   insert into public.tsi230_portfolio(created_by,request_id,payload_hash,title,image)
   values($1,request,fingerprint,btrim(payload->>'title'),payload->>'image') returning * into published;
   insert into public.tsi230_portfolio_receipts(actor_id,request_id,photo_id,payload_hash,expires_at)
   values($1,request,published.id,fingerprint,null);
  end if;
 elsif $2='revoke' then
  update public.tsi230_portfolio_receipts r set retired_at=clock_timestamp() where r.photo_id=(payload->>'id')::uuid;
  delete from public.tsi230_portfolio p where p.id=(payload->>'id')::uuid;
 elsif $2<>'state' then raise exception 'Operación inválida' using errcode='22023'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(f)-array['image','payload_hash','request_id'] order by f.created_at desc,f.id)
  from (select p.* from public.tsi230_portfolio p order by p.created_at desc,p.id limit 50) f),'[]'::jsonb),
  'homepage_id',(select h.photo_id from public.tsi230_homepage h join public.tsi230_portfolio p on p.id=h.photo_id where h.singleton));
end $$;

-- Defense in depth: re-enabling the old portfolio job cannot delete photographs.
create or replace function public.tsi230_portfolio_purge() returns integer
language sql security invoker set search_path='' as $$ select 0 $$;
revoke all on function public.tsi230_portfolio_read(uuid),public.tsi230_portfolio_admin(uuid,text,jsonb),public.tsi230_portfolio_purge() from public,anon,authenticated;
grant execute on function public.tsi230_portfolio_read(uuid),public.tsi230_portfolio_admin(uuid,text,jsonb),public.tsi230_portfolio_purge() to service_role;
commit;
