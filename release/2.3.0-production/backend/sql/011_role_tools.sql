-- PRODUCTION RELEASE: tantlgswituiwkxfgmsr. Available tools never change profile roles.
-- Shared operational tables retain their existing RLS: several tools use the same data.
begin;
create schema if not exists tsi230_role_tools_private;
revoke all on schema tsi230_role_tools_private from public,anon,authenticated;
grant usage on schema tsi230_role_tools_private to authenticated,service_role;

-- This registry is owned by the server. Administrators can only remove capabilities.
create function tsi230_role_tools_private.catalog(p_role text) returns text[]
language sql immutable security invoker set search_path='' as $$
 select case p_role
 when 'foto' then array['resumen','disponibilidad','partidos','micalendario','cobertura','comentarios','mipago','gastos','prestamos','avisos','notif','calendario','ubicaciones','cotizador','clientes','entregas','pendientes','borradores','fotojuego','edicionjuego','rankingjuegos','proceso','atencion']
 when 'editora' then array['resumen','intelligence','disponibilidadedicion','proceso','tienda','comentarios','mipago','gastos','prestamos','avisos','notif','calendario','clientes','entregas','pendientes','borradores','fotojuego','edicionjuego','rankingjuegos','portafolio','atencion']
 else array[]::text[] end
$$;
revoke all on function tsi230_role_tools_private.catalog(text) from public,anon,authenticated;
grant execute on function tsi230_role_tools_private.catalog(text) to service_role;

create table tsi230_role_tools_private.config (
 role text primary key check(role in ('foto','editora')),
 enabled text[] not null,
 version bigint not null default 1 check(version between 1 and 9007199254740991),
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),
 check(enabled <@ tsi230_role_tools_private.catalog(role) and 'resumen'=any(enabled) and array_position(enabled,null) is null)
);
create table tsi230_role_tools_private.receipts (
 actor_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 role text not null references tsi230_role_tools_private.config(role),
 fingerprint jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,request_id)
);
alter table tsi230_role_tools_private.config enable row level security;
alter table tsi230_role_tools_private.receipts enable row level security;
revoke all on tsi230_role_tools_private.config,tsi230_role_tools_private.receipts from public,anon,authenticated;
grant select,update on tsi230_role_tools_private.config to service_role;
grant select,insert on tsi230_role_tools_private.receipts to service_role;
insert into tsi230_role_tools_private.config(role,enabled)
select r,tsi230_role_tools_private.catalog(r) from unnest(array['foto','editora']) r;

create function public.tsi230_role_tools_command(actor_id uuid,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor_role text; target text; requested text[]; canonical text[]; expected bigint; rid uuid;
 saved tsi230_role_tools_private.config; prior tsi230_role_tools_private.receipts; fingerprint jsonb; result jsonb;
begin
 if current_user<>'service_role' or actor_id is null then raise exception 'ROLE_TOOLS_FORBIDDEN' using errcode='42501'; end if;
 -- Hold the profile while saving, so a concurrent demotion cannot authorize this write.
 select p.role into actor_role from public.profiles p where p.id=actor_id for share;
 if actor_role is null or actor_role not in ('admin','foto','editora') then raise exception 'ROLE_TOOLS_FORBIDDEN' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'ROLE_TOOLS_INVALID' using errcode='22023'; end if;
 if operation='config' then
  if payload<>'{}'::jsonb then raise exception 'ROLE_TOOLS_INVALID' using errcode='22023'; end if;
  select jsonb_build_object('catalog_version',1,'actor_role',actor_role,'roles',jsonb_object_agg(c.role,jsonb_build_object('version',c.version,'enabled',c.enabled))) into result
  from tsi230_role_tools_private.config c where actor_role='admin' or c.role=actor_role;
  return result;
 end if;
 if operation<>'save' then raise exception 'ROLE_TOOLS_INVALID' using errcode='22023'; end if;
 if actor_role<>'admin' then raise exception 'ROLE_TOOLS_FORBIDDEN' using errcode='42501'; end if;
 if (select count(*) from jsonb_object_keys(payload))<>4 or not (payload ?& array['role','enabled','expected_version','request_id'])
 or jsonb_typeof(payload->'role')<>'string' or jsonb_typeof(payload->'enabled')<>'array'
 or jsonb_typeof(payload->'expected_version')<>'number' or jsonb_typeof(payload->'request_id')<>'string'
 or (payload->>'expected_version')!~'^[1-9][0-9]{0,14}$'
 or (payload->>'request_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then raise exception 'ROLE_TOOLS_INVALID' using errcode='22023'; end if;
 target:=payload->>'role'; expected:=(payload->>'expected_version')::bigint; rid:=(payload->>'request_id')::uuid;
 if target not in ('foto','editora') or jsonb_array_length(payload->'enabled')>100
 or exists(select 1 from jsonb_array_elements(payload->'enabled') e where jsonb_typeof(e)<>'string') then
  raise exception 'ROLE_TOOLS_INVALID' using errcode='22023'; end if;
 select coalesce(array_agg(e),'{}') into requested from jsonb_array_elements_text(payload->'enabled') e;
 if not requested <@ tsi230_role_tools_private.catalog(target) or not 'resumen'=any(requested)
 or cardinality(requested)<>(select count(distinct e) from unnest(requested) e) then
  raise exception 'ROLE_TOOLS_INVALID' using errcode='22023'; end if;
 select array_agg(e order by ord) into canonical from unnest(tsi230_role_tools_private.catalog(target)) with ordinality c(e,ord) where e=any(requested);
 fingerprint:=jsonb_build_object('role',target,'enabled',canonical,'expected_version',expected);
 -- Serialize both target-role saves and request-id reuse across different target roles.
 perform pg_advisory_xact_lock(hashtextextended(actor_id::text||':'||rid::text,230));
 select c.* into saved from tsi230_role_tools_private.config c where c.role=target for update;
 select r.* into prior from tsi230_role_tools_private.receipts r where r.actor_id=$1 and r.request_id=rid;
 if found then
  if prior.role<>target or prior.fingerprint<>fingerprint then raise exception 'ROLE_TOOLS_CONFLICT' using errcode='40001'; end if;
  return prior.result; -- Lost-response retry returns the original confirmed snapshot, never reapplies it.
 end if;
 if saved.version<>expected then raise exception 'ROLE_TOOLS_CONFLICT' using errcode='40001'; end if;
 update tsi230_role_tools_private.config c set enabled=canonical,version=c.version+1,updated_by=actor_id,updated_at=clock_timestamp()
 where c.role=target returning c.* into saved;
 result:=jsonb_build_object('catalog_version',1,'actor_role',actor_role,'roles',jsonb_build_object(target,jsonb_build_object('version',saved.version,'enabled',saved.enabled)));
 insert into tsi230_role_tools_private.receipts(actor_id,request_id,role,fingerprint,result) values(actor_id,rid,target,fingerprint,result);
 return result;
end $$;
revoke all on function public.tsi230_role_tools_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tsi230_role_tools_command(uuid,text,jsonb) to service_role;

-- Private identity lookup is used by the caller-bound check and trusted game writes only.
create function tsi230_role_tools_private.actor_enabled(p_actor uuid,p_tool text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select case when p.role='admin' then true
  when p.role in ('foto','editora') then p_tool=any(c.enabled) else false end
  from public.profiles p left join tsi230_role_tools_private.config c on c.role=p.role where p.id=p_actor),false)
$$;
revoke all on function tsi230_role_tools_private.actor_enabled(uuid,text) from public,anon,authenticated;
grant execute on function tsi230_role_tools_private.actor_enabled(uuid,text) to service_role;
create function tsi230_role_tools_private.enabled(p_tool text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and tsi230_role_tools_private.actor_enabled(auth.uid(),p_tool)
$$;
revoke all on function tsi230_role_tools_private.enabled(text) from public,anon;
grant execute on function tsi230_role_tools_private.enabled(text) to authenticated;
create function public.tsi230_tool_enabled(tool_id text) returns boolean
language sql stable security invoker set search_path='' as $$ select tsi230_role_tools_private.enabled(tool_id) $$;
revoke all on function public.tsi230_tool_enabled(text) from public,anon;
grant execute on function public.tsi230_tool_enabled(text) to authenticated;
create function public.tsi230_assert_tool_enabled(tool_id text) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
 if not tsi230_role_tools_private.enabled(tool_id) then raise exception 'ROLE_TOOLS_DISABLED' using errcode='42501'; end if;
 return true;
end $$;
revoke all on function public.tsi230_assert_tool_enabled(text) from public,anon;
grant execute on function public.tsi230_assert_tool_enabled(text) to authenticated;

-- Games have a dedicated write surface, so disabled games are denied on the server.
create function tsi230_role_tools_private.guard_game_result() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not tsi230_role_tools_private.actor_enabled(new.user_id,case new.game when 'camera' then 'fotojuego' when 'editing' then 'edicionjuego' else '' end) then
  raise exception 'ROLE_TOOLS_DISABLED' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function tsi230_role_tools_private.guard_game_result() from public,anon,authenticated;
do $$ begin
 if to_regclass('tsi_training.best_results') is not null then
  execute 'create trigger tsi230_role_tools_game_guard before insert or update on tsi_training.best_results for each row execute function tsi230_role_tools_private.guard_game_result()';
 end if;
 if to_regprocedure('tsi_training.rankings(text)') is not null then
  -- Keep the guard on the private entry too, so invoking that function directly
  -- cannot bypass the public RPC check. The existing aggregation is preserved.
  alter function tsi_training.rankings(text) rename to rankings_before_role_tools;
  revoke all on function tsi_training.rankings_before_role_tools(text) from public,anon,authenticated;
  execute $f$create function tsi_training.rankings(p_game text) returns jsonb
   language plpgsql stable security definer set search_path='' as $b$
   begin
    perform public.tsi230_assert_tool_enabled('rankingjuegos');
    return tsi_training.rankings_before_role_tools(p_game);
   end $b$ $f$;
  revoke all on function tsi_training.rankings(text) from public,anon;
  grant execute on function tsi_training.rankings(text) to authenticated;
  execute $f$create or replace function public.tsi_game_rankings(p_game text default 'all') returns jsonb
   language plpgsql stable security invoker set search_path='' as $b$
   begin
    perform public.tsi230_assert_tool_enabled('rankingjuegos');
    return tsi_training.rankings(p_game);
   end $b$ $f$;
  revoke all on function public.tsi_game_rankings(text) from public,anon;
  grant execute on function public.tsi_game_rankings(text) to authenticated;
 end if;
end $$;
comment on schema tsi230_role_tools_private is 'TSI production 2.3.0 available role tools. Private configuration; existing shared-data RLS and profile roles remain authoritative.';
commit;
