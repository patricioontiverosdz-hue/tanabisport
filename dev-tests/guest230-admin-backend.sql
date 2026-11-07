-- Local PostgreSQL fixtures only: no Auth accounts and no remote execution.
begin;
do $$
declare actor uuid:=gen_random_uuid(); folder_key uuid; contact_key uuid; invitation_key uuid; old_folder uuid:=gen_random_uuid();
 image_id text:='tsi230-admin-'||gen_random_uuid(); second_image text:='tsi230-admin-new-'||gen_random_uuid(); expired_image text:='tsi230-expired-'||gen_random_uuid();
 data jsonb; denied boolean; n integer;
begin
 insert into public.profiles(id,email,name,role) values(actor,'admin@example.invalid','Synthetic local admin','admin');
 insert into public.shop_items(id,data) values(image_id,jsonb_build_object('id',image_id,'title','Synthetic admin','folder','tsi230 admin fixture','price',50,'img','data:image/jpeg;base64,/9j/AAAA'));
 execute 'set local role service_role';
 data:=public.tsi230_guest_admin(actor,'folder-create',jsonb_build_object('label','tsi230 admin fixture','season_end',now()+interval '100 days'));
 folder_key:=(data->'folders'->0->>'id')::uuid;
 if (data->'folders'->0->>'item_count')::integer<>1 or (data->'folders'->0->>'expires_at')::timestamptz>now()+interval '56 days' then raise exception 'admin folder snapshot/TTL failed'; end if;
 data:=public.tsi230_guest_admin(actor,'contact-create',jsonb_build_object('folder_id',folder_key,'name','Synthetic guest','email','approved@example.invalid','relationship','familiar','approved',true));
 contact_key:=(data->'contacts'->0->>'id')::uuid;
 data:=public.tsi230_guest_admin(actor,'invite-create',jsonb_build_object('contact_id',contact_key,'token_hash',repeat('1',64),'expires_at',now()+interval '20 days','test_mode',true));
 invitation_key:=(data->>'invitation_id')::uuid;
 if (data->'invitations'->0->>'expires_at')::timestamptz>now()+interval '7 days' then raise exception 'admin invitation TTL exceeded'; end if;
 if (data->'invitations'->0) ? 'token_hash' then raise exception 'admin state leaks invitation hash'; end if;
 if not public.tsi230_guest_challenge(gen_random_uuid(),null,null,repeat('2',64),invitation_key) then raise exception 'admin test challenge rejected'; end if;
 insert into public.shop_items(id,data) values(second_image,jsonb_build_object('id',second_image,'title','Synthetic new','folder','tsi230 admin fixture','price',50,'img','data:image/jpeg;base64,/9j/AAAA'));
 if (select count(*) from public.tsi230_guest_folder_items where folder_id=folder_key)<>1 then raise exception 'new same-label image auto-authorized'; end if;
 data:=public.tsi230_guest_admin(actor,'folder-sync',jsonb_build_object('folder_id',folder_key));
 if (data->'folders'->0->>'item_count')::integer<>2 then raise exception 'explicit folder sync failed'; end if;
 data:=public.tsi230_guest_admin(actor,'revoke',jsonb_build_object('kind','invitation','id',invitation_key));
 if public.tsi230_guest_challenge(gen_random_uuid(),null,null,repeat('2',64),invitation_key) then raise exception 'revoked test invite still usable'; end if;
 -- Simulate an old expired gallery without changing actual user data.
 insert into public.shop_items(id,data) values(expired_image,jsonb_build_object('id',expired_image,'title','Synthetic expired','folder','tsi230 expired fixture','price',50,'img','data:image/jpeg;base64,/9j/AAAA'));
 insert into public.tsi224_shop_sources(item_id,img) values(expired_image,'data:image/jpeg;base64,/9j/AAAA');
 insert into public.tsi230_guest_folders(id,label,created_at,season_end,expires_at) values(old_folder,'tsi230 expired fixture',now()-interval '60 days',now()-interval '4 days',now()-interval '4 days');
 insert into public.tsi230_guest_folder_items values(old_folder,expired_image);
 n:=public.tsi230_guest_purge();
 if n<>1 or exists(select 1 from public.shop_items where id=expired_image) or exists(select 1 from public.tsi224_shop_sources where item_id=expired_image) or exists(select 1 from public.tsi230_guest_folders where id=old_folder) then raise exception 'physical gallery retention failed'; end if;
 update public.profiles set role='foto' where id=actor;
 denied:=false;begin perform public.tsi230_guest_admin(actor,'state','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'changed admin role still authorizes'; end if;
 raise notice 'PASS guest230 admin/retention: immutable snapshots, explicit sync, approval, TTL, test-only issuance/revoke, physical sources+preview purge, role freshness';
end $$;
rollback;
