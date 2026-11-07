-- Reviewable schema source. Create the migration filename with Supabase CLI.
-- STAGING ONLY: nksqpoigywfegcbvfhoa. Never apply to production.
begin;

create table public.tsi230_guest_folders (
 id uuid primary key default gen_random_uuid(), label text not null unique check(length(btrim(label)) between 1 and 60),
 created_at timestamptz not null default now(), season_end timestamptz not null,
 expires_at timestamptz not null, revoked_at timestamptz,
 check(expires_at<=created_at+interval '56 days' and expires_at<=season_end)
);
create table public.tsi230_guest_folder_items (
 folder_id uuid not null references public.tsi230_guest_folders(id) on delete cascade,
 item_id text not null references public.shop_items(id) on delete cascade,
 primary key(folder_id,item_id), unique(item_id)
);
create table public.tsi230_guest_contacts (
 id uuid primary key default gen_random_uuid(), folder_id uuid not null references public.tsi230_guest_folders(id),
 name text not null check(length(btrim(name)) between 1 and 80),
 email text not null check(length(email)<=254 and email=lower(btrim(email)) and email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
 relationship text not null check(relationship in ('jugador','familiar')), approved boolean not null default false,
 created_at timestamptz not null default now(), revoked_at timestamptz,
 unique(folder_id,email)
);
create table public.tsi230_guest_invitations (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.tsi230_guest_contacts(id),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 revoked_at timestamptz, test_mode boolean not null default false,
 check(expires_at<=created_at+interval '7 days')
);
create table public.tsi230_guest_challenges (
 id uuid primary key, invitation_id uuid not null references public.tsi230_guest_invitations(id) on delete cascade,
 otp_hash text not null check(otp_hash ~ '^[a-f0-9]{64}$'), attempts integer not null default 0 check(attempts between 0 and 5),
 created_at timestamptz not null default now(), expires_at timestamptz not null, used_at timestamptz,
 check(expires_at<=created_at+interval '5 minutes')
);
create table public.tsi230_guest_sessions (
 id uuid primary key default gen_random_uuid(), invitation_id uuid not null references public.tsi230_guest_invitations(id),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz,
 check(expires_at<=created_at+interval '2 hours')
);
create table public.tsi230_guest_rates (
 bucket text primary key check(bucket ~ '^[a-f0-9]{64}$'), window_at timestamptz not null default now(), hits integer not null default 1
);

alter table public.tsi230_guest_folders enable row level security;
alter table public.tsi230_guest_folder_items enable row level security;
alter table public.tsi230_guest_contacts enable row level security;
alter table public.tsi230_guest_invitations enable row level security;
alter table public.tsi230_guest_challenges enable row level security;
alter table public.tsi230_guest_sessions enable row level security;
alter table public.tsi230_guest_rates enable row level security;
revoke all on public.tsi230_guest_folders,public.tsi230_guest_folder_items,public.tsi230_guest_contacts,
 public.tsi230_guest_invitations,public.tsi230_guest_challenges,public.tsi230_guest_sessions,public.tsi230_guest_rates from public,anon,authenticated;
grant all on public.tsi230_guest_folders,public.tsi230_guest_folder_items,public.tsi230_guest_contacts,
 public.tsi230_guest_invitations,public.tsi230_guest_challenges,public.tsi230_guest_sessions,public.tsi230_guest_rates to service_role;

-- Close both legacy anon grants and permissive authenticated read policies.
revoke select on public.shop_items from anon;
create policy tsi230_shop_staff_read on public.shop_items as restrictive for select to authenticated
 using ((select auth.uid()) is not null and (select public.my_role()) in ('admin','editora'));

create function public.tsi230_guest_rate(bucket text,window_seconds integer,max_hits integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if bucket !~ '^[a-f0-9]{64}$' or window_seconds not between 1 and 86400 or max_hits not between 1 and 1000 then return false; end if;
 insert into public.tsi230_guest_rates as r(bucket) values($1)
 on conflict on constraint tsi230_guest_rates_pkey do update set
 hits=case when r.window_at<=now()-make_interval(secs=>$2) then 1 else r.hits+1 end,
 window_at=case when r.window_at<=now()-make_interval(secs=>$2) then now() else r.window_at end
 returning hits into n;
 return n<=max_hits;
end $$;

create function public.tsi230_guest_verify_items(session_hash text,item_ids text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare access_row record; requested integer;
begin
 if session_hash !~ '^[a-f0-9]{64}$' or item_ids is null or cardinality(item_ids)>50 then return jsonb_build_object('allowed',false); end if;
 select c.id contact_id,f.id folder_id,least(s.expires_at,i.expires_at,f.expires_at,f.season_end) expires_at into access_row
 from public.tsi230_guest_sessions s join public.tsi230_guest_invitations i on i.id=s.invitation_id
 join public.tsi230_guest_contacts c on c.id=i.contact_id join public.tsi230_guest_folders f on f.id=c.folder_id
 where s.token_hash=$1 and s.revoked_at is null and i.revoked_at is null and c.revoked_at is null
 and f.revoked_at is null and c.approved and s.expires_at>now() and i.expires_at>now() and f.expires_at>now() and f.season_end>now();
 if not found then return jsonb_build_object('allowed',false); end if;
 select count(distinct x) into requested from unnest(item_ids) x;
 if requested<>cardinality(item_ids) or exists(select 1 from unnest(item_ids) x where x is null or not exists(
  select 1 from public.tsi230_guest_folder_items fi join public.shop_items p on p.id=fi.item_id
  join public.tsi230_guest_folders f on f.id=fi.folder_id
  where fi.folder_id=access_row.folder_id and fi.item_id=x and p.data->>'folder'=f.label)) then return jsonb_build_object('allowed',false); end if;
 return jsonb_build_object('allowed',true,'contact_id',access_row.contact_id,'folder_ids',jsonb_build_array(access_row.folder_id),'expires_at',access_row.expires_at);
end $$;

create function public.tsi230_guest_challenge(challenge_id uuid,invitation_hash text,email_address text,code_hash text,test_invitation_id uuid default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare invite record;
begin
 select i.id,least(i.expires_at,f.expires_at,now()+interval '5 minutes') expires_at into invite
 from public.tsi230_guest_invitations i join public.tsi230_guest_contacts c on c.id=i.contact_id
 join public.tsi230_guest_folders f on f.id=c.folder_id
 where ((test_invitation_id is null and i.token_hash=invitation_hash and c.email=email_address and not i.test_mode)
 or (test_invitation_id is not null and i.id=test_invitation_id and i.test_mode))
 and i.revoked_at is null and c.revoked_at is null and f.revoked_at is null and c.approved
 and i.expires_at>now() and f.expires_at>now() and f.season_end>now();
 if not found then return false; end if;
 update public.tsi230_guest_challenges set used_at=now() where invitation_id=invite.id and used_at is null;
 insert into public.tsi230_guest_challenges(id,invitation_id,otp_hash,expires_at) values(challenge_id,invite.id,code_hash,invite.expires_at);
 return true;
end $$;

create function public.tsi230_guest_redeem(challenge_id uuid,code_hash text,session_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare challenge public.tsi230_guest_challenges%rowtype; invite record; expiry timestamptz;
begin
 select ch.* into challenge from public.tsi230_guest_challenges ch where ch.id=$1 for update;
 if not found or challenge.used_at is not null or challenge.expires_at<=now() or challenge.attempts>=5 then return jsonb_build_object('allowed',false); end if;
 update public.tsi230_guest_challenges set attempts=attempts+1 where id=$1;
 if challenge.otp_hash is distinct from code_hash then return jsonb_build_object('allowed',false); end if;
 select i.id,least(i.expires_at,f.expires_at,f.season_end,now()+interval '2 hours') expires_at into invite
 from public.tsi230_guest_invitations i join public.tsi230_guest_contacts c on c.id=i.contact_id
 join public.tsi230_guest_folders f on f.id=c.folder_id where i.id=challenge.invitation_id and i.revoked_at is null
 and c.revoked_at is null and f.revoked_at is null and c.approved and i.expires_at>now() and f.expires_at>now() and f.season_end>now();
 if not found then return jsonb_build_object('allowed',false); end if;
 update public.tsi230_guest_challenges set used_at=now() where id=$1;
 insert into public.tsi230_guest_sessions(invitation_id,token_hash,expires_at) values(invite.id,session_hash,invite.expires_at);
 return jsonb_build_object('allowed',true,'expires_at',invite.expires_at);
end $$;

create function public.tsi230_guest_catalog(session_hash text,item_key text default null,original boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare permission jsonb; result jsonb; folder_key uuid;
begin
 permission:=public.tsi230_guest_verify_items(session_hash,case when item_key is null then '{}'::text[] else array[item_key] end);
 if not coalesce((permission->>'allowed')::boolean,false) then return jsonb_build_object('allowed',false); end if;
 folder_key:=(permission->'folder_ids'->>0)::uuid;
 if item_key is null then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.data->>'title','price',p.data->'price','folder_id',fi.folder_id) order by p.id),'[]'::jsonb) into result
  from public.tsi230_guest_folder_items fi join public.shop_items p on p.id=fi.item_id
  join public.tsi230_guest_folders f on f.id=fi.folder_id where fi.folder_id=folder_key and p.data->>'folder'=f.label;
  return jsonb_build_object('allowed',true,'items',result,'expires_at',permission->'expires_at');
 end if;
 -- Every image response rechecks the same live grant. No reusable signed URL.
 select to_jsonb(case when original then s.img else p.data->>'img' end) into result
 from public.shop_items p left join public.tsi224_shop_sources s on s.item_id=p.id where p.id=item_key;
 return jsonb_build_object('allowed',true,'image',result,'expires_at',permission->'expires_at');
end $$;

create function public.tsi230_guest_logout(session_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.tsi230_guest_sessions s set revoked_at=now() where s.token_hash=$1 and s.revoked_at is null;
 return true;
end $$;

create function public.tsi230_guest_admin(actor_id uuid,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare folder_key uuid; contact_key uuid; invite_key uuid; season timestamptz; row_data record;
begin
 if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'Administración requerida' using errcode='42501'; end if;
 if operation='folder-create' then
  season:=(payload->>'season_end')::timestamptz;
  if season<=now() or length(btrim(payload->>'label')) not between 1 and 60 then raise exception 'Carpeta o fin de temporada inválidos'; end if;
  if exists(select 1 from public.tsi230_guest_folders where label=btrim(payload->>'label')) then raise exception 'La carpeta ya está registrada'; end if;
  insert into public.tsi230_guest_folders(label,season_end,expires_at) values(btrim(payload->>'label'),season,least(now()+interval '56 days',season)) returning id into folder_key;
  insert into public.tsi230_guest_folder_items(folder_id,item_id) select folder_key,id from public.shop_items where data->>'folder'=btrim(payload->>'label');
 elsif operation='folder-sync' then
  folder_key:=(payload->>'folder_id')::uuid;
  if not exists(select 1 from public.tsi230_guest_folders where id=folder_key and revoked_at is null and expires_at>now()) then raise exception 'Carpeta vencida'; end if;
  insert into public.tsi230_guest_folder_items(folder_id,item_id)
  select f.id,p.id from public.tsi230_guest_folders f join public.shop_items p on p.data->>'folder'=f.label where f.id=folder_key on conflict do nothing;
 elsif operation='contact-create' then
  folder_key:=(payload->>'folder_id')::uuid;
  if payload->>'approved'<>'true' or not exists(select 1 from public.tsi230_guest_folders where id=folder_key and revoked_at is null and expires_at>now()) then raise exception 'Aprueba el contacto de una carpeta vigente'; end if;
  insert into public.tsi230_guest_contacts(folder_id,name,email,relationship,approved)
  values(folder_key,btrim(payload->>'name'),lower(btrim(payload->>'email')),payload->>'relationship',true);
 elsif operation='invite-create' then
  contact_key:=(payload->>'contact_id')::uuid;
  select c.id,least(f.expires_at,now()+interval '7 days',(payload->>'expires_at')::timestamptz) expires_at into row_data
  from public.tsi230_guest_contacts c join public.tsi230_guest_folders f on f.id=c.folder_id
  where c.id=contact_key and c.approved and c.revoked_at is null and f.revoked_at is null and f.expires_at>now();
  if not found or row_data.expires_at<=now() then raise exception 'Contacto o caducidad inválidos'; end if;
  insert into public.tsi230_guest_invitations(contact_id,token_hash,expires_at,test_mode)
  values(contact_key,payload->>'token_hash',row_data.expires_at,coalesce((payload->>'test_mode')::boolean,false)) returning id into invite_key;
 elsif operation='revoke' then
  if payload->>'kind'='folder' then update public.tsi230_guest_folders set revoked_at=now() where id=(payload->>'id')::uuid;
  elsif payload->>'kind'='contact' then update public.tsi230_guest_contacts set revoked_at=now(),approved=false where id=(payload->>'id')::uuid;
  elsif payload->>'kind'='invitation' then update public.tsi230_guest_invitations set revoked_at=now() where id=(payload->>'id')::uuid;
  elsif payload->>'kind'='session' then update public.tsi230_guest_sessions set revoked_at=now() where id=(payload->>'id')::uuid;
  else raise exception 'Revocación inválida'; end if;
 elsif operation<>'state' then raise exception 'Operación inválida'; end if;
 return jsonb_build_object('invitation_id',invite_key,
  'folders',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('item_count',(select count(*) from public.tsi230_guest_folder_items fi where fi.folder_id=f.id))) from public.tsi230_guest_folders f),'[]'::jsonb),
  'available_folders',coalesce((select jsonb_agg(label) from (select distinct data->>'folder' label from public.shop_items where length(data->>'folder')>0) q),'[]'::jsonb),
  'contacts',coalesce((select jsonb_agg(to_jsonb(c)) from public.tsi230_guest_contacts c),'[]'::jsonb),
  'invitations',coalesce((select jsonb_agg(to_jsonb(i)-'token_hash') from public.tsi230_guest_invitations i),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(to_jsonb(s)-'token_hash') from public.tsi230_guest_sessions s),'[]'::jsonb));
end $$;

create function public.tsi230_guest_purge() returns integer
language plpgsql security invoker set search_path='' as $$
declare total integer;
begin
 -- Delete the original first; shop_items then cascades the scoped mapping.
 delete from public.tsi224_shop_sources where item_id in(select fi.item_id from public.tsi230_guest_folder_items fi join public.tsi230_guest_folders f on f.id=fi.folder_id where f.expires_at<=now() or f.season_end<=now());
 delete from public.shop_items where id in(select fi.item_id from public.tsi230_guest_folder_items fi join public.tsi230_guest_folders f on f.id=fi.folder_id where f.expires_at<=now() or f.season_end<=now());
 get diagnostics total=row_count;
 delete from public.tsi230_guest_challenges where expires_at<now()-interval '1 day';
 delete from public.tsi230_guest_sessions where expires_at<now()-interval '1 day';
 delete from public.tsi230_guest_invitations where expires_at<now()-interval '1 day';
 delete from public.tsi230_guest_contacts c using public.tsi230_guest_folders f where c.folder_id=f.id and f.expires_at<now()-interval '1 day';
 delete from public.tsi230_guest_folders where expires_at<now()-interval '1 day';
 delete from public.tsi230_guest_rates where window_at<now()-interval '1 day';
 return total;
end $$;

revoke all on function public.tsi230_guest_rate(text,integer,integer),public.tsi230_guest_verify_items(text,text[]),
 public.tsi230_guest_challenge(uuid,text,text,text,uuid),public.tsi230_guest_redeem(uuid,text,text),
 public.tsi230_guest_catalog(text,text,boolean),public.tsi230_guest_logout(text),public.tsi230_guest_admin(uuid,text,jsonb),public.tsi230_guest_purge() from public,anon,authenticated;
grant execute on function public.tsi230_guest_rate(text,integer,integer),public.tsi230_guest_verify_items(text,text[]),
 public.tsi230_guest_challenge(uuid,text,text,text,uuid),public.tsi230_guest_redeem(uuid,text,text),
 public.tsi230_guest_catalog(text,text,boolean),public.tsi230_guest_logout(text),public.tsi230_guest_admin(uuid,text,jsonb),public.tsi230_guest_purge() to service_role;

-- pg_cron is already present in staging. Access closes exactly at expires_at;
-- physical previews/originals are removed by the next minute's retention sweep.
select cron.schedule('tsi230-guest-retention','* * * * *','select public.tsi230_guest_purge();');
commit;
