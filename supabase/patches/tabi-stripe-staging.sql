begin;
update public.tsi231_support_config set individual_deposit=650,payment_instructions='Paga desde el botón Stripe de esta conversación. Entorno de pruebas: no se realizan cargos reales.' where id;
update public.tsi231_support_bookings set deposit=650 where package='individual' and status='Cotizada';
alter table public.tsi231_support_bookings add column if not exists stripe_paid numeric(12,2) not null default 0 check(stripe_paid>=0);
create table public.tsi231_support_payments(
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.tsi231_support_bookings(id),
 amount_cents integer not null check(amount_cents>0), session_id text unique,
 status text not null default 'pending' check(status in ('pending','paid','failed','expired')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index tsi231_support_one_pending on public.tsi231_support_payments(booking_id) where status='pending';
create table public.tsi231_support_payment_events(event_id text primary key,payment_id uuid not null references public.tsi231_support_payments(id),created_at timestamptz not null default now());
alter table public.tsi231_support_payments enable row level security;
alter table public.tsi231_support_payment_events enable row level security;
revoke all on public.tsi231_support_payments,public.tsi231_support_payment_events from public,anon,authenticated;
grant all on public.tsi231_support_payments,public.tsi231_support_payment_events to service_role;

create function public.tsi231_support_payment(operation text,payload jsonb,session_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.tsi230_support_threads; b public.tsi231_support_bookings; p public.tsi231_support_payments; amount numeric;
begin
 select * into t from public.tsi230_support_threads x where x.session_hash=tsi231_support_payment.session_hash and expires_at>now() for update;
 if t.id is null then raise exception 'SUPPORT_EXPIRED';end if;
 select * into b from public.tsi231_support_bookings where thread_id=t.id for update;
 if b.id is null or b.status<>'Confirmada' then raise exception 'SUPPORT_CONFLICT';end if;
 if operation='prepare' then
  if t.bot_paused then raise exception 'SUPPORT_CONFLICT';end if;
  select * into p from public.tsi231_support_payments where booking_id=b.id and status='pending' for update;
  if p.id is null then
   amount:=least(b.total-b.discount-b.paid,case when b.paid<b.deposit then b.deposit-b.paid else b.total-b.discount-b.paid end);
   if amount is null or amount<=0 then raise exception 'SUPPORT_PAID';end if;
   insert into public.tsi231_support_payments(booking_id,amount_cents) values(b.id,round(amount*100)::integer) returning * into p;
  end if;
 elsif operation='link' then
  select * into p from public.tsi231_support_payments where id=(payload->>'payment_id')::uuid and booking_id=b.id for update;
  if p.id is null or coalesce(payload->>'session_id','')!~'^cs_test_[A-Za-z0-9_]+$' or p.session_id is not null and p.session_id<>payload->>'session_id' then raise exception 'SUPPORT_CONFLICT';end if;
  update public.tsi231_support_payments set session_id=payload->>'session_id',updated_at=now() where id=p.id returning * into p;
 elsif operation='state' then
  select * into p from public.tsi231_support_payments where booking_id=b.id order by created_at desc limit 1;
 else raise exception 'SUPPORT_FORBIDDEN';end if;
 return jsonb_build_object('payment',case when p.id is null then null else jsonb_build_object('id',p.id,'booking_id',b.id,'folio',b.folio,'amount_cents',p.amount_cents,'session_id',p.session_id,'status',p.status,'created_at',p.created_at) end);
end $$;

create function public.tsi231_support_payment_event(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.tsi231_support_payments; b public.tsi231_support_bookings; prior text; stripe_sum numeric; next_status text; msg text;
begin
 if (payload->>'livemode')::boolean is distinct from false or payload->>'currency' is distinct from 'mxn'
  or coalesce(payload->>'session_id','')!~'^cs_test_[A-Za-z0-9_]+$'
  or coalesce(payload->>'event_id','')='' then raise exception 'SUPPORT_FORBIDDEN';end if;
 select * into p from public.tsi231_support_payments where id=(payload->>'payment_id')::uuid;
 if p.id is null or p.booking_id::text is distinct from payload->>'booking_id' then raise exception 'SUPPORT_CONFLICT';end if;
 select * into b from public.tsi231_support_bookings where id=p.booking_id for update;
 select * into p from public.tsi231_support_payments where id=p.id for update;
 if p.amount_cents is distinct from (payload->>'amount_total')::integer or (p.session_id is not null and p.session_id<>payload->>'session_id')
  or payload->>'session_status' not in ('open','complete','expired') or payload->>'payment_status' not in ('paid','unpaid','no_payment_required') then raise exception 'SUPPORT_CONFLICT';end if;
 if exists(select 1 from public.tsi231_support_payment_events where event_id=payload->>'event_id') then return jsonb_build_object('received',true,'duplicate',true);end if;
 insert into public.tsi231_support_payment_events values(payload->>'event_id',p.id,now());
 prior:=p.status;
 next_status:=case when p.status='paid' then 'paid' when payload->>'payment_status'='paid' and payload->>'session_status'='complete' then 'paid'
  when payload->>'session_status'='expired' then 'expired'
  when payload->>'event_type'='checkout.session.async_payment_failed' and payload->>'payment_status'='unpaid' then 'failed' else p.status end;
 update public.tsi231_support_payments set status=next_status,session_id=payload->>'session_id',updated_at=now() where id=p.id;
 if next_status='paid' and prior<>'paid' then
  select coalesce(sum(amount_cents),0)::numeric/100 into stripe_sum from public.tsi231_support_payments where booking_id=b.id and status='paid';
  update public.tsi231_support_bookings set paid=greatest(0,paid-stripe_paid)+stripe_sum,stripe_paid=stripe_sum,updated_at=now() where id=b.id;
  msg:='✅ Stripe confirmó tu pago de prueba de $'||(p.amount_cents::numeric/100)||' MXN para '||b.folio||'. No se realizó un cargo real.';
  insert into public.tsi230_support_messages(thread_id,kind,text,author_name) values(b.thread_id,'system',msg,'Stripe · pruebas');
  update public.tsi230_support_threads set updated_at=now(),version=version+1 where id=b.thread_id;
 end if;
 return jsonb_build_object('received',true,'status',next_status);
end $$;
revoke all on function public.tsi231_support_payment(text,jsonb,text),public.tsi231_support_payment_event(jsonb) from public,anon,authenticated;
grant execute on function public.tsi231_support_payment(text,jsonb,text),public.tsi231_support_payment_event(jsonb) to service_role;
commit;

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
   if (payload?'paid' and (payload->>'paid')::numeric<>b.paid or payload?'discount' and (payload->>'discount')::numeric<>b.discount)
    and exists(select 1 from public.tsi231_support_payments where booking_id=b.id and status='pending') then raise exception 'SUPPORT_CONFLICT';end if;
   if payload?'discount' and who.role<>'admin' then raise exception 'SUPPORT_FORBIDDEN';end if;
   discount_value:=case when payload?'discount' then (payload->>'discount')::numeric else b.discount end;
   amount:=coalesce((payload->>'paid')::numeric,b.paid);
   if discount_value<0 or discount_value>b.total or amount<b.stripe_paid or amount>b.total-discount_value then raise exception 'SUPPORT_CONFLICT';end if;
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
