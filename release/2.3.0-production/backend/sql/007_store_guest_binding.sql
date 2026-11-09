-- PRODUCTION RELEASE tantlgswituiwkxfgmsr; service-only guest/order binding.
begin;
create schema if not exists tsi230_guest_private;
revoke all on schema tsi230_guest_private from public,anon,authenticated;
grant usage on schema tsi230_guest_private to service_role;
create table tsi230_guest_private.order_contacts (
 order_id uuid primary key references public.tsi224_store_orders(id) on delete cascade,
 -- Keep an opaque historical identifier after gallery-contact retention cleanup.
 -- No contact PII or access hash is duplicated in this mapping.
 contact_id uuid not null, created_at timestamptz not null default now()
);
alter table tsi230_guest_private.order_contacts enable row level security;
revoke all on tsi230_guest_private.order_contacts from public,anon,authenticated;
grant all on tsi230_guest_private.order_contacts to service_role;

create table tsi230_guest_private.manual_receipts (
 request_id uuid primary key, contact_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 order_id text not null unique references public.orders(id) on delete cascade,
 result jsonb not null, created_at timestamptz not null default now()
);
alter table tsi230_guest_private.manual_receipts enable row level security;
revoke all on tsi230_guest_private.manual_receipts from public,anon,authenticated;
grant all on tsi230_guest_private.manual_receipts to service_role;
revoke insert on public.orders from public,anon;
grant select,insert on public.orders to service_role;
create policy tsi230_manual_order_staff_insert on public.orders as restrictive for insert to authenticated
 with check ((select auth.uid()) is not null and (select public.my_role())='admin');

-- Close the legacy public catalog path. Staff uses its existing RLS path;
-- every guest request is authenticated and scoped by the Edge gateway.
revoke select on public.tsi224_store_products,public.tsi224_store_variants,public.tsi224_store_config from anon;
create policy tsi230_product_staff_read on public.tsi224_store_products as restrictive for select to authenticated
 using ((select auth.uid()) is not null and (select public.my_role()) in ('admin','editora'));
create policy tsi230_variant_staff_read on public.tsi224_store_variants as restrictive for select to authenticated
 using ((select auth.uid()) is not null and (select public.my_role()) in ('admin','editora'));
create policy tsi230_store_config_staff_read on public.tsi224_store_config as restrictive for select to authenticated
 using ((select auth.uid()) is not null and (select public.my_role()) in ('admin','editora'));
revoke all on function public.tsi224_store_quote(jsonb),public.tsi224_store_checkout_prepare(uuid,text,jsonb,text),
 public.tsi224_store_checkout_prepare_contact(uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.tsi224_store_quote(jsonb),public.tsi224_store_checkout_prepare(uuid,text,jsonb,text),
 public.tsi224_store_checkout_prepare_contact(uuid,text,jsonb,text,text) to service_role;

create function public.tsi230_store_prepare_guest(session_hash text,request_id uuid,access_hash text,cart jsonb,email text,phone text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare permission jsonb; photo_ids text[]; contact_key uuid; prepared jsonb; existing_order uuid; bound_contact uuid; buyer text;
begin
 if current_user<>'service_role' then raise exception 'Servidor requerido' using errcode='42501'; end if;
 if $1 is null or $1 !~ '^[a-f0-9]{64}$' then raise exception 'Permiso invitado requerido' using errcode='42501'; end if;
 -- Match the old checkout's lock ordering, including concurrent idempotent retries.
 perform pg_advisory_xact_lock(224,224);
 -- Revocation cannot commit between the fresh check and the atomic order bind.
 perform s.id from public.tsi230_guest_sessions s
 join public.tsi230_guest_invitations i on i.id=s.invitation_id
 join public.tsi230_guest_contacts c on c.id=i.contact_id
 join public.tsi230_guest_folders f on f.id=c.folder_id
 where s.token_hash=$1 for share of s,i,c,f;
 if jsonb_typeof(cart) is distinct from 'array' or jsonb_array_length(cart) not between 1 and 50 then
  raise exception 'Carrito no válido' using errcode='22023'; end if;
 select coalesce(array_agg(e->>'id'),'{}'::text[]) into photo_ids from jsonb_array_elements(cart) e where e->>'kind'='photo';
 perform p.id from public.shop_items p where p.id=any(photo_ids) order by p.id for share of p;
 permission:=public.tsi230_guest_verify_items($1,photo_ids);
 if not coalesce((permission->>'allowed')::boolean,false) or (permission->>'expires_at')::timestamptz<=clock_timestamp() then
  raise exception 'El permiso invitado no autoriza este carrito' using errcode='42501'; end if;
 contact_key:=(permission->>'contact_id')::uuid;
 select c.email into buyer from public.tsi230_guest_contacts c where c.id=contact_key;
 if buyer is distinct from lower(btrim(email)) then raise exception 'Usa el correo aprobado del invitado' using errcode='42501'; end if;
 select o.id into existing_order from public.tsi224_store_orders o where o.request_id=$2 for update;
 if found then
  select b.contact_id into bound_contact from tsi230_guest_private.order_contacts b where b.order_id=existing_order;
  if bound_contact is distinct from contact_key then raise exception 'El pedido pertenece a otro permiso' using errcode='42501'; end if;
 end if;
 prepared:=public.tsi224_store_checkout_prepare_contact($2,$3,$4,$5,$6);
 insert into tsi230_guest_private.order_contacts(order_id,contact_id) values((prepared->>'id')::uuid,contact_key)
 on conflict(order_id) do nothing;
 select b.contact_id into bound_contact from tsi230_guest_private.order_contacts b where b.order_id=(prepared->>'id')::uuid;
 if bound_contact is distinct from contact_key or (permission->>'expires_at')::timestamptz<=clock_timestamp() then
  raise exception 'El pedido ya no tiene el mismo permiso' using errcode='42501'; end if;
 return prepared;
end $$;

create function public.tsi230_store_guest_order_allowed(session_hash text,order_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare permission jsonb; photo_ids text[]; bound_contact uuid;
begin
 if current_user<>'service_role' then raise exception 'Servidor requerido' using errcode='42501'; end if;
 permission:=public.tsi230_guest_verify_items($1,'{}'::text[]);
 if not coalesce((permission->>'allowed')::boolean,false) or (permission->>'expires_at')::timestamptz<=clock_timestamp() then return false; end if;
 select b.contact_id into bound_contact from tsi230_guest_private.order_contacts b where b.order_id=$2;
 -- Legacy orders are preserved, but never claimed by a new guest portal session.
 if bound_contact is distinct from (permission->>'contact_id')::uuid then return false; end if;
 select coalesce(array_agg(e->>'id'),'{}'::text[]) into photo_ids
 from public.tsi224_store_orders o cross join lateral jsonb_array_elements(o.items) e where o.id=$2 and e->>'kind'='photo';
 permission:=public.tsi230_guest_verify_items($1,photo_ids);
 return coalesce((permission->>'allowed')::boolean,false) and (permission->>'expires_at')::timestamptz>clock_timestamp();
end $$;

create function public.tsi230_store_guest_photo(session_hash text,order_id uuid,access_hash text,item_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ord jsonb; image jsonb;
begin
 if current_user<>'service_role' then raise exception 'Servidor requerido' using errcode='42501'; end if;
 if not public.tsi230_store_guest_order_allowed($1,$2) then raise exception 'Pedido no disponible con este permiso' using errcode='42501'; end if;
 if $3 is null then
  -- The verified guest/contact binding above permits recovery on another
  -- browser without recovering the old order possession token.
  select jsonb_build_object('status',o.status,'items',o.items) into ord from public.tsi224_store_orders o where o.id=$2;
 else
  ord:=public.tsi224_store_checkout_status($2,$3);
 end if;
 if ord->>'status'<>'paid' or not exists(select 1 from jsonb_array_elements(ord->'items') e where e->>'kind'='photo' and e->>'id'=$4) then
  raise exception 'La fotografía no tiene una compra confirmada' using errcode='42501'; end if;
 image:=public.tsi230_guest_catalog($1,$4,true);
 if not coalesce((image->>'allowed')::boolean,false) or coalesce(image->>'image','') !~ '^data:image/jpeg;base64,/9j/' then
  raise exception 'La fuente ya no está disponible con este permiso' using errcode='42501'; end if;
 return image;
end $$;

create function public.tsi230_store_manual_guest(session_hash text,request_id uuid,items text[],name text,contact text,note text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare permission jsonb; contact_key uuid; fingerprint text; canonical_ids text[]; cart_rows jsonb; quote jsonb; order_items jsonb;
 receipt tsi230_guest_private.manual_receipts%rowtype; order_key bigint; inserted_key text; result jsonb; attempt integer;
 delivery_name text:=btrim($4); delivery_contact text:=btrim($5); delivery_note text:=btrim(coalesce($6,''));
begin
 if current_user<>'service_role' then raise exception 'Servidor requerido' using errcode='42501'; end if;
 if $1 is null or $1 !~ '^[a-f0-9]{64}$' or $2 is null then raise exception 'Permiso invitado requerido' using errcode='42501'; end if;
 if $3 is null or cardinality($3) not between 1 and 50 or delivery_name is null or length(delivery_name) not between 1 and 120
 or delivery_contact is null or length(delivery_contact) not between 8 and 80 or length(delivery_note)>500 then
  raise exception 'Revisa las fotografías y los datos de entrega' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(224,224);
 perform s.id from public.tsi230_guest_sessions s
 join public.tsi230_guest_invitations i on i.id=s.invitation_id
 join public.tsi230_guest_contacts c on c.id=i.contact_id
 join public.tsi230_guest_folders f on f.id=c.folder_id
 where s.token_hash=$1 for share of s,i,c,f;
 perform p.id from public.shop_items p where p.id=any($3) order by p.id for share of p;
 permission:=public.tsi230_guest_verify_items($1,$3);
 if not coalesce((permission->>'allowed')::boolean,false) or (permission->>'expires_at')::timestamptz<=clock_timestamp() then
  raise exception 'El permiso invitado no autoriza estas fotos' using errcode='42501'; end if;
 contact_key:=(permission->>'contact_id')::uuid;
 select array_agg(x order by x) into canonical_ids from unnest($3) x;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('items',canonical_ids,'name',delivery_name,'contact',delivery_contact,'note',delivery_note)::text,'UTF8')),'hex');
 select r.* into receipt from tsi230_guest_private.manual_receipts r where r.request_id=$2 for update;
 if found then
  if receipt.contact_id is distinct from contact_key or receipt.payload_hash is distinct from fingerprint then
   raise exception 'La solicitud pertenece a otro contacto o selección' using errcode='42501'; end if;
  return receipt.result;
 end if;
 select jsonb_agg(jsonb_build_object('kind','photo','id',x,'quantity',1) order by x) into cart_rows from unnest(canonical_ids) x;
 quote:=public.tsi224_store_quote(cart_rows);
 if quote->>'currency'<>'MXN' or quote->'total_cents'='null'::jsonb or (quote->>'total_cents')::bigint<=0 then
  raise exception 'No se pudo confirmar el importe de las fotografías' using errcode='22023'; end if;
 select jsonb_agg(jsonb_build_object('id',coalesce(p.data->'id',to_jsonb(p.id)),'title',e->>'title','price',(e->>'unit_price_cents')::numeric/100) order by p.id)
 into order_items from jsonb_array_elements(quote->'items') e join public.shop_items p on p.id=e->>'id' where e->>'kind'='photo';
 if jsonb_array_length(order_items) is distinct from cardinality(canonical_ids) then raise exception 'Cambió la selección de fotos' using errcode='42501'; end if;
 -- 52 cryptographically random bits remain exact in JavaScript Number.
 for attempt in 1..10 loop
  order_key:=('x'||substr(replace(gen_random_uuid()::text,'-',''),1,13))::bit(52)::bigint;
  if order_key=0 then continue; end if;
  insert into public.orders(id,data) values(order_key::text,jsonb_build_object(
   'id',order_key,'date',(now() at time zone 'America/Monterrey')::date::text,
   'name',delivery_name,'contact',delivery_contact,'note',delivery_note,'items',order_items,
   'total',(quote->>'total_cents')::numeric/100,'status','nuevo','link',''))
  on conflict(id) do nothing returning id into inserted_key;
  exit when inserted_key is not null;
 end loop;
 if inserted_key is null or (permission->>'expires_at')::timestamptz<=clock_timestamp() then
  raise exception 'No se pudo confirmar el mismo permiso al guardar el pedido' using errcode='42501'; end if;
 result:=jsonb_build_object('id',order_key,'reference',order_key::text,'total',(quote->>'total_cents')::numeric/100,'status','nuevo');
 insert into tsi230_guest_private.manual_receipts(request_id,contact_id,payload_hash,order_id,result)
 values($2,contact_key,fingerprint,order_key::text,result);
 return result;
end $$;

revoke all on function public.tsi230_store_prepare_guest(text,uuid,text,jsonb,text,text),
 public.tsi230_store_guest_order_allowed(text,uuid),public.tsi230_store_guest_photo(text,uuid,text,text),
 public.tsi230_store_manual_guest(text,uuid,text[],text,text,text) from public,anon,authenticated;
grant execute on function public.tsi230_store_prepare_guest(text,uuid,text,jsonb,text,text),
 public.tsi230_store_guest_order_allowed(text,uuid),public.tsi230_store_guest_photo(text,uuid,text,text),
 public.tsi230_store_manual_guest(text,uuid,text[],text,text,text) to service_role;
commit;
