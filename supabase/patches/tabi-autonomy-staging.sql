begin;
alter table public.tsi230_support_threads add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.tsi230_support_threads add column if not exists assistant_state jsonb not null default '{}';
create table public.tsi231_support_answers(
 thread_id uuid references public.tsi230_support_threads(id) on delete cascade,
 request_id uuid not null, created_at timestamptz not null default now(), primary key(thread_id,request_id)
);
create table public.tsi231_support_bookings(
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null unique references public.tsi230_support_threads(id) on delete cascade,
 folio text not null unique default ('COT-'||upper(replace(gen_random_uuid()::text,'-',''))),
 match_id text not null, sport text not null check(sport in ('flag','tackle')),
 package text not null check(package in ('equipo','individual')),
 players integer not null check(players between 1 and 100),
 team text not null check(length(team) between 2 and 120), total numeric(12,2) not null check(total>=0),
 deposit numeric(12,2), paid numeric(12,2) not null default 0 check(paid>=0),
 discount numeric(12,2) not null default 0 check(discount>=0),
 status text not null default 'Cotizada' check(status in ('Cotizada','Confirmada','Cancelación solicitada','Cancelada')),
 progress text not null default 'Programada' check(progress in ('Programada','En edición','Lista','Entregada')),
 delivery_url text not null default '', confirmed_at timestamptz, policy_text text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tsi231_support_config(
 id boolean primary key default true check(id),
 individual_deposit numeric(12,2) check(individual_deposit between 0 and 650),
 payment_instructions text not null default '' check(length(payment_instructions)<=2000)
);
insert into public.tsi231_support_config(id) values(true) on conflict do nothing;
alter table public.tsi231_support_answers enable row level security;
alter table public.tsi231_support_bookings enable row level security;
alter table public.tsi231_support_config enable row level security;
revoke all on public.tsi231_support_answers,public.tsi231_support_bookings,public.tsi231_support_config from public,anon,authenticated;
grant all on public.tsi231_support_answers,public.tsi231_support_bookings,public.tsi231_support_config to service_role;

create or replace function public.tsi231_support_snapshot(p_thread uuid,p_session text,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; t public.tsi230_support_threads; b public.tsi231_support_bookings;
begin
 select * into t from public.tsi230_support_threads where id=p_thread;
 if p_actor is null then
  if t.session_hash is distinct from p_session or t.expires_at<=now() then raise exception 'SUPPORT_EXPIRED';end if;
  r:=public.tsi230_support_command('history','{}',p_session,null);
 else r:=public.tsi230_support_command('staff-thread',jsonb_build_object('thread_id',p_thread),null,p_actor);end if;
 select * into b from public.tsi231_support_bookings where thread_id=p_thread;
 return r||jsonb_build_object('assistant_state',t.assistant_state,
  'owner',case when t.assigned_to is null then null else jsonb_build_object('id',t.assigned_to,'name',(select name from public.profiles where id=t.assigned_to)) end,
  'booking',case when b.id is null then null else jsonb_build_object('id',b.id,'folio',b.folio,'match_id',b.match_id,'sport',b.sport,'package',b.package,'players',b.players,'team',b.team,'total',b.total,'deposit',b.deposit,'paid',b.paid,'discount',b.discount,'balance',greatest(0,b.total-b.discount-b.paid),'status',b.status,'progress',b.progress,'delivery_url',b.delivery_url,'confirmed_at',b.confirmed_at,'policy_text',b.policy_text) end,
  'settings',jsonb_build_object('individual_deposit',(select individual_deposit from public.tsi231_support_config where id),'payment_instructions',(select payment_instructions from public.tsi231_support_config where id)));
end $$;

create or replace function public.tsi231_support_command(operation text,payload jsonb,session_hash text default null,actor uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.tsi230_support_threads; b public.tsi231_support_bookings; who public.profiles; r jsonb; m public.matches;
 rid uuid; amount numeric; advance numeric; count_players integer; msg text; answer_count integer; discount_value numeric;
begin
 if actor is not null then
  select * into who from public.profiles where id=actor;
  if not found or who.role not in ('admin','foto','editora') then raise exception 'SUPPORT_FORBIDDEN';end if;
 elsif operation like 'staff-%' or operation in ('profile','avatar') then raise exception 'SUPPORT_FORBIDDEN';end if;
 if operation in ('profile','avatar','register','staff-list') then
  r:=public.tsi230_support_command(operation,payload,session_hash,actor);
  if operation='register' then
   update public.tsi230_support_messages set text='¡Hola! Soy TABI 📷✨ Puedo explicarte los paquetes, cotizar, consultar partidos con fotógrafo y revisar el seguimiento de esta conversación. Si necesitas ayuda del equipo, te transfiero con tu historial.'
   where thread_id=(r->'thread'->>'id')::uuid and kind='bot' and text='¡Hola! 👋 Soy TABI, el asistente virtual de Tanabi. Elige el motivo de tu consulta y te ayudo a preparar una solicitud para el equipo.';
   return public.tsi231_support_snapshot((r->'thread'->>'id')::uuid,session_hash,actor);end if;
  if operation='staff-list' then
   select coalesce(jsonb_agg(item||jsonb_build_object('owner_name',p.name,'assigned_to',t2.assigned_to)),'[]') into r
   from jsonb_array_elements(r->'threads') item
   join public.tsi230_support_threads t2 on t2.id=(item->>'id')::uuid left join public.profiles p on p.id=t2.assigned_to;
   return jsonb_build_object('threads',r);
  end if;
  return r;
 end if;
 if actor is not null then select * into t from public.tsi230_support_threads where id=(payload->>'thread_id')::uuid for update;
 else select * into t from public.tsi230_support_threads x where x.session_hash=tsi231_support_command.session_hash and expires_at>now() for update;end if;
 if t.id is null then raise exception 'SUPPORT_EXPIRED';end if;
 if operation in ('staff-message','staff-status','staff-booking','staff-resume','staff-claim') then
  if t.assigned_to is not null and t.assigned_to<>actor and who.role<>'admin' then raise exception 'SUPPORT_CONFLICT';end if;
 end if;
 if operation='slots' then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'teams',q.data->>'teams','date',q.data->>'date','time',q.data->>'time','venue',q.data->>'venue','sport',case when upper(q.data->>'cat') like '%FLAG%' then 'flag' else 'tackle' end) order by q.data->>'date',q.data->>'time'),'[]') into r from
   (select * from public.matches x where
    coalesce(x.data->>'date','')~'^\d{4}-\d{2}-\d{2}$'
    and x.data->>'date'>=(now() at time zone 'America/Monterrey')::date::text
    and coalesce(x.data->>'stage','') not in ('archivado','archived','cancelado','cancelled','borrador','incompleto')
    and coalesce(x.data->>'teams','')<>'' and coalesce(x.data->>'venue','')<>''
    and coalesce(x.data->>'time','')~'^([01]\d|2[0-3]):[0-5]\d$'
    and ((x.data->>'date')||'T'||(x.data->>'time'))>to_char(now() at time zone 'America/Monterrey','YYYY-MM-DD"T"HH24:MI')
    and exists(select 1 from public.profiles p where p.role in ('admin','foto') and p.id::text in (x.data->>'f1',x.data->>'f2'))
    order by x.data->>'date',x.data->>'time' limit 80) q;
  return jsonb_build_object('slots',r);
 end if;
 if operation='assist' then
  rid:=(payload->>'request_id')::uuid;
  if rid is null then raise exception 'SUPPORT_CONFLICT';end if;
  if exists(select 1 from public.tsi231_support_answers where thread_id=t.id and request_id=rid) then return public.tsi231_support_snapshot(t.id,session_hash,actor);end if;
  if t.bot_paused then return public.tsi231_support_snapshot(t.id,session_hash,actor);end if;
  if t.version<>(payload->>'expected_version')::bigint then return public.tsi231_support_snapshot(t.id,session_hash,actor)||'{"retry_assistant":true}'::jsonb;end if;
  if length(coalesce(payload->>'reply','')) not between 1 and 4000 or length((payload->'state')::text)>4000 then raise exception 'SUPPORT_CONFLICT';end if;
  insert into public.tsi231_support_answers(thread_id,request_id) values(t.id,rid);
  insert into public.tsi230_support_messages(thread_id,kind,text,author_name) values(t.id,'bot',payload->>'reply','TABI · asistente virtual');
  update public.tsi230_support_threads set assistant_state=payload->'state',bot_paused=coalesce((payload->>'handoff')::boolean,false),
   status=case when coalesce((payload->>'handoff')::boolean,false) then 'Por atender' else status end,updated_at=now(),version=version+1 where id=t.id;
 elsif operation in ('quote','confirm') then
  if t.bot_paused then raise exception 'SUPPORT_CONFLICT';end if;
  rid:=(payload->>'request_id')::uuid;if rid is null then raise exception 'SUPPORT_CONFLICT';end if;
  if exists(select 1 from public.tsi231_support_answers where thread_id=t.id and request_id=rid) then return public.tsi231_support_snapshot(t.id,session_hash,actor);end if;
  if operation='quote' then
   if payload->>'sport' not in ('flag','tackle') or payload->>'package' not in ('equipo','individual') then raise exception 'SUPPORT_CONFLICT';end if;
   count_players:=(payload->>'players')::integer;
   if count_players not between 1 and 100 or length(coalesce(payload->>'team','')) not between 2 and 120 then raise exception 'SUPPORT_CONFLICT';end if;
   if payload->>'package'='individual' then
    if count_players<>1 then raise exception 'SUPPORT_CONFLICT';end if;amount:=650;
    select individual_deposit into advance from public.tsi231_support_config where id;
   else
    if count_players<(case when payload->>'sport'='flag' then 6 else 12 end) then raise exception 'SUPPORT_MINIMUM';end if;
    amount:=count_players*case when payload->>'sport'='flag' then 200 else 250 end;
    advance:=3*case when payload->>'sport'='flag' then 200 else 250 end;
   end if;
   select * into m from public.matches where id=payload->>'match_id' for share;
   if m.id is null or not exists(select 1 from jsonb_array_elements(public.tsi231_support_command('slots','{}',session_hash,null)->'slots') x where x->>'id'=m.id and x->>'sport'=payload->>'sport') then raise exception 'SUPPORT_UNAVAILABLE';end if;
   if exists(select 1 from public.tsi231_support_bookings where thread_id=t.id and status<>'Cotizada') then raise exception 'SUPPORT_CONFLICT';end if;
   insert into public.tsi231_support_bookings(thread_id,match_id,sport,package,players,team,total,deposit)
   values(t.id,m.id,payload->>'sport',payload->>'package',count_players,payload->>'team',amount,advance)
   on conflict(thread_id) do update set match_id=excluded.match_id,sport=excluded.sport,package=excluded.package,players=excluded.players,team=excluded.team,total=excluded.total,deposit=excluded.deposit,updated_at=now();
   msg:='¡Tu cotización está lista! 📷 Total: $'||amount||' MXN. '||
     case when advance is null then 'El anticipo individual está pendiente de configurar por Administración; no confirmaremos un monto inventado.' else 'Anticipo mínimo: $'||advance||' MXN.' end||
     ' Entrega de lunes a miércoles posteriores al juego. El acceso al campo no está incluido cuando tenga costo. Revisa los datos y pulsa Confirmar cobertura para aceptar las condiciones.';
  else
   select * into b from public.tsi231_support_bookings where thread_id=t.id for update;
   if b.id is null or b.id::text is distinct from payload->>'booking_id' or b.status<>'Cotizada' or payload->>'accept_terms' is distinct from 'true' then raise exception 'SUPPORT_CONFLICT';end if;
   if b.deposit is null then raise exception 'SUPPORT_DEPOSIT_CONFIG';end if;
   select * into m from public.matches where id=b.match_id for share;
   if not exists(select 1 from jsonb_array_elements(public.tsi231_support_command('slots','{}',session_hash,null)->'slots') x where x->>'id'=b.match_id and x->>'sport'=b.sport) then raise exception 'SUPPORT_UNAVAILABLE';end if;
   update public.tsi231_support_bookings set status='Confirmada',confirmed_at=now(),updated_at=now(),
    policy_text='Si el cliente cancela dentro de las 12 horas previas al inicio del juego, el anticipo no es reembolsable. Las cancelaciones se revisan con el personal.' where id=b.id;
   msg:='¡Cobertura confirmada! 🎉 Folio '||b.folio||'. Anticipo mínimo pendiente: $'||b.deposit||' MXN. La confirmación de cobertura no acredita el pago. El personal registrará el importe recibido. Si cancelas dentro de las 12 horas previas al juego, el anticipo no es reembolsable. Entregamos de lunes a miércoles posteriores al juego. El acceso al campo se cobra aparte cuando corresponda.';
  end if;
  insert into public.tsi231_support_answers(thread_id,request_id) values(t.id,rid);
  insert into public.tsi230_support_messages(thread_id,kind,text,author_name) values(t.id,'bot',msg,'TABI · asistente virtual');
  update public.tsi230_support_threads set category='Cotización',submitted_at=now(),updated_at=now(),version=version+1 where id=t.id;
 elsif operation in ('staff-claim','staff-resume','staff-booking') then
  rid:=(payload->>'request_id')::uuid;if rid is null then raise exception 'SUPPORT_CONFLICT';end if;
  if exists(select 1 from public.tsi231_support_answers where thread_id=t.id and request_id=rid) then return public.tsi231_support_snapshot(t.id,session_hash,actor);end if;
  insert into public.tsi231_support_answers(thread_id,request_id) values(t.id,rid);
  if operation='staff-booking' then
   select * into b from public.tsi231_support_bookings where thread_id=t.id for update;
   if b.id is null then raise exception 'SUPPORT_CONFLICT';end if;
   if payload?'discount' and who.role<>'admin' then raise exception 'SUPPORT_FORBIDDEN';end if;
   discount_value:=case when payload?'discount' then (payload->>'discount')::numeric else b.discount end;
   amount:=coalesce((payload->>'paid')::numeric,b.paid);
   if discount_value<0 or discount_value>b.total or amount<0 or amount>b.total-discount_value then raise exception 'SUPPORT_CONFLICT';end if;
   if coalesce(payload->>'progress',b.progress) not in ('Programada','En edición','Lista','Entregada') then raise exception 'SUPPORT_CONFLICT';end if;
   if payload?'delivery_url' and coalesce(payload->>'delivery_url','')<>'' and (length(payload->>'delivery_url')>2000 or payload->>'delivery_url'!~'^https://[^[:space:]<>]+$') then raise exception 'SUPPORT_CONFLICT';end if;
   update public.tsi231_support_bookings set paid=amount,discount=discount_value,
    progress=coalesce(payload->>'progress',progress),delivery_url=coalesce(payload->>'delivery_url',delivery_url),updated_at=now() where id=b.id;
   msg:='📦 El equipo actualizó tu seguimiento: '||coalesce(payload->>'progress',b.progress)||'. Pago registrado: $'||amount||' MXN.';
  elsif operation='staff-resume' then msg:='¡Estoy de vuelta! 📷 El equipo me devolvió la conversación. ¿En qué te ayudo?';
  else msg:='🙋 '||coalesce(who.name,'Equipo Tanabi')||' tomó tu conversación. TABI queda en pausa mientras te atiende.';end if;
  update public.tsi230_support_threads set assigned_to=case when operation='staff-resume' then null else actor end,
   bot_paused=operation<>'staff-resume',status=case when operation='staff-resume' then 'Por atender' else 'En atención' end,
   updated_at=now(),version=version+1 where id=t.id;
  insert into public.tsi230_support_messages(thread_id,kind,text,author_id,author_name,author_role) values(t.id,'system',msg,actor,coalesce(who.name,'Equipo Tanabi'),who.role);
 else
  if operation in ('staff-message','staff-status') then update public.tsi230_support_threads set assigned_to=actor where id=t.id;end if;
  r:=public.tsi230_support_command(operation,payload,session_hash,actor);
 end if;
 return public.tsi231_support_snapshot(t.id,session_hash,actor);
end $$;
revoke all on function public.tsi231_support_snapshot(uuid,text,uuid),public.tsi231_support_command(text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.tsi231_support_snapshot(uuid,text,uuid),public.tsi231_support_command(text,jsonb,text,uuid) to service_role;
commit;
