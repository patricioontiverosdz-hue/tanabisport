-- Production 2.3.0: customer support is independent of Auth and of gallery access.
-- Only the production Edge function (service_role) can reach contacts or sessions.
begin;
create table public.tsi230_support_threads (
 id uuid primary key default gen_random_uuid(), folio text not null unique default ('TABI-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 session_hash text not null unique check(session_hash~'^[0-9a-f]{64}$'), expires_at timestamptz not null default now()+interval '30 days',
 contact_name text not null check(length(contact_name) between 2 and 100), contact_email text not null default '', contact_phone text not null default '',
 consent_at timestamptz not null default now(), category text not null default '', summary text not null default '',
 status text not null default 'Por atender' check(status in ('Por atender','En atención','Resuelta')), bot_paused boolean not null default false,
 submitted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
 check(contact_email<>'' or contact_phone<>'')
);
create index tsi230_support_queue on public.tsi230_support_threads(status,updated_at desc,id);
create table public.tsi230_support_messages (
 id bigint generated always as identity primary key, thread_id uuid not null references public.tsi230_support_threads(id) on delete cascade,
 kind text not null check(kind in ('client','bot','staff','system')), text text not null check(length(text) between 1 and 4000),
 author_id uuid references auth.users(id) on delete set null, author_name text not null, author_role text not null default '', created_at timestamptz not null default now()
);
create index tsi230_support_history on public.tsi230_support_messages(thread_id,id);
create table public.tsi230_support_requests (
 thread_id uuid not null references public.tsi230_support_threads(id) on delete cascade, request_id uuid not null, fingerprint text not null,
 created_at timestamptz not null default now(), primary key(thread_id,request_id)
);
create table public.tsi230_support_limits(key_hash text primary key check(key_hash~'^[0-9a-f]{64}$'), started_at timestamptz not null, hits int not null);
create table public.tsi230_team_avatars (
 user_id uuid primary key references auth.users(id) on delete cascade,
 avatar text not null check(length(avatar)<=355000 and (avatar='' or avatar~'^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+=*$')),
 updated_at timestamptz not null default now()
);
alter table public.tsi230_support_threads enable row level security;
alter table public.tsi230_support_messages enable row level security;
alter table public.tsi230_support_requests enable row level security;
alter table public.tsi230_support_limits enable row level security;
alter table public.tsi230_team_avatars enable row level security;
revoke all on public.tsi230_support_threads,public.tsi230_support_messages,public.tsi230_support_requests,public.tsi230_support_limits,public.tsi230_team_avatars from public,anon,authenticated;
grant all on public.tsi230_support_threads,public.tsi230_support_messages,public.tsi230_support_requests,public.tsi230_support_limits,public.tsi230_team_avatars to service_role;
revoke all on sequence public.tsi230_support_messages_id_seq from public,anon,authenticated;
grant usage,select on sequence public.tsi230_support_messages_id_seq to service_role;
-- Defense in depth if read grants are deliberately added in a future migration.
create policy tsi230_avatar_owner_read on public.tsi230_team_avatars for select to authenticated using(user_id=(select auth.uid()) and (select public.my_role()) in ('admin','foto','editora'));
create policy tsi230_avatar_owner_update on public.tsi230_team_avatars for update to authenticated using(user_id=(select auth.uid()) and (select public.my_role()) in ('admin','foto','editora')) with check(user_id=(select auth.uid()) and (select public.my_role()) in ('admin','foto','editora'));

create function public.tsi230_support_rate(key_hash text,limit_count integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if key_hash!~'^[0-9a-f]{64}$' or limit_count not between 1 and 120 then raise exception 'SUPPORT_FORBIDDEN'; end if;
 insert into public.tsi230_support_limits as r values(key_hash,clock_timestamp(),1) on conflict on constraint tsi230_support_limits_pkey do update
 set hits=case when r.started_at<clock_timestamp()-interval '10 minutes' then 1 else r.hits+1 end,
 started_at=case when r.started_at<clock_timestamp()-interval '10 minutes' then clock_timestamp() else r.started_at end returning hits into n;
 if n>limit_count then raise exception 'SUPPORT_LIMIT'; end if;
 delete from public.tsi230_support_limits where started_at<now()-interval '1 day';
 return jsonb_build_object('allowed',true);
end $$;

create function public.tsi230_support_command(operation text,payload jsonb,session_hash text default null,actor uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.tsi230_support_threads; who public.profiles; previous text; fingerprint text; question text; message_text text; result jsonb; rid uuid;
begin
 if actor is not null then
  select * into who from public.profiles where id=actor;
  if not found or who.role not in ('admin','foto','editora') then raise exception 'SUPPORT_FORBIDDEN'; end if;
 elsif operation like 'staff-%' or operation in ('profile','avatar') then raise exception 'SUPPORT_FORBIDDEN'; end if;
 if operation in ('profile','avatar') then
  if operation='avatar' then
   insert into public.tsi230_team_avatars(user_id,avatar) values(actor,payload->>'avatar') on conflict(user_id) do update set avatar=excluded.avatar,updated_at=now();
  end if;
  return jsonb_build_object('user_id',actor,'avatar',coalesce((select avatar from public.tsi230_team_avatars where user_id=actor),''));
 end if;
 if operation='staff-list' then
  select jsonb_build_object('threads',coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb),'offset',coalesce((payload->>'offset')::int,0)) into result from (
   select id,folio,contact_name,category,status,bot_paused,summary,submitted_at,updated_at,version from public.tsi230_support_threads
   where (coalesce(payload->>'status','')='' or status=payload->>'status') order by updated_at desc,id limit 51 offset coalesce((payload->>'offset')::int,0)
  ) q;return result;
 end if;
 if actor is not null then
  select * into t from public.tsi230_support_threads where id=(payload->>'thread_id')::uuid for update;
 else
  if session_hash is null or session_hash!~'^[0-9a-f]{64}$' then raise exception 'SUPPORT_EXPIRED'; end if;
  if operation='register' then
   insert into public.tsi230_support_threads(session_hash,contact_name,contact_email,contact_phone)
   values(session_hash,payload->>'name',coalesce(payload->>'email',''),coalesce(payload->>'phone','')) on conflict on constraint tsi230_support_threads_session_hash_key do nothing;
  end if;
  select * into t from public.tsi230_support_threads where tsi230_support_threads.session_hash=tsi230_support_command.session_hash and expires_at>now() for update;
 end if;
 if t.id is null then raise exception 'SUPPORT_EXPIRED'; end if;
 if not exists(select 1 from public.tsi230_support_messages where thread_id=t.id) then
  insert into public.tsi230_support_messages(thread_id,kind,text,author_name) values(t.id,'bot','¡Hola! 👋 Soy TABI, el asistente virtual de Tanabi. Elige el motivo de tu consulta y te ayudo a preparar una solicitud para el equipo.','TABI · asistente virtual');
 end if;
 if operation not in ('register','history','staff-thread') then
  rid:=(payload->>'request_id')::uuid; if rid is null then raise exception 'SUPPORT_CONFLICT';end if;
  fingerprint:=md5(operation||payload::text);
  select r.fingerprint into previous from public.tsi230_support_requests r where r.thread_id=t.id and r.request_id=rid;
  if previous is not null and previous<>fingerprint then raise exception 'SUPPORT_CONFLICT';end if;
  if previous is null then
   insert into public.tsi230_support_requests values(t.id,rid,fingerprint,now());
   if operation='category' then
    if payload->>'category' not in ('Cotización','Entrega','Tienda','Correcciones','Pagos','FAQ','Humano') then raise exception 'SUPPORT_CONFLICT';end if;
    update public.tsi230_support_threads set category=payload->>'category',summary='',version=version+1,updated_at=now() where id=t.id;
    question:=case payload->>'category'
      when 'Cotización' then '📷 ¿Qué deporte y tipo de cobertura buscas? Indica fecha, horario, lugar y equipo o evento. Si algo falta, escribe «por confirmar».'
      when 'Entrega' then '📦 ¿De qué evento o partido esperas fotos? Indica fecha y folio de pedido, si lo tienes. No compartas enlaces privados ni contraseñas.'
      when 'Tienda' then '🛍️ ¿Qué producto o foto te interesa? Indica nombre del artículo, talla o variante y tu duda.'
      when 'Correcciones' then '✏️ ¿Qué debemos corregir? Indica evento, fecha, pedido y cambio solicitado. Evita subir documentos personales.'
      when 'Pagos' then '💳 ¿Cuál es tu duda de pago? Indica folio, fecha y monto aproximado. Nunca envíes números completos de tarjeta, códigos ni contraseñas.'
      when 'FAQ' then '💡 Las coberturas, disponibilidad y entregas se confirman con el equipo. Puedes explorar Tienda y enviar aquí tu pregunta para recibir una respuesta concreta. ¿Qué necesitas saber?'
      else '🙋 Te ayudamos a contactar al equipo. Cuéntanos brevemente qué necesitas para dirigir tu solicitud.' end;
    if not t.bot_paused then insert into public.tsi230_support_messages(thread_id,kind,text,author_name) values(t.id,'bot',question,'TABI · asistente virtual');end if;
   elsif operation in ('draft','submit') then
    update public.tsi230_support_threads set category=payload->>'category',summary=payload->>'summary',updated_at=now(),version=version+1,
      submitted_at=case when operation='submit' then now() else submitted_at end,status=case when operation='submit' and status='Resuelta' then 'Por atender' else status end where id=t.id;
    if operation='submit' then
     insert into public.tsi230_support_messages(thread_id,kind,text,author_name) values(t.id,'client',(payload->>'category')||E'\n'||(payload->>'summary'),'Cliente');
     if not t.bot_paused then insert into public.tsi230_support_messages(thread_id,kind,text,author_name) values(t.id,'bot','¡Listo! ✅ Tu solicitud '||t.folio||' quedó registrada para el equipo. Puedes añadir información aquí y consultar su estado.','TABI · asistente virtual');end if;
    end if;
   elsif operation='message' then
    if (select count(*) from public.tsi230_support_messages where thread_id=t.id)>1000 then raise exception 'SUPPORT_LIMIT';end if;
    insert into public.tsi230_support_messages(thread_id,kind,text,author_name) values(t.id,'client',payload->>'text','Cliente');
    update public.tsi230_support_threads set status=case when status='Resuelta' then 'Por atender' else status end,updated_at=now(),version=version+1 where id=t.id;
   elsif operation='staff-message' then
    insert into public.tsi230_support_messages(thread_id,kind,text,author_id,author_name,author_role) values(t.id,'staff',payload->>'text',actor,coalesce(who.name,'Equipo Tanabi'),who.role);
    update public.tsi230_support_threads set bot_paused=true,status='En atención',updated_at=now(),version=version+1 where id=t.id;
   elsif operation='staff-status' then
    if payload->>'status' not in ('Por atender','En atención','Resuelta') then raise exception 'SUPPORT_CONFLICT';end if;
    update public.tsi230_support_threads set status=payload->>'status',bot_paused=true,updated_at=now(),version=version+1 where id=t.id;
    insert into public.tsi230_support_messages(thread_id,kind,text,author_id,author_name,author_role) values(t.id,'system','Estado: '||(payload->>'status'),actor,coalesce(who.name,'Equipo Tanabi'),who.role);
   else raise exception 'SUPPORT_CONFLICT';end if;
  end if;
 end if;
 select * into t from public.tsi230_support_threads where id=t.id;
 result:=jsonb_build_object('thread',jsonb_build_object('id',t.id,'folio',t.folio,'category',t.category,'summary',t.summary,'status',t.status,'bot_paused',t.bot_paused,'submitted_at',t.submitted_at,'updated_at',t.updated_at,'version',t.version),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'text',m.text,'author_name',m.author_name,'author_id',case when actor is not null then m.author_id end,'author_role',m.author_role,'created_at',m.created_at) order by m.id) from public.tsi230_support_messages m where m.thread_id=t.id),'[]'::jsonb));
 if actor is not null then result:=result||jsonb_build_object('contact',jsonb_build_object('name',t.contact_name,'email',t.contact_email,'phone',t.contact_phone,'consent_at',t.consent_at));end if;
 return result;
end $$;
revoke all on function public.tsi230_support_rate(text,integer),public.tsi230_support_command(text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.tsi230_support_rate(text,integer),public.tsi230_support_command(text,jsonb,text,uuid) to service_role;
commit;
