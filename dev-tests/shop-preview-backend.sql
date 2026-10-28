-- Run after TSI 2.2.4 in the intended project, with a migration/admin connection.
-- Identities are synthetic. All users, previews, sources and receipts roll back.
begin;
set local statement_timeout='60s';

do $verify$
declare
 admin_id uuid:=gen_random_uuid(); editor_id uuid:=gen_random_uuid(); foto_id uuid:=gen_random_uuid();
 principal uuid; role_name text; request uuid:=gen_random_uuid();
 first_id bigint:=922400000000001; second_id bigint:=922400000000002; third_id bigint:=922400000000003; empty_id bigint:=922400000000004;
 jpeg_a text:='data:image/jpeg;base64,/9j/2Q==';
 jpeg_b text:='data:image/jpeg;base64,/9j/2w==';
 png text:='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cVZ0AAAAASUVORK5CYII=';
 state jsonb; before_state jsonb; result jsonb; repeated jsonb; payload jsonb; invalid_payload jsonb;
 options jsonb; items jsonb; prior_cfg jsonb; row_data jsonb; changed bigint; source_version bigint; blocked boolean;
begin
 if exists(select 1 from public.shop_items where id in(first_id::text,second_id::text,third_id::text,empty_id::text)) then
  raise exception 'Synthetic test IDs already exist; choose another test range';
 end if;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 -- Seed a pre-existing empty placeholder through the migration connection.
 insert into public.shop_items(id,data) values(empty_id::text,jsonb_build_object(
  'id',empty_id,'title','TSI224 old empty placeholder','folder','TSI224 test','price',50,'img',''));
 -- Do not borrow any real account identity, even temporarily.
 foreach principal in array array[admin_id,editor_id,foto_id] loop
  insert into auth.users(id,email,aud,role,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
   values(principal,'tsi224-'||principal::text||'@example.invalid','authenticated','authenticated','',now(),'{}','{}',now(),now());
 end loop;
 insert into public.profiles(id,email,name,role) values
  (admin_id,'tsi224-'||admin_id::text||'@example.invalid','TSI224 synthetic admin','admin'),
  (editor_id,'tsi224-'||editor_id::text||'@example.invalid','TSI224 synthetic editor','editora'),
  (foto_id,'tsi224-'||foto_id::text||'@example.invalid','TSI224 synthetic photographer','foto')
 on conflict(id) do update set email=excluded.email,name=excluded.name,role=excluded.role;

 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('tsi224_shop_state','tsi224_shop_command','tsi224_shop_guard_item') and p.prosecdef) then
  raise exception 'A new preview function unexpectedly uses SECURITY DEFINER';
 end if;
 if exists(select 1 from pg_class where oid in('public.tsi224_shop_preview'::regclass,'public.tsi224_shop_sources'::regclass,'public.tsi224_shop_receipts'::regclass) and not relrowsecurity) then
  raise exception 'A preview table does not enforce RLS';
 end if;
 if not (tsi210_private.backup_tables() @> array['tsi224_shop_preview','tsi224_shop_sources','tsi224_shop_receipts']) then
  raise exception 'Private sources or preview settings are missing from the existing admin backup';
 end if;

 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select data into prior_cfg from public.settings where id='cfg';
 insert into public.shop_items(id,data) values(first_id::text,jsonb_build_object(
  'id',first_id,'title','TSI224 legacy fixture','folder','TSI224 test','price',70,'img',jpeg_a));
 state:=public.tsi224_shop_state();
 if not exists(select 1 from jsonb_array_elements(state->'sources') e
  where e->>'id'=first_id::text and e->>'legacy'='true' and e->>'version'='0' and e->>'img'=jpeg_a) then
  raise exception 'Legacy fallback did not expose version zero to authorized staff';
 end if;
 options:=((state->'settings')-'version')||jsonb_build_object('bw',false,'motion',false,'watermark',true,'watermark_data',png);
 select jsonb_agg(jsonb_build_object('id',i.id,'img',case when i.id=first_id::text then jpeg_b else i.data->>'img' end,
  'source_version',coalesce(s.version,0)) order by i.id) into items
  from public.shop_items i left join public.tsi224_shop_sources s on s.item_id=i.id;
 payload:=jsonb_build_object('expected_version',state->'settings'->'version','settings',options,'items',coalesce(items,'[]'));

 invalid_payload:=jsonb_set(payload,'{items}',items-0);blocked:=false;
 begin perform public.tsi224_shop_command('settings',invalid_payload,gen_random_uuid());
 exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'An incomplete catalog was accepted';end if;
 invalid_payload:=jsonb_set(payload,'{items}',items||jsonb_build_array(items->0));blocked:=false;
 begin perform public.tsi224_shop_command('settings',invalid_payload,gen_random_uuid());
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'A duplicate catalog item was accepted';end if;
 invalid_payload:=jsonb_set(payload,'{expected_version}',to_jsonb((state->'settings'->>'version')::bigint-1));blocked:=false;
 begin perform public.tsi224_shop_command('settings',invalid_payload,gen_random_uuid());
 exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'A stale settings version was accepted';end if;
 invalid_payload:=jsonb_set(payload,'{items}',(select jsonb_agg(case when e->>'id'=first_id::text then jsonb_set(e,'{source_version}','1') else e end) from jsonb_array_elements(items)e));blocked:=false;
 begin perform public.tsi224_shop_command('settings',invalid_payload,gen_random_uuid());
 exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'A stale source version was accepted';end if;

 -- PNG validation happens after image writes; the entire command must roll back.
 before_state:=public.tsi224_shop_state();
 invalid_payload:=jsonb_set(payload,'{settings,watermark_data}',to_jsonb('data:image/svg+xml;base64,PHN2Zz4='::text));blocked:=false;
 begin perform public.tsi224_shop_command('settings',invalid_payload,gen_random_uuid());
 exception when check_violation then blocked:=true;end;
 if not blocked or public.tsi224_shop_state()<>before_state then raise exception 'An invalid watermark partially changed previews or private sources';end if;

 result:=public.tsi224_shop_command('settings',payload,request);
 repeated:=public.tsi224_shop_command('settings',payload,request);
 if result<>repeated or (public.tsi224_shop_state()->'settings'->>'version')::bigint<>(state->'settings'->>'version')::bigint+1 then
  raise exception 'An idempotent retry repeated the settings mutation';end if;
 if not exists(select 1 from public.tsi224_shop_sources where item_id=first_id::text and img=jpeg_a and legacy and version=1) then
  raise exception 'Legacy baseline was not privately materialized before replacing the public image';end if;
 if exists(select 1 from public.tsi224_shop_sources where item_id=empty_id::text) then
  raise exception 'An empty placeholder became an invalid private source';end if;
 if exists(select 1 from public.tsi224_shop_receipts r where r.actor_id=admin_id and r.result::text like '%data:image%') then
  raise exception 'A command receipt duplicated the image catalog';end if;
 select data into row_data from public.shop_items where id=first_id::text;
 if row_data->>'img'<>jpeg_b or row_data->>'title'<>'TSI224 legacy fixture' or (row_data->>'price')::numeric<>70 then
  raise exception 'Global reprocessing lost public metadata';end if;
 blocked:=false;
 begin perform public.tsi224_shop_command('settings',jsonb_set(payload,'{settings,motion}','true'),request);
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'A request ID accepted a different payload';end if;

 -- Closing the public shop must not disable authorized staff uploads.
 update public.settings set data=data||jsonb_build_object('shop',false) where id='cfg';
 perform set_config('request.jwt.claim.sub',editor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',editor_id,'role','authenticated')::text,true);
 state:=public.tsi224_shop_state();
 payload:=jsonb_build_object('settings_version',state->'settings'->'version','items',jsonb_build_array(jsonb_build_object(
  'id',second_id,'title','TSI224 editor fixture','folder','TSI224 test','price',1,'img',jpeg_b,'source_img',jpeg_a,'source_version',0)));
 invalid_payload:=jsonb_set(payload,'{settings_version}',to_jsonb((state->'settings'->>'version')::bigint-1));blocked:=false;
 begin perform public.tsi224_shop_command('upload',invalid_payload,gen_random_uuid());
 exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'An upload accepted stale global settings';end if;
 -- Same UUID as the admin's earlier command is allowed for a different actor.
 result:=public.tsi224_shop_command('upload',payload,request);
 if public.tsi224_shop_command('upload',payload,request)<>result then raise exception 'Upload retry was not idempotent';end if;
 select data into row_data from public.shop_items where id=second_id::text;
 if jsonb_typeof(row_data->'id')<>'number' or (row_data->>'price')::numeric<>50 or row_data ? 'source_img' then
  raise exception 'Editor upload lost numeric ID, changed fixed pricing, or exposed a private source';end if;
 if not exists(select 1 from public.tsi224_shop_sources where item_id=second_id::text and img=jpeg_a and not legacy and version=1) then
  raise exception 'New source was not saved privately';end if;

 payload:=jsonb_set(payload,'{items,0}',(payload->'items'->0)||jsonb_build_object('source_version',1,'title','Must not overwrite title','folder','Must not overwrite folder','price',999,'img',jpeg_a,'source_img',jpeg_b));
 perform public.tsi224_shop_command('upload',payload,gen_random_uuid());
 select data into row_data from public.shop_items where id=second_id::text;
 if row_data->>'title'<>'TSI224 editor fixture' or row_data->>'folder'<>'TSI224 test' or (row_data->>'price')::numeric<>50 then
  raise exception 'Replacement changed existing title, folder or price';end if;
 if not exists(select 1 from public.tsi224_shop_sources where item_id=second_id::text and img=jpeg_b and not legacy and version=2) then
  raise exception 'Replacement did not advance the private source version';end if;
 blocked:=false;
 begin perform public.tsi224_shop_command('upload',payload,gen_random_uuid());
 exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'An upload accepted a stale private source';end if;

 blocked:=false;
 begin update public.shop_items set data=jsonb_set(data,'{price}','1') where id=second_id::text;
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Editor direct UPDATE changed price';end if;
 blocked:=false;
 begin insert into public.shop_items(id,data) values(third_id::text,jsonb_build_object('id',third_id,'title','Bad price','folder','TSI224 test','price',49,'img',jpeg_a));
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Editor direct INSERT used a price other than 50';end if;
 blocked:=false;
 begin insert into public.shop_items(id,data) values(third_id::text,jsonb_build_object('id',third_id,'title','Bad leak','folder','TSI224 test','price',50,'img',jpeg_a,'source_img',jpeg_b));
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Editor direct INSERT exposed a private source key';end if;
 update public.shop_items set data=jsonb_set(data,'{img}',to_jsonb(jpeg_b)) where id=second_id::text;
 get diagnostics changed=row_count;if changed<>1 then raise exception 'Editor image-only UPDATE was rejected';end if;
 blocked:=false;
 begin insert into public.settings(id,data) values('cfg',coalesce(prior_cfg,'{}')||jsonb_build_object('shop',true)) on conflict(id) do update set data=excluded.data;
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Preview feature broadened editor access to settings/cfg';end if;

 state:=public.tsi224_shop_state();
 select jsonb_agg(jsonb_build_object('id',i.id,'img',i.data->>'img','source_version',coalesce(s.version,0)) order by i.id)
  into items from public.shop_items i left join public.tsi224_shop_sources s on s.item_id=i.id;
 perform public.tsi224_shop_command('settings',jsonb_build_object('expected_version',state->'settings'->'version',
  'settings',((state->'settings')-'version')||jsonb_build_object('bw',true),'items',items),gen_random_uuid());
 if (public.tsi224_shop_state()->'settings'->>'version')::bigint<>(state->'settings'->>'version')::bigint+1 then
  raise exception 'Editor could not save global preview settings';end if;

 perform set_config('request.jwt.claim.sub',foto_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',foto_id,'role','authenticated')::text,true);
 if (select count(*) from public.tsi224_shop_sources)<>0 or (select count(*) from public.tsi224_shop_receipts)<>0 then
  raise exception 'Photographer could read sources or receipts';end if;
 if (select count(*) from public.tsi224_shop_preview)<>1 then raise exception 'Public preview settings are not readable';end if;
 blocked:=false;begin perform public.tsi224_shop_state();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Photographer accessed staff state';end if;
 blocked:=false;begin perform public.tsi224_shop_command('upload',payload,gen_random_uuid());exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Photographer invoked a preview mutation';end if;
 blocked:=false;begin insert into public.shop_items(id,data) values(third_id::text,jsonb_build_object('id',third_id,'title','Forbidden photo','folder','TSI224 test','price',50,'img',jpeg_a));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Photographer inserted a public shop item';end if;
 blocked:=false;begin insert into public.tsi224_shop_sources(item_id,img) values(first_id::text,jpeg_a);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Photographer wrote a private source';end if;

 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"anon"}',true);
 execute 'set local role anon';
 if (select count(*) from public.tsi224_shop_preview)<>1 then raise exception 'Anonymous visitors cannot read global preview settings';end if;
 blocked:=false;begin perform count(*) from public.tsi224_shop_sources;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous visitors accessed private source table';end if;
 blocked:=false;begin perform public.tsi224_shop_state();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous visitors executed staff state RPC';end if;

 execute 'reset role';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 delete from public.shop_items where id=second_id::text;
 if exists(select 1 from public.tsi224_shop_sources where item_id=second_id::text) then raise exception 'Deleting a public item left its private source behind';end if;
 execute 'reset role';
end $verify$;

rollback;
