-- Transactional verification after the customer/lookup migration.
-- Synthetic contacts and orders only. All changes are rolled back; no real charge.
begin;
set local statement_timeout='90s';
do $verify$
declare
 admin_id uuid:=gen_random_uuid();editor_id uuid:=gen_random_uuid();actor uuid;
 request_id uuid:=gen_random_uuid();access_hash text:=repeat('d',64);rate_key text:=encode(sha256(gen_random_uuid()::text::bytea),'hex');
 buyer text:='lookup-'||gen_random_uuid()||'@example.invalid';prefix text:='lookup-page-'||gen_random_uuid();
 photo_id text:='922499990000002';cart jsonb;first_order jsonb;second_order jsonb;legacy_order jsonb;result jsonb;directory jsonb;contact uuid;
 blocked boolean;number integer;current_version bigint;function_oid oid;
begin
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 foreach actor in array array[admin_id,editor_id] loop
  insert into auth.users(id,email,aud,role,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
   values(actor,'lookup-user-'||actor||'@example.invalid','authenticated','authenticated','',now(),'{}','{}',now(),now());
 end loop;
 insert into public.profiles(id,email,name,role) values
  (admin_id,'lookup-user-'||admin_id||'@example.invalid','Synthetic customer admin','admin'),
  (editor_id,'lookup-user-'||editor_id||'@example.invalid','Synthetic customer editor','editora')
 on conflict(id) do update set email=excluded.email,name=excluded.name,role=excluded.role;
 foreach function_oid in array array[
  'public.tsi224_store_checkout_prepare_contact(uuid,text,jsonb,text,text)'::regprocedure,
  'public.tsi224_store_order_lookup(text,text)'::regprocedure,
  'public.tsi224_store_lookup_rate(text)'::regprocedure,
  'public.tsi224_store_customer_directory(text,integer)'::regprocedure,
  'public.tsi224_store_sync_customer()'::regprocedure] loop
  if(select prosecdef from pg_proc where oid=function_oid) then raise exception 'Customer function unexpectedly uses SECURITY DEFINER';end if;
 end loop;
 if exists(select 1 from pg_class where oid in('public.tsi224_store_customers'::regclass,'public.tsi224_store_lookup_limits'::regclass) and not relrowsecurity) then
  raise exception 'Customer or rate-limit table does not enable RLS';end if;
 if not(tsi210_private.backup_tables() @> array['tsi224_store_customers','tsi224_store_orders']) then raise exception 'Customer records missing from private backups';end if;

 perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 update public.settings set data=data||'{"shop":true}' where id='cfg';
 insert into public.shop_items(id,data) values(photo_id,jsonb_build_object('id',photo_id::bigint,'title','Synthetic lookup photo','folder','Lookup fixture','price',50,'img','data:image/jpeg;base64,/9j/2Q=='));
 update public.tsi224_store_config set payments_enabled=true where id='shop';
 cart:=jsonb_build_array(jsonb_build_object('kind','photo','id',photo_id,'quantity',1));

 execute 'set local role service_role';
 first_order:=public.tsi224_store_checkout_prepare_contact(request_id,access_hash,cart,upper(buyer),' +52 (81) 1234-5678 ');
 if first_order->>'phone'<>'+528112345678' or first_order->>'email'<>buyer then raise exception 'Contact normalization failed';end if;
 if first_order ? 'access_hash' or first_order ? 'input_hash' or first_order ? 'request_id' then raise exception 'Prepared contact exposed token binding';end if;
 if first_order->>'reference'!~'^TS-[A-F0-9]{16}$' then raise exception 'Order reference changed format';end if;
 contact:=(first_order->>'customer_id')::uuid;
 if contact is null or(select phone from public.tsi224_store_customers where id=contact)<>'+528112345678' then raise exception 'New order did not create its customer contact';end if;
 result:=public.tsi224_store_checkout_prepare_contact(request_id,access_hash,cart,buyer,'+528112345678');
 if result->>'id'<>first_order->>'id' or(select count(*) from public.tsi224_store_customers where email=buyer)<>1 then raise exception 'Contact retry created a duplicate customer or order';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_prepare_contact(request_id,access_hash,cart,buyer,'8111111111');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Request ID accepted a different telephone';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_prepare_contact(gen_random_uuid(),access_hash,cart,buyer,'123abc');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Malformed telephone was accepted';end if;

 second_order:=public.tsi224_store_checkout_prepare_contact(gen_random_uuid(),access_hash,cart,buyer,'81 8765 4321');
 if second_order->>'customer_id'<>contact::text then raise exception 'A matching normalized email created another customer';end if;
 if(select phone from public.tsi224_store_customers where id=contact)<>'+528112345678' then raise exception 'Pending checkout overwrote an existing customer telephone';end if;
 result:=public.tsi224_store_order_lookup(second_order->>'reference',buyer);
 if result ? 'delivery_link' then raise exception 'Unpaid lookup exposes a digital delivery';end if;
 perform public.tsi224_store_checkout_event('evt_lookup_'||gen_random_uuid(),(second_order->>'id')::uuid,'cs_test_lookup_second','paid','complete',5000,'mxn',jsonb_build_object('email',buyer,'phone','8187654321'),'{}');
 if(select phone from public.tsi224_store_customers where id=contact)<>'8187654321' then raise exception 'Verified paid order did not refresh customer telephone';end if;
 result:=public.tsi224_store_checkout_prepare_contact((select o.request_id from public.tsi224_store_orders o where o.id=(second_order->>'id')::uuid),access_hash,cart,buyer,'8187654321');
 if result->>'id'<>second_order->>'id' then raise exception 'Paid contact retry changed its order';end if;

 legacy_order:=public.tsi224_store_checkout_prepare_contact(gen_random_uuid(),access_hash,cart,'legacy-'||buyer,'');
 if legacy_order->>'phone'<>'' then raise exception 'Legacy checkout invented a telephone';end if;
 perform public.tsi224_store_checkout_event('evt_lookup_legacy_'||gen_random_uuid(),(legacy_order->>'id')::uuid,'cs_test_lookup_legacy','paid','complete',5000,'mxn','{}','{}');
 if(select phone from public.tsi224_store_customers where id=(legacy_order->>'customer_id')::uuid)<>'' then raise exception 'Historical contact invented a telephone';end if;

 result:=public.tsi224_store_order_lookup(' '||lower(second_order->>'reference')||' ',upper(buyer));
 if result->>'id'<>second_order->>'id' or result->>'status'<>'paid' or result->>'stripe_session_id'<>'cs_test_lookup_second' then raise exception 'Order lookup did not normalize reference/email or preserve server reconciliation';end if;
 if result ?| array['access_hash','input_hash','request_id','customer','shipping','email','phone','customer_id'] then raise exception 'Lookup exposed private fields';end if;
 if public.tsi224_store_order_lookup(second_order->>'reference','wrong@example.invalid') is not null or
  public.tsi224_store_order_lookup('TS-0000000000000000',buyer) is not null or
  public.tsi224_store_order_lookup(second_order->>'reference',null) is not null or
  public.tsi224_store_order_lookup(null,buyer) is not null or
  public.tsi224_store_order_lookup('',buyer) is not null then raise exception 'Incomplete or mismatched lookup disclosed a record';end if;

 for number in 1..21 loop
  result:=public.tsi224_store_lookup_rate(rate_key);
  if(result->>'allowed')::boolean is distinct from(number<=20) then raise exception 'Lookup limit did not enforce twenty attempts';end if;
 end loop;
 if(result->>'retry_after_seconds')::integer not between 1 and 600 then raise exception 'Lookup throttle omitted retry delay';end if;
 update public.tsi224_store_lookup_limits set window_start=now()-interval '11 minutes' where key_hash=rate_key;
 result:=public.tsi224_store_lookup_rate(rate_key);
 if result->>'allowed'<>'true' or(select hits from public.tsi224_store_lookup_limits where key_hash=rate_key)<>1 then raise exception 'Lookup quota did not reset';end if;
 blocked:=false;begin perform public.tsi224_store_lookup_rate('unhashed-address');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Lookup quota accepted an unhashed identifier';end if;
 insert into public.tsi224_store_customers(email) select prefix||'-'||n||'@example.invalid' from generate_series(1,27) as n;

 execute 'set local role authenticated';
 directory:=public.tsi224_store_customer_directory(buyer,0);
 if jsonb_array_length(directory->'customers')<>2 then raise exception 'Directory did not find customer contacts by email';end if;
 select value into result from jsonb_array_elements(directory->'customers') where value->>'id'=contact::text;
 if result->>'phone'<>'8187654321' or jsonb_array_length(result->'orders')<>2 then raise exception 'Directory omitted contact details or purchases';end if;
 if result::text like '%access_hash%' or result::text like '%shipping%' or result::text like '%delivery_link%' then raise exception 'Directory exposed fields outside its summary';end if;
 directory:=public.tsi224_store_customer_directory(second_order->>'reference',0);
 if jsonb_array_length(directory->'customers')<>1 then raise exception 'Directory could not find a customer by order reference';end if;
 directory:=public.tsi224_store_customer_directory('8187654321',0);
 if jsonb_array_length(directory->'customers')<>1 then raise exception 'Directory could not find a customer by telephone';end if;
 directory:=public.tsi224_store_customer_directory(prefix,0);
 if jsonb_array_length(directory->'customers')<>25 or directory->>'has_more'<>'true' then raise exception 'Directory first-page bound failed';end if;
 directory:=public.tsi224_store_customer_directory(prefix,1);
 if jsonb_array_length(directory->'customers')<>2 or directory->>'has_more'<>'false' then raise exception 'Directory second-page bound failed';end if;
 select version into current_version from public.tsi224_store_orders where id=(second_order->>'id')::uuid;
 perform public.tsi224_store_admin_command('order.fulfill',jsonb_build_object('id',second_order->>'id','expected_version',current_version,'fulfillment','packing'),gen_random_uuid());
 if(select fulfillment from public.tsi224_store_orders where id=(second_order->>'id')::uuid)<>'packing' then raise exception 'Customer sync prevented admin fulfillment';end if;
 blocked:=false;begin update public.tsi224_store_customers set phone='8111111111' where id=contact;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Browser administrator wrote customer contacts directly';end if;

 perform set_config('request.jwt.claim.sub',editor_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',editor_id,'role','authenticated')::text,true);
 if(select count(*) from public.tsi224_store_customers)<>0 then raise exception 'Editor read customer contact data';end if;
 blocked:=false;begin perform public.tsi224_store_customer_directory('',0);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Editor opened customer directory';end if;
 blocked:=false;begin perform public.tsi224_store_order_lookup(second_order->>'reference',buyer);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Browser invoked service-only lookup';end if;

 execute 'set local role anon';
 blocked:=false;begin perform count(*) from public.tsi224_store_customers;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous visitor read customer table';end if;
 blocked:=false;begin perform public.tsi224_store_customer_directory('',0);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous visitor opened customer directory';end if;
 blocked:=false;begin perform public.tsi224_store_order_lookup(second_order->>'reference',buyer);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous visitor invoked lookup RPC directly';end if;
 blocked:=false;begin perform public.tsi224_store_lookup_rate(rate_key);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous visitor invoked rate RPC directly';end if;
 execute 'reset role';
end $verify$;
rollback;
