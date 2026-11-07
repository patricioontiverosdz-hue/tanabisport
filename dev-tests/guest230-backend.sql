-- Run only on staging after migration. Synthetic fixtures; always rolls back.
begin;
do $$
declare f uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); ch uuid:=gen_random_uuid();
 answer jsonb; n integer; item text:='tsi230-test-'||gen_random_uuid(); item_other text:='tsi230-test-'||gen_random_uuid();
begin
 if not public.tsi230_guest_rate(repeat('f',64),600,1) or public.tsi230_guest_rate(repeat('f',64),600,1) then raise exception 'durable rate limit failed'; end if;
 if has_table_privilege('anon','public.shop_items','select') then raise exception 'anon can read shop_items'; end if;
 if has_function_privilege('anon','public.tsi230_guest_verify_items(text,text[])','execute') then raise exception 'RPC exposed to anon'; end if;
 if has_function_privilege('authenticated','public.tsi230_guest_catalog(text,text,boolean)','execute') then raise exception 'RPC exposed to authenticated'; end if;
 insert into public.shop_items(id,data) values(item,jsonb_build_object('id',item,'title','Synthetic','folder','tsi230 synthetic','price',50,'img','data:image/jpeg;base64,/9j/AAAA')),
 (item_other,jsonb_build_object('id',item_other,'title','Synthetic other','folder','tsi230 other','price',50,'img','data:image/jpeg;base64,/9j/AAAA'));
 insert into public.tsi230_guest_folders(id,label,season_end,expires_at) values(f,'tsi230 synthetic',now()+interval '10 days',now()+interval '10 days');
 insert into public.tsi230_guest_folder_items values(f,item);
 insert into public.tsi230_guest_contacts(id,folder_id,name,email,relationship,approved) values(c,f,'Synthetic','guest@example.invalid','familiar',true);
 insert into public.tsi230_guest_invitations(id,contact_id,token_hash,expires_at) values(i,c,repeat('a',64),now()+interval '1 day');
 if not public.tsi230_guest_challenge(ch,repeat('a',64),'guest@example.invalid',repeat('b',64),null) then raise exception 'valid challenge failed'; end if;
 answer:=public.tsi230_guest_redeem(ch,repeat('b',64),repeat('c',64));
 if not (answer->>'allowed')::boolean then raise exception 'valid redeem failed'; end if;
 if (public.tsi230_guest_redeem(ch,repeat('b',64),repeat('d',64))->>'allowed')::boolean then raise exception 'OTP reused'; end if;
 if not (public.tsi230_guest_verify_items(repeat('c',64),array[item])->>'allowed')::boolean then raise exception 'scope rejected'; end if;
 if not (public.tsi230_guest_verify_items(repeat('c',64),'{}'::text[])->>'allowed')::boolean then raise exception 'variant session rejected'; end if;
 if (public.tsi230_guest_verify_items(repeat('c',64),array[item_other])->>'allowed')::boolean then raise exception 'cross-folder access'; end if;
 if (public.tsi230_guest_verify_items(repeat('c',64),array[item,item])->>'allowed')::boolean then raise exception 'duplicate IDs accepted'; end if;
 answer:=public.tsi230_guest_catalog(repeat('c',64),item,false);
 if answer->>'image'<>'data:image/jpeg;base64,/9j/AAAA' then raise exception 'preview contract failed'; end if;
 update public.shop_items set data=jsonb_set(data,'{folder}','"tsi230 other"') where id=item;
 if (public.tsi230_guest_verify_items(repeat('c',64),array[item])->>'allowed')::boolean then raise exception 'moved item permission widened'; end if;
 update public.shop_items set data=jsonb_set(data,'{folder}','"tsi230 synthetic"') where id=item;
 update public.tsi230_guest_contacts set approved=false where id=c;
 if (public.tsi230_guest_verify_items(repeat('c',64),array[item])->>'allowed')::boolean then raise exception 'revocation failed'; end if;
 update public.tsi230_guest_contacts set approved=true where id=c;
 update public.tsi230_guest_invitations set expires_at=now()-interval '1 second' where id=i;
 if (public.tsi230_guest_verify_items(repeat('c',64),'{}'::text[])->>'allowed')::boolean then raise exception 'expired invitation accepted'; end if;
 update public.tsi230_guest_invitations set expires_at=now()+interval '1 day' where id=i;
 perform public.tsi230_guest_logout(repeat('c',64));
 if (public.tsi230_guest_verify_items(repeat('c',64),array[item])->>'allowed')::boolean then raise exception 'logout failed'; end if;
 ch:=gen_random_uuid();perform public.tsi230_guest_challenge(ch,repeat('a',64),'guest@example.invalid',repeat('b',64),null);
 for n in 1..5 loop perform public.tsi230_guest_redeem(ch,repeat('d',64),repeat('e',64)); end loop;
 if (public.tsi230_guest_redeem(ch,repeat('b',64),repeat('e',64))->>'allowed')::boolean then raise exception 'attempt limit bypassed'; end if;
 begin
  insert into public.tsi230_guest_folders(label,season_end,expires_at) values('tsi230 invalid ttl',now()+interval '60 days',now()+interval '57 days');
  raise exception 'retention constraint missing';
 exception when check_violation then null; end;
 raise notice 'PASS guest230 backend scope, expiry, OTP, revocation, no anon privileges';
end $$;
rollback;
