-- PRODUCTION RELEASE tantlgswituiwkxfgmsr. Legacy portfolio is empty in staging.
-- New portfolio images stay inline and private; no Storage public URL is used.
begin;
-- Legacy portfolio stays readable until verified frontend cutover.
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
