-- STAGING only, after both guest migrations. Synthetic rows, always rollback.
begin;
set local statement_timeout='90s';
do $$
declare f uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); ia uuid:=gen_random_uuid(); ib uuid:=gen_random_uuid();
 product_key uuid:=gen_random_uuid(); variant_key uuid:=gen_random_uuid(); request_key uuid:=gen_random_uuid();
 photo_key text:='tsi230-store-'||gen_random_uuid(); other_photo text:='tsi230-other-'||gen_random_uuid();
 cart jsonb; variant_cart jsonb; prepared jsonb; retried jsonb; unbound jsonb; result jsonb; blocked boolean;
 manual_request uuid:=gen_random_uuid(); manual_result jsonb; manual_repeat jsonb;
begin
 if has_function_privilege('anon','public.tsi224_store_quote(jsonb)','execute') or has_function_privilege('authenticated','public.tsi224_store_quote(jsonb)','execute') then raise exception 'legacy quote remains public'; end if;
 if has_function_privilege('anon','public.tsi230_store_prepare_guest(text,uuid,text,jsonb,text,text)','execute') then raise exception 'guest prepare public'; end if;
 if has_function_privilege('authenticated','public.tsi230_store_guest_photo(text,uuid,text,text)','execute') then raise exception 'source RPC public'; end if;
 if has_table_privilege('anon','public.tsi224_store_products','select') or has_table_privilege('anon','public.tsi224_store_variants','select') or has_table_privilege('anon','public.tsi224_store_config','select') then raise exception 'legacy catalog still anon'; end if;
 if has_schema_privilege('anon','tsi230_guest_private','usage') then raise exception 'binding schema public'; end if;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 update public.settings set data=data||'{"shop":true}' where id='cfg';
 update public.tsi224_store_config set payments_enabled=true where id='shop';
 insert into public.shop_items(id,data) values(photo_key,jsonb_build_object('id',photo_key,'title','Synthetic scoped','folder','tsi230 store fixture','price',50,'img','data:image/jpeg;base64,/9j/AAAA')),
 (other_photo,jsonb_build_object('id',other_photo,'title','Synthetic other','folder','tsi230 unrelated','price',50,'img','data:image/jpeg;base64,/9j/AAAA'));
 insert into public.tsi224_shop_sources(item_id,img) values(photo_key,'data:image/jpeg;base64,/9j/AAAA');
 insert into public.tsi230_guest_folders(id,label,season_end,expires_at) values(f,'tsi230 store fixture',now()+interval '10 days',now()+interval '10 days');
 insert into public.tsi230_guest_folder_items values(f,photo_key);
 insert into public.tsi230_guest_contacts(id,folder_id,name,email,relationship,approved) values
 (ca,f,'Synthetic A','guest-a@example.invalid','jugador',true),(cb,f,'Synthetic B','guest-b@example.invalid','familiar',true);
 insert into public.tsi230_guest_invitations(id,contact_id,token_hash,expires_at) values
 (ia,ca,repeat('a',64),now()+interval '1 day'),(ib,cb,repeat('b',64),now()+interval '1 day');
 insert into public.tsi230_guest_sessions(invitation_id,token_hash,expires_at) values
 (ia,repeat('c',64),now()+interval '1 hour'),(ib,repeat('d',64),now()+interval '1 hour');
 insert into public.tsi224_store_products(id,slug,category,kind,title,image) values(product_key,'tsi230-'||product_key,'designs','digital','Synthetic digital','data:image/jpeg;base64,/9j/AAAA');
 insert into public.tsi224_store_variants(id,product_id,title,price_cents,active) values(variant_key,product_key,'Synthetic',5000,true);
 update public.tsi224_store_products set active=true where id=product_key;
 cart:=jsonb_build_array(jsonb_build_object('kind','photo','id',photo_key,'quantity',1));
 variant_cart:=jsonb_build_array(jsonb_build_object('kind','variant','id',variant_key::text,'quantity',1));
 execute 'set local role service_role';
 blocked:=false;begin perform public.tsi230_store_prepare_guest(repeat('e',64),gen_random_uuid(),repeat('f',64),variant_cart,'guest-a@example.invalid','8112345678');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'variants-only checkout bypasses guest'; end if;
 blocked:=false;begin perform public.tsi230_store_prepare_guest(repeat('c',64),gen_random_uuid(),repeat('f',64),jsonb_build_array(jsonb_build_object('kind','photo','id',other_photo,'quantity',1)),'guest-a@example.invalid','8112345678');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'cross-folder photo checkout accepted'; end if;
 prepared:=public.tsi230_store_prepare_guest(repeat('c',64),request_key,repeat('f',64),cart,'guest-a@example.invalid','8112345678');
 retried:=public.tsi230_store_prepare_guest(repeat('c',64),request_key,repeat('f',64),cart,'guest-a@example.invalid','8112345678');
 if prepared->>'id'<>retried->>'id' then raise exception 'idempotency changed order'; end if;
 blocked:=false;begin perform public.tsi230_store_prepare_guest(repeat('d',64),request_key,repeat('f',64),cart,'guest-b@example.invalid','8112345678');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'shared-browser request/token transferred order to contact B'; end if;
 if not public.tsi230_store_guest_order_allowed(repeat('c',64),(prepared->>'id')::uuid) then raise exception 'owner rejected'; end if;
 if public.tsi230_store_guest_order_allowed(repeat('d',64),(prepared->>'id')::uuid) then raise exception 'contact B can read A order'; end if;
 blocked:=false;begin perform public.tsi230_store_guest_photo(repeat('c',64),(prepared->>'id')::uuid,repeat('f',64),photo_key);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'unpaid original available'; end if;
 perform public.tsi224_store_checkout_event('evt_tsi230_'||gen_random_uuid(),(prepared->>'id')::uuid,'cs_test_guest230_'||replace(gen_random_uuid()::text,'-',''),'paid','complete',5000,'mxn','{}','{}');
 result:=public.tsi230_store_guest_photo(repeat('c',64),(prepared->>'id')::uuid,repeat('f',64),photo_key);
 if result->>'image'<>'data:image/jpeg;base64,/9j/AAAA' then raise exception 'paid source missing'; end if;
 result:=public.tsi230_store_guest_photo(repeat('c',64),(prepared->>'id')::uuid,null,photo_key);
 if result->>'image'<>'data:image/jpeg;base64,/9j/AAAA' then raise exception 'verified owner lookup recovery rejected'; end if;
 blocked:=false;begin perform public.tsi230_store_guest_photo(repeat('d',64),(prepared->>'id')::uuid,repeat('f',64),photo_key);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'B downloaded A paid original'; end if;
 blocked:=false;begin perform public.tsi230_store_guest_photo(repeat('d',64),(prepared->>'id')::uuid,null,photo_key);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'lookup recovery transferred paid source to B'; end if;
 blocked:=false;begin perform public.tsi230_store_guest_photo(repeat('c',64),(prepared->>'id')::uuid,repeat('e',64),photo_key);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'incorrect access hash downloaded original'; end if;
 blocked:=false;begin perform public.tsi230_store_guest_photo(repeat('c',64),(prepared->>'id')::uuid,repeat('f',64),other_photo);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'unbought photo downloaded'; end if;
 retried:=public.tsi230_store_prepare_guest(repeat('c',64),gen_random_uuid(),repeat('f',64),variant_cart,'guest-a@example.invalid','8112345678');
 if not public.tsi230_store_guest_order_allowed(repeat('c',64),(retried->>'id')::uuid) then raise exception 'valid variants-only owner rejected'; end if;
 unbound:=public.tsi224_store_checkout_prepare_contact(gen_random_uuid(),repeat('f',64),variant_cart,'guest-a@example.invalid','8112345678');
 if public.tsi230_store_guest_order_allowed(repeat('c',64),(unbound->>'id')::uuid) then raise exception 'legacy unbound order claimed'; end if;
 -- A manual order still works while Stripe payments are switched off.
 update public.tsi224_store_config set payments_enabled=false where id='shop';
 manual_result:=public.tsi230_store_manual_guest(repeat('c',64),manual_request,array[photo_key],'Synthetic delivery','8112345678','Synthetic note');
 if manual_result->>'status'<>'nuevo' or (manual_result->>'total')::numeric<>50 or (manual_result->>'id')::bigint not between 1 and 4503599627370495 then raise exception 'manual shape/repricing failed'; end if;
 if (select data->>'status' from public.orders where id=manual_result->>'reference')<>'nuevo' then raise exception 'manual order marked paid'; end if;
 manual_repeat:=public.tsi230_store_manual_guest(repeat('c',64),manual_request,array[photo_key],'Synthetic delivery','8112345678','Synthetic note');
 if manual_repeat is distinct from manual_result then raise exception 'manual retry duplicated order'; end if;
 blocked:=false;begin perform public.tsi230_store_manual_guest(repeat('d',64),manual_request,array[photo_key],'Synthetic delivery','8112345678','Synthetic note');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'manual receipt transferred from A to B'; end if;
 blocked:=false;begin perform public.tsi230_store_manual_guest(repeat('c',64),manual_request,array[photo_key],'Changed payload','8112345678','Synthetic note');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'manual receipt accepted changed payload'; end if;
 blocked:=false;begin perform public.tsi230_store_manual_guest(repeat('c',64),gen_random_uuid(),array[other_photo],'Synthetic delivery','8112345678','Synthetic note');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'manual cross-folder checkout accepted'; end if;
 perform public.tsi230_guest_logout(repeat('c',64));
 if public.tsi230_store_guest_order_allowed(repeat('c',64),(prepared->>'id')::uuid) then raise exception 'revoked guest still reads paid order'; end if;
 blocked:=false;begin perform public.tsi230_store_guest_photo(repeat('c',64),(prepared->>'id')::uuid,repeat('f',64),photo_key);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'revoked guest still downloads original'; end if;
 raise notice 'PASS guest230 store: atomic mapping, variants-only guest, shared browser ownership, legacy denied, paid scoped originals, revocation';
end $$;
rollback;
