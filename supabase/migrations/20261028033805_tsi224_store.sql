-- STAGING ONLY. Review source; create a timestamped migration with Supabase CLI.
begin;

create function public.tsi224_store_image_ok(value text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select value is not null and octet_length(value)<=500000 and
  (value='' or (value ~ '^data:image/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$' and length(split_part(value,',',2))%4=0))
$$;
revoke all on function public.tsi224_store_image_ok(text) from public;
grant execute on function public.tsi224_store_image_ok(text) to anon,authenticated,service_role;

create table public.tsi224_store_products(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(length(slug) between 1 and 100 and slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),
 category text not null check(category in('merch','designs')),kind text not null check(kind in('physical','digital')),
 title text not null check(length(btrim(title)) between 1 and 160),description text not null default '' check(length(description)<=4000),
 image text not null default '' check(public.tsi224_store_image_ok(image)),active boolean not null default false,
 personalization boolean not null default false,version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((category='merch' and kind='physical') or(category='designs' and kind='digital')),check(not active or image<>'')
);
create table public.tsi224_store_variants(
 id uuid primary key default gen_random_uuid(),product_id uuid not null references public.tsi224_store_products(id),
 title text not null check(length(btrim(title)) between 1 and 100),sku text not null default '' check(length(sku)<=80),
 price_cents integer check(price_cents between 1 and 99999999),stock integer not null default 0 check(stock between 0 and 1000000),
 active boolean not null default false,version bigint not null default 1 check(version>0),
 check(not active or price_cents is not null)
);
create unique index tsi224_store_variant_sku on public.tsi224_store_variants(sku) where sku<>'';
create index tsi224_store_variants_product on public.tsi224_store_variants(product_id);
create table public.tsi224_store_config(
 id text primary key default 'shop' check(id='shop'),shipping_fee_cents integer check(shipping_fee_cents between 0 and 99999999),
 payments_enabled boolean not null default false,country text not null default 'MX' check(country='MX'),version bigint not null default 1 check(version>0)
);
insert into public.tsi224_store_config(id) values('shop');
create table public.tsi224_store_orders(
 id uuid primary key default gen_random_uuid(),reference text not null unique default('TS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
 request_id uuid not null unique,access_hash text not null check(access_hash~'^[a-f0-9]{64}$'),input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in('pending','awaiting_payment','paid','expired','failed')),
 needs_review boolean not null default false,
 fulfillment text not null default 'unfulfilled' check(fulfillment in('unfulfilled','packing','shipped','delivered')),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 50),
 subtotal_cents bigint not null check(subtotal_cents>0),shipping_cents bigint not null check(shipping_cents>=0),
 total_cents bigint not null check(total_cents between 1000 and 99999999),currency text not null default 'MXN' check(currency='MXN'),
 requires_shipping boolean not null,email text not null check(length(email) between 3 and 254),
 customer jsonb not null default '{}' check(jsonb_typeof(customer)='object' and octet_length(customer::text)<=16384),
 shipping jsonb not null default '{}' check(jsonb_typeof(shipping)='object' and octet_length(shipping::text)<=16384),
 stripe_session_id text unique,paid_at timestamptz,expired_at timestamptz,
 tracking_carrier text not null default '' check(length(tracking_carrier)<=100),tracking_number text not null default '' check(length(tracking_number)<=200),
 tracking_url text not null default '' check(tracking_url='' or(tracking_url~'^https://' and length(tracking_url)<=2048)),
 delivery_link text not null default '' check(delivery_link='' or(delivery_link~'^https://' and length(delivery_link)<=2048)),
 version bigint not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(total_cents=subtotal_cents+shipping_cents),check(requires_shipping or shipping_cents=0),
 check((status='paid')=(paid_at is not null)),check(status='paid' or fulfillment='unfulfilled')
);
create index tsi224_store_orders_recent on public.tsi224_store_orders(created_at desc,id);
create table public.tsi224_store_order_lines(
 order_id uuid not null references public.tsi224_store_orders(id) on delete cascade,line_no integer not null,
 kind text not null check(kind in('photo','variant')),item_id text not null,variant_id uuid references public.tsi224_store_variants(id),
 title text not null,variant text not null default '',quantity integer not null check(quantity between 1 and 20),
 unit_price_cents bigint not null check(unit_price_cents>0),line_total_cents bigint not null,
 physical boolean not null,customization text not null default '' check(length(customization)<=500),primary key(order_id,line_no),
 check(line_total_cents=unit_price_cents*quantity),check((kind='variant')=(variant_id is not null)),check(kind<>'photo' or(quantity=1 and not physical))
);
create index tsi224_store_lines_variant on public.tsi224_store_order_lines(variant_id) where variant_id is not null;
create table public.tsi224_store_reservations(
 order_id uuid not null references public.tsi224_store_orders(id) on delete cascade,variant_id uuid not null references public.tsi224_store_variants(id),
 quantity integer not null check(quantity between 1 and 20),state text not null default 'held' check(state in('held','consumed','released')),
 primary key(order_id,variant_id)
);
create index tsi224_store_reservations_variant on public.tsi224_store_reservations(variant_id);
create table public.tsi224_store_events(
 event_id text primary key check(length(event_id) between 1 and 200),order_id uuid not null references public.tsi224_store_orders(id),
 event_hash text not null check(event_hash~'^[a-f0-9]{64}$'),payment_status text not null,session_status text not null,created_at timestamptz not null default now()
);
create index tsi224_store_events_order on public.tsi224_store_events(order_id);
create table public.tsi224_store_admin_receipts(
 actor_id uuid not null,request_id uuid not null,request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),result jsonb not null,
 primary key(actor_id,request_id)
);
create table public.tsi224_store_rate_limits(
 key_hash text primary key check(key_hash~'^[a-f0-9]{64}$'),window_start timestamptz not null default now(),
 hits integer not null default 1 check(hits between 1 and 8),updated_at timestamptz not null default now()
);
create index tsi224_store_rate_cleanup on public.tsi224_store_rate_limits(updated_at);

do $$ declare name text;begin
 foreach name in array array['tsi224_store_products','tsi224_store_variants','tsi224_store_config','tsi224_store_orders','tsi224_store_order_lines','tsi224_store_reservations','tsi224_store_events','tsi224_store_admin_receipts','tsi224_store_rate_limits'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);
  execute format('grant all on public.%I to service_role',name);
  execute format('create policy %I on public.%I for all to service_role using(true) with check(true)',name||'_service',name);
 end loop;
 foreach name in array array['tsi224_store_products','tsi224_store_variants','tsi224_store_config'] loop
  execute format('grant select on public.%I to anon,authenticated',name);
  execute format('grant insert,update on public.%I to authenticated',name);
  execute format('create policy %I on public.%I for all to authenticated using((select auth.uid()) is not null and (select public.my_role())=''admin'') with check((select auth.uid()) is not null and (select public.my_role())=''admin'')',name||'_admin',name);
 end loop;
 foreach name in array array['tsi224_store_orders','tsi224_store_order_lines','tsi224_store_reservations','tsi224_store_events'] loop
  execute format('grant select on public.%I to authenticated',name);
  execute format('create policy %I on public.%I for select to authenticated using((select auth.uid()) is not null and (select public.my_role())=''admin'')',name||'_admin_read',name);
 end loop;
end $$;
create policy tsi224_store_product_public on public.tsi224_store_products for select to anon,authenticated using(active);
create policy tsi224_store_variant_public on public.tsi224_store_variants for select to anon,authenticated
 using(active and exists(select 1 from public.tsi224_store_products p where p.id=product_id and p.active));
create policy tsi224_store_config_public on public.tsi224_store_config for select to anon,authenticated using(true);
grant select,insert on public.tsi224_store_admin_receipts to authenticated;
create policy tsi224_store_receipts_read on public.tsi224_store_admin_receipts for select to authenticated
 using(actor_id=(select auth.uid()) and(select public.my_role())='admin');
create policy tsi224_store_receipts_write on public.tsi224_store_admin_receipts for insert to authenticated
 with check(actor_id=(select auth.uid()) and(select public.my_role())='admin');
grant update(fulfillment,tracking_carrier,tracking_number,tracking_url,delivery_link,needs_review,version,updated_at) on public.tsi224_store_orders to authenticated;
create policy tsi224_store_fulfillment_admin on public.tsi224_store_orders for update to authenticated
 using((select auth.uid()) is not null and(select public.my_role())='admin')
 with check((select auth.uid()) is not null and(select public.my_role())='admin');
grant update(state) on public.tsi224_store_reservations to authenticated;
create policy tsi224_store_reservation_reconcile on public.tsi224_store_reservations for update to authenticated
 using((select auth.uid()) is not null and(select public.my_role())='admin' and state='released' and
  exists(select 1 from public.tsi224_store_orders o where o.id=order_id and o.status='paid' and o.needs_review))
 with check((select auth.uid()) is not null and(select public.my_role())='admin' and state='consumed');

create function public.tsi224_store_reacquire_stock() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' then
  if auth.uid() is null or public.my_role() is distinct from 'admin' or old.state<>'released' or new.state<>'consumed' or
   (to_jsonb(new)-'state') is distinct from(to_jsonb(old)-'state') then raise exception 'Reserva de inventario no permitida' using errcode='42501';end if;
  update public.tsi224_store_variants set stock=stock-new.quantity,version=version+1 where id=new.variant_id and stock>=new.quantity;
  if not found then raise exception 'El pago está confirmado, pero falta inventario para preparar este pedido. Repón existencias y reintenta Preparar.' using errcode='22023';end if;
 end if;
 return new;
end $$;
revoke all on function public.tsi224_store_reacquire_stock() from public,anon,authenticated;
create trigger tsi224_store_reacquire before update on public.tsi224_store_reservations for each row execute function public.tsi224_store_reacquire_stock();

create function public.tsi224_store_guard_order() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' then
  if auth.uid() is null or public.my_role() is distinct from 'admin' or
   (to_jsonb(new)-array['fulfillment','tracking_carrier','tracking_number','tracking_url','delivery_link','needs_review','version','updated_at']) is distinct from
   (to_jsonb(old)-array['fulfillment','tracking_carrier','tracking_number','tracking_url','delivery_link','needs_review','version','updated_at']) then
   raise exception 'El pago y los importes solo los confirma el servidor' using errcode='42501';end if;
  if new.status<>'paid' then raise exception 'Confirma el pago antes de preparar la entrega' using errcode='22023';end if;
  if new.needs_review or exists(select 1 from public.tsi224_store_reservations r where r.order_id=new.id and r.state<>'consumed') then
   raise exception 'Revisa y reserva el inventario antes de preparar la entrega' using errcode='22023';end if;
 end if;
 if old.status='paid' and new.status<>'paid' then raise exception 'Un pedido pagado no puede retroceder' using errcode='22023';end if;
 if new.fulfillment='shipped' and new.requires_shipping and new.tracking_url='' and(new.tracking_carrier='' or new.tracking_number='') then
  raise exception 'Agrega transportista y guía o un enlace de seguimiento' using errcode='22023';end if;
 return new;
end $$;
revoke all on function public.tsi224_store_guard_order() from public,anon,authenticated;
create trigger tsi224_store_payment_guard before update on public.tsi224_store_orders for each row execute function public.tsi224_store_guard_order();

create function public.tsi224_store_catalog_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent public.tsi224_store_products%rowtype;
begin
 if tg_table_name='tsi224_store_products' then
  if tg_op='UPDATE' and new.kind<>old.kind and exists(select 1 from public.tsi224_store_variants where product_id=old.id) then
   raise exception 'El tipo no puede cambiar cuando existen variantes; crea un producto nuevo' using errcode='22023';end if;
  if new.active and not exists(select 1 from public.tsi224_store_variants v where v.product_id=new.id and v.active and v.price_cents>0 and(new.kind='digital' or v.stock>0)) then
   raise exception 'Agrega imagen y una variante con precio e inventario antes de publicar' using errcode='22023';end if;
 else
  select * into strict parent from public.tsi224_store_products where id=new.product_id;
  if parent.kind='digital' and new.stock<>0 then raise exception 'Los diseños digitales no llevan inventario físico' using errcode='22023';end if;
  if tg_op='UPDATE' and new.product_id<>old.product_id then raise exception 'No puedes mover una variante a otro producto' using errcode='22023';end if;
  -- Available stock may become zero after a service-side reservation. Publication
  -- is validated on staff edits; reserving the last unit must remain possible.
  if current_user='authenticated' and parent.active and not(tg_op='UPDATE' and (to_jsonb(new)-array['stock','version'])=(to_jsonb(old)-array['stock','version'])) and not exists(
   select 1 from public.tsi224_store_variants v where v.product_id=parent.id and v.active and v.price_cents>0 and(parent.kind='digital' or v.stock>0)) then
   raise exception 'Archiva el producto antes de retirar su última variante disponible' using errcode='22023';end if;
 end if;
 return new;
end $$;
revoke all on function public.tsi224_store_catalog_guard() from public,anon,authenticated;
create trigger tsi224_store_product_guard after insert or update on public.tsi224_store_products for each row execute function public.tsi224_store_catalog_guard();
create trigger tsi224_store_variant_guard after insert or update on public.tsi224_store_variants for each row execute function public.tsi224_store_catalog_guard();

create function public.tsi224_store_cart_normalize(cart jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare entry jsonb;normalized jsonb:='[]';item_id text;qty integer;custom text;
begin
 if jsonb_typeof(cart) is distinct from 'array' or jsonb_array_length(cart) not between 1 and 50 then raise exception 'Selecciona de uno a cincuenta artículos' using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(cart) loop
  if jsonb_typeof(entry) is distinct from 'object' or(entry-array['kind','id','quantity','customization'])<>'{}'::jsonb or
   coalesce(entry->>'kind','') not in('photo','variant') or jsonb_typeof(entry->'id') is distinct from 'string' or
   length(coalesce(entry->>'id','')) not between 1 and 160 or jsonb_typeof(entry->'quantity') is distinct from 'number' or(entry->>'quantity')!~'^[0-9]+$' then
   raise exception 'Artículo de carrito no válido' using errcode='22023';end if;
  qty:=(entry->>'quantity')::integer;
  if qty not between 1 and 20 or(entry->>'kind'='photo' and qty<>1) then raise exception 'Cantidad de artículo no válida' using errcode='22023';end if;
  if entry ? 'customization' and jsonb_typeof(entry->'customization') is distinct from 'string' then raise exception 'Personalización no válida' using errcode='22023';end if;
  custom:=btrim(coalesce(entry->>'customization',''));if length(custom)>500 then raise exception 'La personalización es demasiado larga' using errcode='22023';end if;
  item_id:=entry->>'id';if entry->>'kind'='variant' then item_id:=(item_id::uuid)::text;end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('kind',entry->>'kind','id',item_id,'quantity',qty,'customization',custom));
 end loop;
 if(select count(distinct(value->>'kind',value->>'id',value->>'customization')) from jsonb_array_elements(normalized))<>jsonb_array_length(normalized) then
  raise exception 'Un artículo está repetido; ajusta su cantidad' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(normalized) group by value->>'kind',value->>'id' having sum((value->>'quantity')::integer)>20) then
  raise exception 'El máximo por variante es de veinte unidades' using errcode='22023';end if;
 return(select jsonb_agg(value order by value->>'kind',value->>'id',value->>'customization') from jsonb_array_elements(normalized));
end $$;
revoke all on function public.tsi224_store_cart_normalize(jsonb) from public;
grant execute on function public.tsi224_store_cart_normalize(jsonb) to anon,authenticated,service_role;

create function public.tsi224_store_quote(cart jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare entry jsonb;normalized jsonb;lines jsonb:='[]';config public.tsi224_store_config%rowtype;
 photo jsonb;variant record;unit bigint;qty integer;subtotal bigint:=0;shipping bigint:=0;physical boolean;needs_shipping boolean:=false;title text;variant_title text;
begin
 if not coalesce((select(data->>'shop')::boolean from public.settings where id='cfg'),false) then raise exception 'La tienda está pausada' using errcode='22023';end if;
 normalized:=public.tsi224_store_cart_normalize(cart);select * into strict config from public.tsi224_store_config where id='shop';
 for entry in select value from jsonb_array_elements(normalized) loop
  qty:=(entry->>'quantity')::integer;physical:=false;variant_title:='';
  if entry->>'kind'='photo' then
   select data into photo from public.shop_items where id=entry->>'id';
   if photo is null or jsonb_typeof(photo->'price') is distinct from 'number' or(photo->>'price')::numeric<=0 or
    (photo->>'price')::numeric*100<>trunc((photo->>'price')::numeric*100) or coalesce(photo->>'img','')='' or coalesce((photo->>'demo')::boolean,false) then
    raise exception 'La fotografía no está disponible' using errcode='22023';end if;
   unit:=((photo->>'price')::numeric*100)::bigint;title:=coalesce(photo->>'title','Fotografía');
   if entry->>'customization'<>'' then raise exception 'Las fotos no requieren personalización en el carrito' using errcode='22023';end if;
  else
   select v.*,p.title product_title,p.kind product_kind,p.personalization into variant from public.tsi224_store_variants v
    join public.tsi224_store_products p on p.id=v.product_id where v.id=(entry->>'id')::uuid and v.active and p.active;
   if not found or variant.price_cents is null or variant.price_cents<=0 then raise exception 'La variante no está disponible' using errcode='22023';end if;
   physical:=variant.product_kind='physical';
   if physical and variant.stock<(select sum((value->>'quantity')::integer) from jsonb_array_elements(normalized) where value->>'kind'='variant' and value->>'id'=entry->>'id') then raise exception 'No hay existencias suficientes' using errcode='22023';end if;
   if entry->>'customization'<>'' and not variant.personalization then raise exception 'Este artículo no admite personalización' using errcode='22023';end if;
   unit:=variant.price_cents;title:=variant.product_title;variant_title:=variant.title;
  end if;
  subtotal:=subtotal+unit*qty;if subtotal>99999999 then raise exception 'El pedido supera el importe permitido' using errcode='22023';end if;
  needs_shipping:=needs_shipping or physical;
  lines:=lines||jsonb_build_array(jsonb_build_object('kind',entry->>'kind','id',entry->>'id','title',title,'variant',variant_title,
   'quantity',qty,'unit_price_cents',unit,'line_total_cents',unit*qty,'physical',physical,'customization',entry->>'customization'));
 end loop;
 if needs_shipping then shipping:=config.shipping_fee_cents;end if;
 if shipping is not null and subtotal+shipping>99999999 then raise exception 'El pedido supera el importe permitido' using errcode='22023';end if;
 return jsonb_build_object('items',lines,'subtotal_cents',subtotal,'shipping_cents',shipping,'total_cents',subtotal+shipping,'currency','MXN',
  'requires_shipping',needs_shipping,'shipping_configured',not needs_shipping or config.shipping_fee_cents is not null,'payments_enabled',config.payments_enabled);
end $$;
revoke all on function public.tsi224_store_quote(jsonb) from public;
grant execute on function public.tsi224_store_quote(jsonb) to anon,authenticated,service_role;

create function public.tsi224_store_admin_state() returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or public.my_role() is distinct from 'admin' then raise exception 'Solo administración gestiona productos y pedidos' using errcode='42501';end if;
 return jsonb_build_object('products',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at,p.id) from public.tsi224_store_products p),'[]'),
  'variants',coalesce((select jsonb_agg(to_jsonb(v) order by v.product_id,v.title,v.id) from public.tsi224_store_variants v),'[]'),
  'config',(select to_jsonb(c) from public.tsi224_store_config c where id='shop'),
  'orders',coalesce((select jsonb_agg(to_jsonb(o)-array['access_hash','input_hash','request_id'] order by o.created_at desc,o.id)
   from(select * from public.tsi224_store_orders order by created_at desc,id limit 100)o),'[]'));
end $$;
revoke all on function public.tsi224_store_admin_state() from public,anon;
grant execute on function public.tsi224_store_admin_state() to authenticated;

create function public.tsi224_store_admin_command(operation text,payload jsonb,request_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid();fingerprint text;prior text;target uuid;expected bigint;product public.tsi224_store_products%rowtype;variant public.tsi224_store_variants%rowtype;config public.tsi224_store_config%rowtype;ord public.tsi224_store_orders%rowtype;
begin
 if actor is null or public.my_role() is distinct from 'admin' then raise exception 'Solo administración gestiona productos y pedidos' using errcode='42501';end if;
 if request_id is null or jsonb_typeof(payload) is distinct from 'object' or operation is null then raise exception 'Solicitud no válida' using errcode='22023';end if;
 fingerprint:=encode(sha256(convert_to(operation||E'\n'||payload::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(224,224);
 select r.request_hash into prior from public.tsi224_store_admin_receipts r where r.actor_id=actor and r.request_id=$3;
 if found then if prior<>fingerprint then raise exception 'La solicitud ya se usó con otros datos' using errcode='22023';end if;return public.tsi224_store_admin_state();end if;
 if jsonb_typeof(payload->'expected_version') is distinct from 'number' or(payload->>'expected_version')!~'^[0-9]+$' then raise exception 'Versión no válida' using errcode='22023';end if;
 expected:=(payload->>'expected_version')::bigint;
 if operation='product.save' then
  if(payload-array['id','expected_version','slug','category','kind','title','description','image','active','personalization'])<>'{}'::jsonb then raise exception 'Campo de producto no permitido' using errcode='22023';end if;
  target:=coalesce((payload->>'id')::uuid,gen_random_uuid());select * into product from public.tsi224_store_products where id=target for update;
  if coalesce(product.version,0)<>expected then raise exception 'El producto cambió; vuelve a cargar' using errcode='40001';end if;
  insert into public.tsi224_store_products(id,slug,category,kind,title,description,image,active,personalization,version)
   values(target,payload->>'slug',payload->>'category',payload->>'kind',payload->>'title',coalesce(payload->>'description',''),coalesce(payload->>'image',''),coalesce((payload->>'active')::boolean,false),coalesce((payload->>'personalization')::boolean,false),expected+1)
   on conflict(id) do update set slug=excluded.slug,category=excluded.category,kind=excluded.kind,title=excluded.title,description=excluded.description,image=excluded.image,
    active=excluded.active,personalization=excluded.personalization,version=excluded.version,updated_at=now();
 elsif operation='variant.save' then
  if(payload-array['id','expected_version','product_id','title','sku','price_cents','stock','active'])<>'{}'::jsonb then raise exception 'Campo de variante no permitido' using errcode='22023';end if;
  target:=coalesce((payload->>'id')::uuid,gen_random_uuid());select * into variant from public.tsi224_store_variants where id=target for update;
  if coalesce(variant.version,0)<>expected then raise exception 'La variante cambió; vuelve a cargar' using errcode='40001';end if;
  if jsonb_typeof(payload->'stock') is distinct from 'number' or(payload->>'stock')!~'^[0-9]+$' or
   (payload->'price_cents'<>'null'::jsonb and(jsonb_typeof(payload->'price_cents') is distinct from 'number' or(payload->>'price_cents')!~'^[0-9]+$')) then raise exception 'Precio o inventario no válido' using errcode='22023';end if;
  insert into public.tsi224_store_variants(id,product_id,title,sku,price_cents,stock,active,version)
   values(target,(payload->>'product_id')::uuid,payload->>'title',coalesce(payload->>'sku',''),(payload->>'price_cents')::integer,(payload->>'stock')::integer,coalesce((payload->>'active')::boolean,false),expected+1)
   on conflict(id) do update set product_id=excluded.product_id,title=excluded.title,sku=excluded.sku,price_cents=excluded.price_cents,stock=excluded.stock,active=excluded.active,version=excluded.version;
 elsif operation='config.save' then
  if(payload-array['expected_version','shipping_fee_cents','payments_enabled'])<>'{}'::jsonb then raise exception 'Campo de configuración no permitido' using errcode='22023';end if;
  select * into strict config from public.tsi224_store_config where id='shop' for update;
  if config.version<>expected then raise exception 'La configuración cambió' using errcode='40001';end if;
  if not(payload ?& array['shipping_fee_cents','payments_enabled']) or jsonb_typeof(payload->'payments_enabled') is distinct from 'boolean' or
   (payload->'shipping_fee_cents'<>'null'::jsonb and(jsonb_typeof(payload->'shipping_fee_cents') is distinct from 'number' or(payload->>'shipping_fee_cents')!~'^[0-9]+$')) then raise exception 'Envío o habilitación de pagos no válida' using errcode='22023';end if;
  update public.tsi224_store_config set shipping_fee_cents=(payload->>'shipping_fee_cents')::integer,payments_enabled=(payload->>'payments_enabled')::boolean,version=version+1 where id='shop';
 elsif operation='order.fulfill' then
  if(payload-array['id','expected_version','fulfillment','tracking_carrier','tracking_number','tracking_url','delivery_link'])<>'{}'::jsonb or coalesce(payload->>'fulfillment','') not in('packing','shipped','delivered') then raise exception 'Entrega no válida' using errcode='22023';end if;
  target:=(payload->>'id')::uuid;select * into ord from public.tsi224_store_orders where id=target for update;
  if not found then raise exception 'Pedido no encontrado' using errcode='22023';end if;
  if ord.version<>expected then raise exception 'El pedido cambió' using errcode='40001';end if;
  if ord.status<>'paid' then raise exception 'El pago todavía no está confirmado' using errcode='22023';end if;
  if ord.needs_review then
   if payload->>'fulfillment'<>'packing' then raise exception 'Primero prepara el pedido para reservar nuevamente el inventario' using errcode='22023';end if;
   perform r.variant_id from public.tsi224_store_reservations r where r.order_id=target and r.state='released' order by r.variant_id for update;
   update public.tsi224_store_reservations set state='consumed' where order_id=target and state='released';
  end if;
  update public.tsi224_store_orders set fulfillment=payload->>'fulfillment',tracking_carrier=coalesce(payload->>'tracking_carrier',tracking_carrier),
   tracking_number=coalesce(payload->>'tracking_number',tracking_number),tracking_url=coalesce(payload->>'tracking_url',tracking_url),delivery_link=coalesce(payload->>'delivery_link',delivery_link),needs_review=false,version=version+1,updated_at=now() where id=target;
 else raise exception 'Operación no admitida' using errcode='22023';end if;
 insert into public.tsi224_store_admin_receipts(actor_id,request_id,request_hash,result) values(actor,$3,fingerprint,jsonb_build_object('operation',operation,'id',target));
 return public.tsi224_store_admin_state();
end $$;
revoke all on function public.tsi224_store_admin_command(text,jsonb,uuid) from public,anon;
grant execute on function public.tsi224_store_admin_command(text,jsonb,uuid) to authenticated;

create function public.tsi224_store_checkout_prepare(request_id uuid,access_hash text,cart jsonb,email text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare normalized jsonb;fingerprint text;buyer text;ord public.tsi224_store_orders%rowtype;quote jsonb;entry jsonb;line_no integer:=0;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor de pagos puede preparar pedidos' using errcode='42501';end if;
 if request_id is null or access_hash is null or access_hash!~'^[a-f0-9]{64}$' then raise exception 'Identificador de compra no válido' using errcode='22023';end if;
 buyer:=lower(btrim(email));if buyer is null or length(buyer)>254 or buyer!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Correo no válido' using errcode='22023';end if;
 normalized:=public.tsi224_store_cart_normalize(cart);fingerprint:=encode(sha256(convert_to(normalized::text||E'\n'||buyer,'UTF8')),'hex');
 perform pg_advisory_xact_lock(224,224);
 if not coalesce((select payments_enabled from public.tsi224_store_config where id='shop'),false) then raise exception 'Los pagos no están habilitados' using errcode='22023';end if;
 select o.* into ord from public.tsi224_store_orders o where o.request_id=$1 for update;
 if found then
  if ord.access_hash<>$2 or ord.input_hash<>fingerprint then raise exception 'La solicitud pertenece a otro carrito o token' using errcode='42501';end if;
  return to_jsonb(ord)-array['access_hash','input_hash','request_id','customer','shipping','tracking_carrier','tracking_number','tracking_url','delivery_link'];
 end if;
 -- Catalog writers and other checkouts use this same ordering and lock.
 perform v.id from public.tsi224_store_variants v join jsonb_array_elements(normalized)e on v.id=case when e->>'kind'='variant' then(e->>'id')::uuid end order by v.id for update of v;
 quote:=public.tsi224_store_quote(normalized);
 if not(quote->>'shipping_configured')::boolean or quote->'total_cents'='null'::jsonb then raise exception 'Configura el costo de envío a domicilio' using errcode='22023';end if;
 if(quote->>'total_cents')::bigint not between 1000 and 99999999 then raise exception 'El importe permitido es de 10 a 999999.99 MXN' using errcode='22023';end if;
 insert into public.tsi224_store_orders(request_id,access_hash,input_hash,items,subtotal_cents,shipping_cents,total_cents,requires_shipping,email)
  values($1,$2,fingerprint,quote->'items',(quote->>'subtotal_cents')::bigint,(quote->>'shipping_cents')::bigint,(quote->>'total_cents')::bigint,(quote->>'requires_shipping')::boolean,buyer) returning * into ord;
 for entry in select value from jsonb_array_elements(quote->'items') loop
  line_no:=line_no+1;
  insert into public.tsi224_store_order_lines(order_id,line_no,kind,item_id,variant_id,title,variant,quantity,unit_price_cents,line_total_cents,physical,customization)
   values(ord.id,line_no,entry->>'kind',entry->>'id',case when entry->>'kind'='variant' then(entry->>'id')::uuid end,entry->>'title',entry->>'variant',
    (entry->>'quantity')::integer,(entry->>'unit_price_cents')::bigint,(entry->>'line_total_cents')::bigint,(entry->>'physical')::boolean,entry->>'customization');
 end loop;
 for entry in select jsonb_build_object('id',l.variant_id,'quantity',sum(l.quantity)) from public.tsi224_store_order_lines l
  where l.order_id=ord.id and l.physical group by l.variant_id order by l.variant_id loop
   update public.tsi224_store_variants set stock=stock-(entry->>'quantity')::integer,version=version+1 where id=(entry->>'id')::uuid and stock>=(entry->>'quantity')::integer;
   if not found then raise exception 'Las existencias cambiaron; vuelve a cotizar' using errcode='40001';end if;
   insert into public.tsi224_store_reservations(order_id,variant_id,quantity) values(ord.id,(entry->>'id')::uuid,(entry->>'quantity')::integer);
 end loop;
 return to_jsonb(ord)-array['access_hash','input_hash','request_id','customer','shipping','tracking_carrier','tracking_number','tracking_url','delivery_link'];
end $$;

create function public.tsi224_store_checkout_link(order_id uuid,session_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare ord public.tsi224_store_orders%rowtype;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor de pagos puede vincular sesiones' using errcode='42501';end if;
 if session_id is null or session_id!~'^cs_(test|live)_[A-Za-z0-9_]+$' or length(session_id)>255 then raise exception 'Sesión de pago no válida' using errcode='22023';end if;
 perform pg_advisory_xact_lock(224,224);select * into ord from public.tsi224_store_orders where id=$1 for update;
 if not found then raise exception 'Pedido no encontrado' using errcode='22023';end if;
 if ord.status in('failed','expired') and ord.stripe_session_id is null then raise exception 'La preparación terminó; inicia una compra nueva' using errcode='22023';end if;
 if ord.stripe_session_id is not null and ord.stripe_session_id<>$2 then raise exception 'El pedido ya tiene otra sesión' using errcode='22023';end if;
 if ord.stripe_session_id is null then update public.tsi224_store_orders set stripe_session_id=$2,status=case when status='pending' then'awaiting_payment' else status end,version=version+1,updated_at=now() where id=$1 returning * into ord;end if;
 return jsonb_build_object('id',ord.id,'reference',ord.reference,'status',ord.status,'stripe_session_id',ord.stripe_session_id);
end $$;

create function public.tsi224_store_checkout_event(event_id text,order_id uuid,session_id text,payment_status text,session_status text,amount_total bigint,currency text,customer jsonb,shipping jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ord public.tsi224_store_orders%rowtype;fingerprint text;prior public.tsi224_store_events%rowtype;held record;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor verifica pagos' using errcode='42501';end if;
 if event_id is null or length(event_id) not between 1 and 200 or session_id is null or session_id!~'^cs_(test|live)_[A-Za-z0-9_]+$' or
  coalesce(payment_status,'') not in('paid','unpaid','no_payment_required','failed') or coalesce(session_status,'') not in('open','complete','expired') or
  jsonb_typeof(coalesce(customer,'{}'))<>'object' or jsonb_typeof(coalesce(shipping,'{}'))<>'object' then raise exception 'Evento de pago no válido' using errcode='22023';end if;
 if payment_status='failed' and session_status<>'complete' then raise exception 'El fallo asíncrono requiere sesión finalizada y verificada' using errcode='22023';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array($2,$3,$4,$5,$6,lower($7),coalesce($8,'{}'),coalesce($9,'{}'))::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(224,224);select * into ord from public.tsi224_store_orders where id=$2 for update;
 if not found then raise exception 'Pedido no encontrado' using errcode='22023';end if;
 if ord.total_cents is distinct from $6 or lower($7) is distinct from 'mxn' or(ord.stripe_session_id is not null and ord.stripe_session_id<>$3) then
  raise exception 'Importe, moneda o sesión no coincide con el pedido' using errcode='22023';end if;
 select e.* into prior from public.tsi224_store_events e where e.event_id=$1;
 if found then if prior.order_id<>$2 or prior.event_hash<>fingerprint then raise exception 'El evento ya se utilizó con otros datos' using errcode='22023';end if;
  return jsonb_build_object('id',ord.id,'status',ord.status,'duplicate',true);end if;
 if payment_status='paid' then
  if session_status<>'complete' then raise exception 'La sesión pagada no está completa' using errcode='22023';end if;
  if ord.requires_shipping and (coalesce(shipping->'address'->>'country','')<>'MX' or
   btrim(coalesce(shipping->'address'->>'line1',''))='' or btrim(coalesce(shipping->'address'->>'city',''))='' or
   btrim(coalesce(shipping->'address'->>'state',''))='' or coalesce(shipping->'address'->>'postal_code','')!~'^[0-9]{5}$') then
   raise exception 'Falta el domicilio verificado de entrega en México: calle, ciudad, estado y código postal' using errcode='22023';end if;
  if ord.status<>'paid' then
   update public.tsi224_store_orders set status='paid',paid_at=now(),stripe_session_id=$3,customer=coalesce($8,'{}'),shipping=coalesce($9,'{}'),
    needs_review=exists(select 1 from public.tsi224_store_reservations r where r.order_id=$2 and r.state='released'),version=version+1,updated_at=now() where id=$2;
   update public.tsi224_store_reservations r set state='consumed' where r.order_id=$2 and r.state='held';
  end if;
 elsif (session_status='expired' or(payment_status='failed' and session_status='complete')) and ord.status<>'paid' then
  for held in select * from public.tsi224_store_reservations r where r.order_id=$2 and r.state='held' order by r.variant_id for update loop
   update public.tsi224_store_variants set stock=stock+held.quantity,version=version+1 where id=held.variant_id;
   update public.tsi224_store_reservations r set state='released' where r.order_id=$2 and r.variant_id=held.variant_id and r.state='held';
  end loop;
  if ord.status not in('expired','failed') then update public.tsi224_store_orders set status=case when payment_status='failed' then'failed' else'expired' end,expired_at=now(),stripe_session_id=$3,version=version+1,updated_at=now() where id=$2;end if;
 else
  if ord.stripe_session_id is null then update public.tsi224_store_orders set stripe_session_id=$3,status='awaiting_payment',version=version+1,updated_at=now() where id=$2;end if;
 end if;
 insert into public.tsi224_store_events(event_id,order_id,event_hash,payment_status,session_status) values($1,$2,fingerprint,$4,$5);
 return jsonb_build_object('id',ord.id,'status',(select status from public.tsi224_store_orders where id=$2),'duplicate',false);
end $$;

-- Only call after Stripe definitively rejected session creation (HTTP 4xx).
-- Network errors, 5xx and ambiguous links must be retried, never aborted.
create function public.tsi224_store_checkout_abort(order_id uuid,access_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare ord public.tsi224_store_orders%rowtype;held record;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor puede anular una preparación rechazada' using errcode='42501';end if;
 perform pg_advisory_xact_lock(224,224);
 select o.* into ord from public.tsi224_store_orders o where o.id=$1 and o.access_hash=$2 for update;
 if not found then raise exception 'No se pudo verificar el acceso al pedido' using errcode='42501';end if;
 if ord.status='failed' and ord.stripe_session_id is null then return jsonb_build_object('id',ord.id,'status',ord.status,'aborted',true);end if;
 if ord.status<>'pending' or ord.stripe_session_id is not null then raise exception 'La sesión puede existir; reconcilia el pago antes de liberar inventario' using errcode='22023';end if;
 for held in select * from public.tsi224_store_reservations where tsi224_store_reservations.order_id=$1 and state='held' order by variant_id for update loop
  update public.tsi224_store_variants set stock=stock+held.quantity,version=version+1 where id=held.variant_id;
  update public.tsi224_store_reservations set state='released' where tsi224_store_reservations.order_id=$1 and variant_id=held.variant_id and state='held';
 end loop;
 update public.tsi224_store_orders set status='failed',version=version+1,updated_at=now() where id=$1;
 return jsonb_build_object('id',ord.id,'status','failed','aborted',true);
end $$;

create function public.tsi224_store_checkout_rate(key_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare started timestamptz;accepted boolean;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor aplica límites de compra' using errcode='42501';end if;
 if key_hash is null or key_hash!~'^[a-f0-9]{64}$' then raise exception 'Clave de límite no válida' using errcode='22023';end if;
 delete from public.tsi224_store_rate_limits where updated_at<now()-interval '2 days';
 insert into public.tsi224_store_rate_limits(key_hash) values($1)
 on conflict on constraint tsi224_store_rate_limits_pkey do update set
  hits=case when tsi224_store_rate_limits.window_start<=now()-interval '10 minutes' then 1 else tsi224_store_rate_limits.hits+1 end,
  window_start=case when tsi224_store_rate_limits.window_start<=now()-interval '10 minutes' then now() else tsi224_store_rate_limits.window_start end,updated_at=now()
 where tsi224_store_rate_limits.hits<8 or tsi224_store_rate_limits.window_start<=now()-interval '10 minutes'
 returning window_start into started;
 accepted:=found;
 if not accepted then select r.window_start into started from public.tsi224_store_rate_limits r where r.key_hash=$1;end if;
 return jsonb_build_object('allowed',accepted,'retry_after_seconds',case when accepted then 0 else greatest(1,ceil(extract(epoch from started+interval '10 minutes'-now()))::integer) end);
end $$;

create function public.tsi224_store_checkout_status(order_id uuid,access_hash text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare ord public.tsi224_store_orders%rowtype;result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Solo el servidor consulta pedidos de compradores' using errcode='42501';end if;
 select * into ord from public.tsi224_store_orders where id=$1 and tsi224_store_orders.access_hash=$2;
 if not found then raise exception 'No se pudo verificar el acceso al pedido' using errcode='42501';end if;
 result:=to_jsonb(ord)-array['access_hash','input_hash','request_id','customer','shipping'];
 if ord.status<>'paid' then result:=result-'delivery_link';end if;
 return result;
end $$;

revoke all on function public.tsi224_store_checkout_prepare(uuid,text,jsonb,text),public.tsi224_store_checkout_link(uuid,text),public.tsi224_store_checkout_event(text,uuid,text,text,text,bigint,text,jsonb,jsonb),public.tsi224_store_checkout_status(uuid,text) from public,anon,authenticated;
grant execute on function public.tsi224_store_checkout_prepare(uuid,text,jsonb,text),public.tsi224_store_checkout_link(uuid,text),public.tsi224_store_checkout_event(text,uuid,text,text,text,bigint,text,jsonb,jsonb),public.tsi224_store_checkout_status(uuid,text) to service_role;
revoke all on function public.tsi224_store_checkout_rate(text) from public,anon,authenticated;
grant execute on function public.tsi224_store_checkout_rate(text) to service_role;
revoke all on function public.tsi224_store_checkout_abort(uuid,text) from public,anon,authenticated;
grant execute on function public.tsi224_store_checkout_abort(uuid,text) to service_role;

-- Drafts only: every price is unset, every physical stock count is zero.
with drafts(slug,category,kind,title,description,personalization) as(values
 ('playera-aficion','merch','physical','Playera de afición','Completar material, tallas, colores, portada y precio.',false),
 ('playera-familia','merch','physical','Playera para familia','Completar diseño familiar, tallas, colores y precio.',true),
 ('playera-personalizada','merch','physical','Playera con nombre y número','Definir área de impresión y opciones de personalización.',true),
 ('sudadera-aficion','merch','physical','Sudadera de afición','Completar material, tallas, colores y precio.',false),
 ('sudadera-personalizada','merch','physical','Sudadera personalizada','Definir bordado o impresión, tallas y precio.',true),
 ('gorra-deportiva','merch','physical','Gorra deportiva','Completar modelo, colores, portada y precio.',false),
 ('termo-aficion','merch','physical','Termo de afición','Completar capacidad, acabado y precio.',true),
 ('taza-personalizada','merch','physical','Taza personalizada','Completar capacidad, diseño y precio.',true),
 ('bolsa-tote','merch','physical','Bolsa tote','Completar material, medidas, portada y precio.',true),
 ('llavero-personalizado','merch','physical','Llavero personalizado','Completar material, forma, diseño y precio.',true),
 ('impresion-fotografica','merch','physical','Impresión fotográfica','Completar papel, medidas, acabado y precio.',true),
 ('banner-equipo','merch','physical','Banner de equipo','Completar material, medidas, terminación y precio.',true),
 ('poster-digital','designs','digital','Póster digital de jugador','Definir tamaño de entrega, revisión y precio.',true),
 ('fondo-pantalla','designs','digital','Fondo de pantalla personalizado','Definir formatos para teléfono y precio.',true),
 ('tarjeta-jugador','designs','digital','Tarjeta digital de jugador','Completar plantilla, datos y precio.',true),
 ('collage-partido','designs','digital','Collage digital del partido','Definir cantidad de fotos, tamaño y precio.',true),
 ('kit-diseno-equipo','designs','digital','Kit de diseño para equipo','Definir piezas, formatos y precio.',true),
 ('grafico-redes','designs','digital','Diseño para redes sociales','Definir pieza, medidas, revisión y precio.',true)
),inserted as(insert into public.tsi224_store_products(slug,category,kind,title,description,personalization)
 select * from drafts returning id)
insert into public.tsi224_store_variants(product_id,title,sku,price_cents,stock,active)
 select id,'Por definir','',null,0,false from inserted;

-- Add store tables without losing any table already in the private backup list.
do $$ declare previous text[];begin
 previous:=tsi210_private.backup_tables();
 execute format('create or replace function tsi210_private.backup_tables() returns text[] language sql immutable set search_path='''' as %L',
  'select '||quote_literal(previous||array['tsi224_store_products','tsi224_store_variants','tsi224_store_config','tsi224_store_orders','tsi224_store_order_lines','tsi224_store_reservations','tsi224_store_events','tsi224_store_admin_receipts'])||'::text[]');
end $$;
revoke all on function tsi210_private.backup_tables() from public,anon,authenticated;
commit;
