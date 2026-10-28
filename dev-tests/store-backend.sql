-- Transactional verification: synthetic identities, products, stock and payments.
-- Run after the store migration with a migration/admin connection. No real charge.
begin;
set local statement_timeout='90s';
do $verify$
declare
 a uuid:=gen_random_uuid();e uuid:=gen_random_uuid();f uuid:=gen_random_uuid();u uuid;
 p uuid:=gen_random_uuid();v uuid:=gen_random_uuid();d uuid:=gen_random_uuid();dv uuid:=gen_random_uuid();
 request uuid:=gen_random_uuid();token text:=repeat('a',64);wrong text:=repeat('b',64);
 cart jsonb;single_cart jsonb;quote jsonb;result jsonb;saved jsonb;order1 jsonb;order2 jsonb;order3 jsonb;order4 jsonb;order5 jsonb;
 product_payload jsonb;variant_payload jsonb;cfg jsonb;status jsonb;blocked boolean;n bigint;current_stock integer;rate jsonb;
 photo_id text:='922499990000001';
 png text:='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cVZ0AAAAASUVORK5CYII=';
 address jsonb:='{"name":"Synthetic buyer","address":{"country":"MX","line1":"Synthetic address","city":"Test","state":"NL","postal_code":"64000"}}';
begin
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 foreach u in array array[a,e,f] loop
  insert into auth.users(id,email,aud,role,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
   values(u,'store-test-'||u||'@example.invalid','authenticated','authenticated','',now(),'{}','{}',now(),now());
 end loop;
 insert into public.profiles(id,email,name,role) values
  (a,'store-test-'||a||'@example.invalid','Synthetic store admin','admin'),
  (e,'store-test-'||e||'@example.invalid','Synthetic store editor','editora'),
  (f,'store-test-'||f||'@example.invalid','Synthetic store photographer','foto')
 on conflict(id) do update set email=excluded.email,name=excluded.name,role=excluded.role;
 if exists(select 1 from pg_proc where oid in('public.tsi224_store_quote(jsonb)'::regprocedure,'public.tsi224_store_admin_command(text,jsonb,uuid)'::regprocedure,
  'public.tsi224_store_checkout_prepare(uuid,text,jsonb,text)'::regprocedure,'public.tsi224_store_checkout_event(text,uuid,text,text,text,bigint,text,jsonb,jsonb)'::regprocedure) and prosecdef) then
  raise exception 'Store RPC unexpectedly uses SECURITY DEFINER';end if;
 if not(tsi210_private.backup_tables() @> array['tsi224_shop_sources','tsi224_store_orders','tsi224_store_order_lines','tsi224_store_reservations','tsi224_store_events']) then
  raise exception 'Store backup replaced existing private preview tables or omitted financial records';end if;

 perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);execute 'set local role authenticated';
 update public.settings set data=data||'{"shop":true}' where id='cfg';
 insert into public.shop_items(id,data) values(photo_id,jsonb_build_object('id',photo_id::bigint,'title','Synthetic photo','folder','Test fixture','price',50,'img','data:image/jpeg;base64,/9j/2Q=='));
 product_payload:=jsonb_build_object('id',p,'expected_version',0,'slug','test-'||p,'category','merch','kind','physical','title','Synthetic shirt','description','Transactional fixture','image',png,'active',false,'personalization',true);
 perform public.tsi224_store_admin_command('product.save',product_payload,gen_random_uuid());
 blocked:=false;begin perform public.tsi224_store_admin_command('product.save',product_payload||'{"expected_version":1,"active":true}',gen_random_uuid());exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Product published without a sellable variant';end if;
 variant_payload:=jsonb_build_object('id',v,'expected_version',0,'product_id',p,'title','Test size','sku','TEST-'||v,'price_cents',5000,'stock',3,'active',true);
 perform public.tsi224_store_admin_command('variant.save',variant_payload,gen_random_uuid());
 perform public.tsi224_store_admin_command('product.save',product_payload||'{"expected_version":1,"active":true}',gen_random_uuid());
 product_payload:=jsonb_build_object('id',d,'expected_version',0,'slug','test-'||d,'category','designs','kind','digital','title','Synthetic poster','description','','image',png,'active',false,'personalization',true);
 perform public.tsi224_store_admin_command('product.save',product_payload,gen_random_uuid());
 perform public.tsi224_store_admin_command('variant.save',jsonb_build_object('id',dv,'expected_version',0,'product_id',d,'title','Test digital file','sku','TEST-'||dv,'price_cents',1500,'stock',0,'active',true),gen_random_uuid());
 perform public.tsi224_store_admin_command('product.save',product_payload||'{"expected_version":1,"active":true}',gen_random_uuid());
 cart:=jsonb_build_array(jsonb_build_object('kind','photo','id',photo_id,'quantity',1),
  jsonb_build_object('kind','variant','id',v,'quantity',1,'customization','Ana'),jsonb_build_object('kind','variant','id',v,'quantity',1,'customization','Luis'),
  jsonb_build_object('kind','variant','id',dv,'quantity',1));
 single_cart:=jsonb_build_array(jsonb_build_object('kind','variant','id',v,'quantity',1));
 select to_jsonb(c) into cfg from public.tsi224_store_config c where id='shop';
 perform public.tsi224_store_admin_command('config.save',jsonb_build_object('expected_version',cfg->'version','shipping_fee_cents',null,'payments_enabled',false),gen_random_uuid());
 execute 'set local role service_role';
 blocked:=false;begin perform public.tsi224_store_checkout_prepare(gen_random_uuid(),token,cart,'buyer@example.invalid');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Checkout prepared while payments were disabled';end if;
 execute 'set local role anon';quote:=public.tsi224_store_quote(cart);
 if quote->'total_cents'<>'null'::jsonb or quote->>'shipping_configured'<>'false' or(quote->>'subtotal_cents')::bigint<>16500 then raise exception 'Unconfigured shipping or mixed quote totals are wrong';end if;
 blocked:=false;begin perform public.tsi224_store_quote(cart||jsonb_build_array(cart->0));exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Quote accepted duplicate identical cart entries';end if;
 blocked:=false;begin perform public.tsi224_store_quote(jsonb_build_array((cart->0)||'{"price_cents":1}'));exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Quote accepted browser-supplied price';end if;
 execute 'set local role authenticated';select to_jsonb(c) into cfg from public.tsi224_store_config c where id='shop';
 perform public.tsi224_store_admin_command('config.save',jsonb_build_object('expected_version',cfg->'version','shipping_fee_cents',800,'payments_enabled',true),gen_random_uuid());
 execute 'set local role anon';quote:=public.tsi224_store_quote(cart);
 if(quote->>'total_cents')::bigint<>17300 or(quote->>'shipping_cents')::bigint<>800 then raise exception 'DB quote did not price mixed cart plus delivery';end if;
 quote:=public.tsi224_store_quote(jsonb_build_array(jsonb_build_object('kind','variant','id',dv,'quantity',1)));
 if quote->>'requires_shipping'<>'false' or(quote->>'shipping_cents')::bigint<>0 then raise exception 'Digital-only cart charged shipping';end if;

 execute 'set local role service_role';order1:=public.tsi224_store_checkout_prepare(request,token,cart,'buyer@example.invalid');
 if order1 ? 'access_hash' or order1 ? 'input_hash' or order1->>'created_at' is null then raise exception 'Prepare leaked token binding or omitted stable creation time';end if;
 select stock into current_stock from public.tsi224_store_variants where id=v;if current_stock<>1 then raise exception 'Personalized lines did not reserve aggregated stock exactly once';end if;
 result:=public.tsi224_store_checkout_prepare(request,token,jsonb_build_array(cart->3,cart->2,cart->1,cart->0),'BUYER@example.invalid');
 if result->>'id'<>order1->>'id' or(select stock from public.tsi224_store_variants where id=v)<>1 then raise exception 'Prepare retry reserved twice or failed canonical cart binding';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_prepare(request,wrong,cart,'buyer@example.invalid');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'A different access token reused the request';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_prepare(request,token,single_cart,'buyer@example.invalid');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'A different cart reused the request';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_prepare(gen_random_uuid(),token,jsonb_build_array(jsonb_build_object('kind','variant','id',v,'quantity',2)),'buyer@example.invalid');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked or(select stock from public.tsi224_store_variants where id=v)<>1 then raise exception 'Oversell attempt succeeded or changed inventory';end if;
 perform public.tsi224_store_checkout_link((order1->>'id')::uuid,'cs_test_first');
 blocked:=false;begin perform public.tsi224_store_checkout_event('evt_test_bad_amount',(order1->>'id')::uuid,'cs_test_first','paid','complete',1,'mxn','{}',address);exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Payment amount mismatch was accepted';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_event('evt_test_bad_currency',(order1->>'id')::uuid,'cs_test_first','paid','complete',17300,'usd','{}',address);exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Payment currency mismatch was accepted';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_event('evt_test_bad_session',(order1->>'id')::uuid,'cs_test_other','paid','complete',17300,'mxn','{}',address);exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Wrong Stripe session was accepted';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_event('evt_test_incomplete_address',(order1->>'id')::uuid,'cs_test_first','paid','complete',17300,'mxn','{}','{"address":{"country":"MX"}}');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Physical payment accepted an incomplete verified delivery address';end if;
 perform public.tsi224_store_checkout_event('evt_test_first_paid',(order1->>'id')::uuid,'cs_test_first','paid','complete',17300,'mxn','{"email":"buyer@example.invalid"}',address);
 perform public.tsi224_store_checkout_event('evt_test_first_paid',(order1->>'id')::uuid,'cs_test_first','paid','complete',17300,'mxn','{"email":"buyer@example.invalid"}',address);
 perform public.tsi224_store_checkout_event('evt_test_first_expired_late',(order1->>'id')::uuid,'cs_test_first','unpaid','expired',17300,'mxn','{}','{}');
 status:=public.tsi224_store_checkout_status((order1->>'id')::uuid,token);
 if status->>'status'<>'paid' or(select stock from public.tsi224_store_variants where id=v)<>1 then raise exception 'Duplicate/out-of-order event reverted payment or released paid inventory';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_status((order1->>'id')::uuid,wrong);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Order UUID alone exposed private buyer status';end if;

 order2:=public.tsi224_store_checkout_prepare(gen_random_uuid(),token,single_cart,'buyer@example.invalid');
 -- The verified webhook can arrive before checkout_link; it binds the session.
 perform public.tsi224_store_checkout_event('evt_test_second_expired',(order2->>'id')::uuid,'cs_test_second','unpaid','expired',5800,'mxn','{}','{}');
 perform public.tsi224_store_checkout_event('evt_test_second_expired_again',(order2->>'id')::uuid,'cs_test_second','unpaid','expired',5800,'mxn','{}','{}');
 if(select stock from public.tsi224_store_variants where id=v)<>1 then raise exception 'Expiration released stock more than once';end if;
 order3:=public.tsi224_store_checkout_prepare(gen_random_uuid(),token,single_cart,'buyer@example.invalid');
 perform public.tsi224_store_checkout_event('evt_test_second_paid_late',(order2->>'id')::uuid,'cs_test_second','paid','complete',5800,'mxn','{}',address);
 status:=public.tsi224_store_checkout_status((order2->>'id')::uuid,token);
 if status->>'status'<>'paid' or status->>'needs_review'<>'true' or(select stock from public.tsi224_store_variants where id=v)<>0 then raise exception 'Late verified payment was lost or consumed released inventory twice';end if;
 execute 'set local role authenticated';
 blocked:=false;begin update public.tsi224_store_orders set status='paid' where id=(order3->>'id')::uuid;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Browser administrator directly set payment status';end if;
 blocked:=false;begin perform public.tsi224_store_admin_command('order.fulfill',jsonb_build_object('id',order2->>'id','expected_version',status->'version','fulfillment','packing'),gen_random_uuid());exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Fulfillment oversold stock after a late payment';end if;
 execute 'set local role service_role';perform public.tsi224_store_checkout_event('evt_test_third_expired',(order3->>'id')::uuid,'cs_test_third','unpaid','expired',5800,'mxn','{}','{}');
 execute 'set local role authenticated';select to_jsonb(o) into status from public.tsi224_store_orders o where id=(order2->>'id')::uuid;
 perform public.tsi224_store_admin_command('order.fulfill',jsonb_build_object('id',order2->>'id','expected_version',status->'version','fulfillment','packing'),gen_random_uuid());
 if(select stock from public.tsi224_store_variants where id=v)<>0 or(select needs_review from public.tsi224_store_orders where id=(order2->>'id')::uuid) then raise exception 'Packing did not re-acquire stock and clear review atomically';end if;
 select version into n from public.tsi224_store_variants where id=v;
 perform public.tsi224_store_admin_command('variant.save',variant_payload||jsonb_build_object('expected_version',n,'stock',2),gen_random_uuid());
 execute 'set local role service_role';order4:=public.tsi224_store_checkout_prepare(gen_random_uuid(),token,single_cart,'buyer@example.invalid');
 perform public.tsi224_store_checkout_event('evt_test_failed',(order4->>'id')::uuid,'cs_test_fourth','failed','complete',5800,'mxn','{}','{}');
 perform public.tsi224_store_checkout_event('evt_test_failed_repeat',(order4->>'id')::uuid,'cs_test_fourth','failed','complete',5800,'mxn','{}','{}');
 if(select stock from public.tsi224_store_variants where id=v)<>2 then raise exception 'Verified async failure did not release once';end if;
 order5:=public.tsi224_store_checkout_prepare(gen_random_uuid(),token,single_cart,'buyer@example.invalid');
 perform public.tsi224_store_checkout_abort((order5->>'id')::uuid,token);perform public.tsi224_store_checkout_abort((order5->>'id')::uuid,token);
 if(select stock from public.tsi224_store_variants where id=v)<>2 then raise exception 'Definitive creation failure aborted inventory twice';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_abort((order1->>'id')::uuid,token);exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'A linked or paid order could be aborted';end if;
 for n in 1..9 loop rate:=public.tsi224_store_checkout_rate(repeat('c',64));if(rate->>'allowed')::boolean is distinct from(n<=8) then raise exception 'Rate limit did not enforce eight attempts per window';end if;end loop;

 perform set_config('request.jwt.claim.sub',e::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',e,'role','authenticated')::text,true);execute 'set local role authenticated';
 if(select count(*) from public.tsi224_store_orders)<>0 then raise exception 'Editor read private store orders';end if;
 blocked:=false;begin perform public.tsi224_store_admin_state();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Editor opened catalog/order administration';end if;
 blocked:=false;begin perform public.tsi224_store_checkout_prepare(gen_random_uuid(),token,single_cart,'buyer@example.invalid');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Browser invoked service-only checkout';end if;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
 if exists(select 1 from public.tsi224_store_products where not active) then raise exception 'Anonymous catalog exposed unpublished drafts';end if;
 blocked:=false;begin perform count(*) from public.tsi224_store_orders;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous visitor accessed private orders';end if;
 execute 'reset role';
end $verify$;
rollback;
