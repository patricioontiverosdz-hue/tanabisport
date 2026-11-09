-- PRODUCTION RELEASE. Portafolio e Inicio se retiran manualmente; Tienda no cambia.
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
