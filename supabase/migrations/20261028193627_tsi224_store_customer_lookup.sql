-- STAGING ONLY: customer contacts and order lookup. Existing references are preserved.
begin;

create function public.tsi224_store_phone_normalize(value text) returns text
language sql immutable security invoker set search_path='' as $$
 select regexp_replace(btrim(coalesce(value,'')),'[[:space:]().-]','','g')
$$;
revoke all on function public.tsi224_store_phone_normalize(text) from public,anon,authenticated;
grant execute on function public.tsi224_store_phone_normalize(text) to service_role;

create table public.tsi224_store_customers(
 id uuid primary key default gen_random_uuid(),
 email text not null unique check(email=lower(btrim(email)) and length(email) between 3 and 254 and email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 phone text not null default '' check(phone='' or phone~'^\+?[0-9]{10,15}$'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.tsi224_store_customers enable row level security;
revoke all on public.tsi224_store_customers from public,anon,authenticated;
grant all on public.tsi224_store_customers to service_role;
grant select on public.tsi224_store_customers to authenticated;
create policy tsi224_store_customer_service on public.tsi224_store_customers for all to service_role using(true) with check(true);
create policy tsi224_store_customer_admin_read on public.tsi224_store_customers for select to authenticated
 using((select auth.uid()) is not null and(select public.my_role())='admin');
create index tsi224_store_customers_recent on public.tsi224_store_customers(updated_at desc,id);

alter table public.tsi224_store_orders
 add column phone text not null default '' check(phone='' or phone~'^\+?[0-9]{10,15}$'),
 add column customer_id uuid references public.tsi224_store_customers(id);
create index tsi224_store_orders_customer_recent on public.tsi224_store_orders(customer_id,created_at desc,id);

-- Only copy valid contact information already present in verified historical payments.
update public.tsi224_store_orders set phone=public.tsi224_store_phone_normalize(customer->>'phone')
 where status='paid' and public.tsi224_store_phone_normalize(customer->>'phone')~'^\+?[0-9]{10,15}$';
insert into public.tsi224_store_customers(email,phone,created_at,updated_at)
 select lower(btrim(o.email)),
  coalesce((array_agg(o.phone order by (o.status='paid' and o.phone<>'') desc,o.paid_at desc nulls last,o.created_at desc,o.id))[1],''),
  min(o.created_at),max(o.updated_at)
 from public.tsi224_store_orders o group by lower(btrim(o.email));
update public.tsi224_store_orders o set customer_id=c.id from public.tsi224_store_customers c where c.email=lower(btrim(o.email));

create function public.tsi224_store_sync_customer() returns trigger
language plpgsql security invoker set search_path='' as $$
declare contact_id uuid;contact_phone text;
begin
 -- Fulfillment runs as an authenticated administrator and never needs contact writes.
 if current_user<>'service_role' then return new;end if;
 new.email:=lower(btrim(new.email));
 new.phone:=public.tsi224_store_phone_normalize(new.phone);
 if new.status='paid' and new.phone='' then
  contact_phone:=public.tsi224_store_phone_normalize(new.customer->>'phone');
  if contact_phone~'^\+?[0-9]{10,15}$' then new.phone:=contact_phone;end if;
 end if;
 if new.phone<>'' and new.phone!~'^\+?[0-9]{10,15}$' then raise exception 'Teléfono no válido' using errcode='22023';end if;
 insert into public.tsi224_store_customers(email,phone) values(new.email,new.phone)
 on conflict(email) do update set
  phone=case when excluded.phone<>'' and(new.status='paid' or tsi224_store_customers.phone='') then excluded.phone else tsi224_store_customers.phone end,
  updated_at=now()
 returning id into contact_id;
 new.customer_id:=contact_id;
 return new;
end $$;
revoke all on function public.tsi224_store_sync_customer() from public,anon,authenticated;
grant execute on function public.tsi224_store_sync_customer() to service_role;
create trigger tsi224_store_customer_contact before insert or update of email,phone,status,customer on public.tsi224_store_orders
 for each row execute function public.tsi224_store_sync_customer();

create function public.tsi224_store_checkout_prepare_contact(request_id uuid,access_hash text,cart jsonb,email text,phone text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare normalized_phone text;previous_phone text;existing boolean;prepared jsonb;ord public.tsi224_store_orders%rowtype;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor prepara pedidos' using errcode='42501';end if;
 if length(coalesce(phone,''))>80 then raise exception 'Teléfono no válido' using errcode='22023';end if;
 normalized_phone:=public.tsi224_store_phone_normalize(phone);
 if normalized_phone<>'' and normalized_phone!~'^\+?[0-9]{10,15}$' then raise exception 'Teléfono no válido' using errcode='22023';end if;
 perform pg_advisory_xact_lock(224,224);
 select o.phone into previous_phone from public.tsi224_store_orders o where o.request_id=$1 for update;existing:=found;
 if existing and previous_phone<>normalized_phone then raise exception 'La solicitud pertenece a otros datos de contacto' using errcode='42501';end if;
 prepared:=public.tsi224_store_checkout_prepare($1,$2,$3,$4);
 if not existing then
  update public.tsi224_store_orders o set phone=normalized_phone where o.id=(prepared->>'id')::uuid returning o.* into ord;
 else select o.* into ord from public.tsi224_store_orders o where o.id=(prepared->>'id')::uuid;
 end if;
 return to_jsonb(ord)-array['access_hash','input_hash','request_id','customer','shipping','tracking_carrier','tracking_number','tracking_url','delivery_link'];
end $$;
revoke all on function public.tsi224_store_checkout_prepare_contact(uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.tsi224_store_checkout_prepare_contact(uuid,text,jsonb,text,text) to service_role;

create function public.tsi224_store_order_lookup(order_reference text,email text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare ref text;buyer text;ord public.tsi224_store_orders%rowtype;result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor consulta pedidos' using errcode='42501';end if;
 ref:=upper(btrim(order_reference));buyer:=lower(btrim(email));
 if ref is null or ref!~'^TS-[A-F0-9]{16}$' or buyer is null or length(buyer)>254 or buyer!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return null;end if;
 select o.* into ord from public.tsi224_store_orders o where o.reference=ref and o.email=buyer;
 if not found then return null;end if;
 -- Session ID is internal to server reconciliation; the Edge handler applies its allowlist.
 result:=to_jsonb(ord)-array['access_hash','input_hash','request_id','customer','shipping','email','phone','customer_id'];
 if ord.status<>'paid' then result:=result-'delivery_link';end if;
 return result;
end $$;
revoke all on function public.tsi224_store_order_lookup(text,text) from public,anon,authenticated;
grant execute on function public.tsi224_store_order_lookup(text,text) to service_role;

create table public.tsi224_store_lookup_limits(
 key_hash text primary key check(key_hash~'^[a-f0-9]{64}$'),window_start timestamptz not null default now(),
 hits integer not null default 1 check(hits between 1 and 20),updated_at timestamptz not null default now()
);
create index tsi224_store_lookup_cleanup on public.tsi224_store_lookup_limits(updated_at);
alter table public.tsi224_store_lookup_limits enable row level security;
revoke all on public.tsi224_store_lookup_limits from public,anon,authenticated;
grant all on public.tsi224_store_lookup_limits to service_role;
create policy tsi224_store_lookup_service on public.tsi224_store_lookup_limits for all to service_role using(true) with check(true);

create function public.tsi224_store_lookup_rate(key_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare started timestamptz;accepted boolean;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor limita consultas' using errcode='42501';end if;
 if key_hash is null or key_hash!~'^[a-f0-9]{64}$' then raise exception 'Clave de límite no válida' using errcode='22023';end if;
 delete from public.tsi224_store_lookup_limits where updated_at<now()-interval '2 days';
 insert into public.tsi224_store_lookup_limits(key_hash) values($1)
 on conflict on constraint tsi224_store_lookup_limits_pkey do update set
  hits=case when tsi224_store_lookup_limits.window_start<=now()-interval '10 minutes' then 1 else tsi224_store_lookup_limits.hits+1 end,
  window_start=case when tsi224_store_lookup_limits.window_start<=now()-interval '10 minutes' then now() else tsi224_store_lookup_limits.window_start end,
  updated_at=now()
 where tsi224_store_lookup_limits.hits<20 or tsi224_store_lookup_limits.window_start<=now()-interval '10 minutes'
 returning window_start into started;
 accepted:=found;
 if not accepted then select r.window_start into started from public.tsi224_store_lookup_limits r where r.key_hash=$1;end if;
 return jsonb_build_object('allowed',accepted,'retry_after_seconds',case when accepted then 0 else greatest(1,ceil(extract(epoch from started+interval '10 minutes'-now()))::integer) end);
end $$;
revoke all on function public.tsi224_store_lookup_rate(text) from public,anon,authenticated;
grant execute on function public.tsi224_store_lookup_rate(text) to service_role;

create function public.tsi224_store_customer_directory(search text default '',page integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare query text;result jsonb;more boolean;offset_rows integer;
begin
 if auth.uid() is null or public.my_role() is distinct from 'admin' then raise exception 'Solo administración consulta clientes' using errcode='42501';end if;
 if page is null or page not between 0 and 1000000 or length(coalesce(search,''))>254 then raise exception 'Búsqueda o página no válida' using errcode='22023';end if;
 query:=lower(btrim(coalesce(search,'')));offset_rows:=page*25;
 with matching as (
  select c.* from public.tsi224_store_customers c
  where query='' or strpos(c.email,query)>0 or strpos(c.phone,query)>0 or exists(
   select 1 from public.tsi224_store_orders o where o.customer_id=c.id and strpos(lower(o.reference),query)>0)
  order by c.updated_at desc,c.id limit 26 offset offset_rows
 ),numbered as(select m.*,row_number() over(order by m.updated_at desc,m.id) as rn from matching m)
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'email',n.email,'phone',n.phone,'orders',coalesce((
  select jsonb_agg(jsonb_build_object('id',o.id,'reference',o.reference,'status',o.status,'fulfillment',o.fulfillment,
   'total_cents',o.total_cents,'created_at',o.created_at) order by o.created_at desc,o.id)
  from public.tsi224_store_orders o where o.customer_id=n.id),'[]'::jsonb)) order by n.updated_at desc,n.id) filter(where rn<=25),'[]'::jsonb),coalesce(bool_or(rn>25),false)
 into result,more from numbered n;
 return jsonb_build_object('customers',result,'has_more',more,'page',page);
end $$;
revoke all on function public.tsi224_store_customer_directory(text,integer) from public,anon;
grant execute on function public.tsi224_store_customer_directory(text,integer) to authenticated;

-- Extend the existing private backup allowlist without changing previous tables.
do $$ declare previous text[];begin
 previous:=tsi210_private.backup_tables();
 execute format('create or replace function tsi210_private.backup_tables() returns text[] language sql immutable set search_path='''' as %L',
  'select '||quote_literal(previous||array['tsi224_store_customers'])||'::text[]');
end $$;
revoke all on function tsi210_private.backup_tables() from public,anon,authenticated;
commit;
