-- TSI 2.1.0. Desarrollo en staging; aplicar en producción sólo durante su lanzamiento.
begin;
create schema if not exists tsi210_private;
revoke all on schema tsi210_private from public, anon;
grant usage on schema tsi210_private to authenticated;

create table if not exists public.tsi210_teams (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 team_name text not null check (length(team_name) between 1 and 120),
 sport text not null check (length(sport) between 1 and 60),
 coordinator_name text not null default '' check (length(coordinator_name)<=120),
 whatsapp text not null default '' check (whatsapp='' or whatsapp ~ '^[0-9]{10,15}$'),
 notes text not null default '' check(length(notes)<=2000), archived boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists tsi210_teams_owner on public.tsi210_teams(owner_id);
create table if not exists public.tsi210_team_matches (
 team_id uuid not null references public.tsi210_teams(id), match_id text not null references public.matches(id) on delete cascade,
 actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now(), primary key(team_id,match_id)
);
create index if not exists tsi210_team_matches_match on public.tsi210_team_matches(match_id);
create table if not exists public.tsi210_rate_cards (
 id uuid primary key default gen_random_uuid(), sport text not null check(length(sport) between 1 and 60),
 package_name text not null check(length(package_name) between 1 and 120),
 unit text not null check(unit in ('player','team','game','hour')),
 price_cents bigint not null check(price_cents between 0 and 9000000000),
 max_discount_pct numeric(5,2) not null default 0 check(max_discount_pct between 0 and 100),
 description text not null default '' check(length(description)<=3000), active boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists tsi210_rates_active on public.tsi210_rate_cards(active,sport);
create table if not exists public.tsi210_quotes (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 team_id uuid not null references public.tsi210_teams(id), rate_id uuid not null references public.tsi210_rate_cards(id),
 sport text not null, package_name text not null, unit text not null,
 quantity numeric(10,2) not null check(quantity>0 and quantity<=10000),
 unit_price_cents bigint not null check(unit_price_cents between 0 and 9000000000),
 discount_cents bigint not null default 0 check(discount_cents>=0),
 total_cents bigint generated always as (round(quantity*unit_price_cents)::bigint-discount_cents) stored check(total_cents>=0),
 status text not null default 'draft' check(status in ('draft','sent','accepted','converted','cancelled')),
 event_date date, event_time time, venue text not null default '' check(length(venue)<=160),
 category text not null default '' check(length(category)<=80),
 scope text not null default '' check(length(scope)<=3000), valid_until date,
 match_id text references public.matches(id) on delete set null,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists tsi210_quotes_owner on public.tsi210_quotes(owner_id,created_at desc);
create index if not exists tsi210_quotes_team on public.tsi210_quotes(team_id);
create index if not exists tsi210_quotes_match on public.tsi210_quotes(match_id) where match_id is not null;
create index if not exists tsi210_quotes_rate on public.tsi210_quotes(rate_id);
create table if not exists public.tsi210_quote_costs (
 quote_id uuid primary key references public.tsi210_quotes(id) on delete cascade,
 items jsonb not null default '{}' check(jsonb_typeof(items)='object'), updated_at timestamptz not null default now()
);
create table if not exists public.tsi210_match_costs (
 id uuid primary key default gen_random_uuid(), match_id text not null references public.matches(id) on delete cascade,
 category text not null check(category in ('travel','access','studio','production','other')),
 amount_cents bigint not null check(amount_cents between 0 and 9000000000),
 note text not null default '' check(length(note)<=1000),
 source_expense_id text references public.expenses(id), allocation_method text,
 actor_id uuid not null references public.profiles(id), version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source_expense_id,match_id)
);
create index if not exists tsi210_costs_match on public.tsi210_match_costs(match_id);
create index if not exists tsi210_costs_actor on public.tsi210_match_costs(actor_id);
create table if not exists public.tsi210_deliveries (
 match_id text primary key references public.matches(id) on delete cascade,
 sent_at timestamptz, sent_by uuid references public.profiles(id), link_snapshot text,
 confirmed_at timestamptz, confirmed_by uuid references public.profiles(id),
 correction_open boolean not null default false, correction_note text not null default '' check(length(correction_note)<=2000),
 resolved_at timestamptz, resolved_by uuid references public.profiles(id),
 version integer not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.tsi210_audit_log (
 id uuid primary key default gen_random_uuid(), happened_at timestamptz not null default clock_timestamp(),
 actor_id uuid, entity text not null, entity_id text not null, action text not null,
 changed_keys text[] not null default '{}', before_data jsonb, after_data jsonb
);
create index if not exists tsi210_audit_recent on public.tsi210_audit_log(happened_at desc);
create index if not exists tsi210_audit_entity on public.tsi210_audit_log(entity,entity_id,happened_at desc);
create table if not exists tsi210_private.receipts (
 actor_id uuid not null, request_id uuid not null, request_hash text not null, response jsonb not null,
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
alter table tsi210_private.receipts enable row level security;
revoke all on tsi210_private.receipts from public,anon,authenticated;

create or replace function tsi210_private.can_match(mid text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.matches m join public.profiles p on p.id=auth.uid() where m.id=mid and (
 p.role='admin' or (p.role='foto' and p.id::text in (m.data->>'f1',m.data->>'f2')) or
 (p.role='editora' and (p.id::text=coalesce(nullif(m.data->>'ed',''),m.data->>'edBy') or
 (coalesce(m.data->>'ed','')='' and coalesce(m.data->>'edBy','')='' and (select count(*) from public.profiles where role='editora')=1)))))
$$;
revoke all on function tsi210_private.can_match(text) from public,anon;
grant execute on function tsi210_private.can_match(text) to authenticated;
create or replace function tsi210_private.can_team(tid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p join public.tsi210_teams t on t.id=tid where p.id=auth.uid() and
 (p.role='admin' or (p.role='foto' and (t.owner_id=p.id or exists(select 1 from public.tsi210_team_matches tm where tm.team_id=t.id and tsi210_private.can_match(tm.match_id))))))
$$;
revoke all on function tsi210_private.can_team(uuid) from public,anon;
grant execute on function tsi210_private.can_team(uuid) to authenticated;

do $$ declare t text; begin
 foreach t in array array['tsi210_teams','tsi210_team_matches','tsi210_rate_cards','tsi210_quotes','tsi210_quote_costs','tsi210_match_costs','tsi210_deliveries','tsi210_audit_log'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy tsi210_team_read on public.tsi210_teams for select to authenticated using(tsi210_private.can_team(id));
create policy tsi210_team_matches_read on public.tsi210_team_matches for select to authenticated using(tsi210_private.can_team(team_id));
create policy tsi210_rates_read on public.tsi210_rate_cards for select to authenticated using((select public.is_admin()) or (active and (select public.my_role())='foto'));
create policy tsi210_quotes_read on public.tsi210_quotes for select to authenticated using((select public.is_admin()) or (owner_id=(select auth.uid()) and (select public.my_role())='foto'));
create policy tsi210_quote_costs_read on public.tsi210_quote_costs for select to authenticated using((select public.is_admin()));
create policy tsi210_costs_read on public.tsi210_match_costs for select to authenticated using((select public.is_admin()));
create policy tsi210_delivery_read on public.tsi210_deliveries for select to authenticated using(tsi210_private.can_match(match_id));
create policy tsi210_audit_read on public.tsi210_audit_log for select to authenticated using((select public.is_admin()));

create or replace function tsi210_private.touch() returns trigger language plpgsql set search_path='' as $$
begin new.version:=old.version+1; new.updated_at:=clock_timestamp(); return new; end $$;
revoke all on function tsi210_private.touch() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['tsi210_teams','tsi210_rate_cards','tsi210_quotes','tsi210_match_costs','tsi210_deliveries'] loop
  execute format('create trigger tsi210_touch before update on public.%I for each row execute function tsi210_private.touch()',t);
 end loop;
end $$;
create or replace function tsi210_private.audit() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; rid text; changed text[]; begin
 b:=case when tg_op='INSERT' then null else to_jsonb(old) end;
 a:=case when tg_op='DELETE' then null else to_jsonb(new) end;
 rid:=coalesce(a->>'id',b->>'id',a->>'quote_id',b->>'quote_id',a->>'match_id',b->>'match_id',a->>'team_id'||':'||(a->>'match_id'),'');
 if b ? 'data' then b:=b->'data'; end if; if a ? 'data' then a:=a->'data'; end if;
 -- Nunca copiar los bytes de imágenes a la bitácora.
 b:=b-'images'-'img'; a:=a-'images'-'img';
 if tg_op='UPDATE' and b=a then return new; end if;
 select coalesce(array_agg(k order by k),'{}') into changed from (select jsonb_object_keys(coalesce(b,'{}')) k union select jsonb_object_keys(coalesce(a,'{}'))) keys
 where b->k is distinct from a->k;
 insert into public.tsi210_audit_log(actor_id,entity,entity_id,action,changed_keys,before_data,after_data) values(auth.uid(),tg_table_name,rid,tg_op,changed,b,a);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function tsi210_private.audit() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['matches','pays','expenses','bonuses','avisos','profiles','settings','loans','feedback','tsi210_teams','tsi210_team_matches','tsi210_rate_cards','tsi210_quotes','tsi210_quote_costs','tsi210_match_costs','tsi210_deliveries'] loop
  execute format('create trigger tsi210_audit after insert or update or delete on public.%I for each row execute function tsi210_private.audit()',t);
 end loop;
end $$;

create or replace function public.tsi210_state() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or public.my_role() not in ('admin','foto','editora') then raise exception 'Sin permiso' using errcode='42501'; end if;
 return jsonb_build_object('version','2.1.0','server_now',now(),
 'teams',(select coalesce(jsonb_agg(t order by t.team_name),'[]') from public.tsi210_teams t),
 'team_matches',(select coalesce(jsonb_agg(t),'[]') from public.tsi210_team_matches t),
 'rates',(select coalesce(jsonb_agg(t order by t.sport,t.package_name),'[]') from public.tsi210_rate_cards t),
 'quotes',(select coalesce(jsonb_agg(t order by t.created_at desc),'[]') from public.tsi210_quotes t),
 'quote_costs',(select coalesce(jsonb_agg(t),'[]') from public.tsi210_quote_costs t),
 'costs',(select coalesce(jsonb_agg(t),'[]') from public.tsi210_match_costs t),
 'deliveries',(select coalesce(jsonb_agg(t),'[]') from public.tsi210_deliveries t),
 'audit',(select coalesce(jsonb_agg(t),'[]') from (select * from public.tsi210_audit_log order by happened_at desc limit 100) t));
end $$;
revoke all on function public.tsi210_state() from public,anon;
grant execute on function public.tsi210_state() to authenticated;

create or replace function tsi210_private.command(op text,p jsonb,rid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); role_name text; old_receipt tsi210_private.receipts; request_hash text;
 team public.tsi210_teams; rate public.tsi210_rate_cards; quote public.tsi210_quotes;
 delivery public.tsi210_deliveries; cost public.tsi210_match_costs; result jsonb;
 mid text; m jsonb; amount bigint; qty numeric; price bigint; discount bigint; gross bigint;
 item record; key text; items jsonb; status_to text; expected integer; existing boolean;
 expense public.expenses; mids text[]; weights numeric[]; total_weight numeric:=0;
 i integer; n integer; part bigint; allocated bigint:=0; allocations bigint[]; remaining bigint;
begin
 select role into role_name from public.profiles where id=uid;
 if uid is null or role_name is null or role_name not in ('admin','foto','editora') then raise exception 'Inicia sesión con una cuenta autorizada' using errcode='42501'; end if;
 if rid is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>65536 then raise exception 'Solicitud inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||rid::text,0));
 request_hash:=md5(op||p::text);
 select * into old_receipt from tsi210_private.receipts where actor_id=uid and request_id=rid;
 if found then
  if old_receipt.request_hash<>request_hash then raise exception 'La solicitud ya se usó con otros datos'; end if;
  return old_receipt.response;
 end if;
 expected:=coalesce((p->>'version')::integer,0);

 if op='team.save' then
  if role_name not in ('admin','foto') then raise exception 'Sin permiso' using errcode='42501'; end if;
  select * into team from public.tsi210_teams where id=(p->>'id')::uuid for update;
  existing:=found;
  if existing and (team.owner_id<>uid and role_name<>'admin') then raise exception 'Este equipo pertenece a otra cuenta' using errcode='42501'; end if;
  if existing and team.version<>expected then raise exception 'El equipo cambió; recarga antes de guardar' using errcode='40001'; end if;
  if existing then
   update public.tsi210_teams set team_name=trim(p->>'team_name'),sport=trim(p->>'sport'),coordinator_name=trim(coalesce(p->>'coordinator_name','')),
    whatsapp=coalesce(p->>'whatsapp',''),notes=coalesce(p->>'notes',''),archived=coalesce((p->>'archived')::boolean,archived) where id=team.id returning * into team;
  else
   insert into public.tsi210_teams(id,owner_id,team_name,sport,coordinator_name,whatsapp,notes)
   values(coalesce((p->>'id')::uuid,gen_random_uuid()),uid,trim(p->>'team_name'),trim(p->>'sport'),trim(coalesce(p->>'coordinator_name','')),coalesce(p->>'whatsapp',''),coalesce(p->>'notes','')) returning * into team;
  end if;
  result:=to_jsonb(team);

 elsif op='team.link' then
  if role_name not in ('admin','foto') or not tsi210_private.can_team((p->>'team_id')::uuid) or not tsi210_private.can_match(p->>'match_id') then raise exception 'Sin permiso para vincular ese equipo y partido' using errcode='42501'; end if;
  insert into public.tsi210_team_matches(team_id,match_id,actor_id) values((p->>'team_id')::uuid,p->>'match_id',uid) on conflict do nothing;
  result:=jsonb_build_object('linked',true);

 elsif op='rate.save' then
  if role_name<>'admin' then raise exception 'Solo administración configura tarifas' using errcode='42501'; end if;
  select * into rate from public.tsi210_rate_cards where id=(p->>'id')::uuid for update;
  existing:=found;
  if existing and rate.version<>expected then raise exception 'La tarifa cambió; recarga antes de guardar' using errcode='40001'; end if;
  if existing then
   update public.tsi210_rate_cards set sport=trim(p->>'sport'),package_name=trim(p->>'package_name'),unit=p->>'unit',price_cents=(p->>'price_cents')::bigint,
    max_discount_pct=(p->>'max_discount_pct')::numeric,description=coalesce(p->>'description',''),active=coalesce((p->>'active')::boolean,false) where id=rate.id returning * into rate;
  else
   insert into public.tsi210_rate_cards(id,sport,package_name,unit,price_cents,max_discount_pct,description,active)
   values(coalesce((p->>'id')::uuid,gen_random_uuid()),trim(p->>'sport'),trim(p->>'package_name'),p->>'unit',(p->>'price_cents')::bigint,(p->>'max_discount_pct')::numeric,coalesce(p->>'description',''),coalesce((p->>'active')::boolean,false)) returning * into rate;
  end if;
  result:=to_jsonb(rate);

 elsif op='quote.save' then
  if role_name not in ('admin','foto') then raise exception 'Sin permiso para cotizar' using errcode='42501'; end if;
  select * into quote from public.tsi210_quotes where id=(p->>'id')::uuid for update;
  existing:=found;
  if existing and (quote.owner_id<>uid and role_name<>'admin') then raise exception 'Cotización ajena' using errcode='42501'; end if;
  if existing and (quote.version<>expected or quote.status<>'draft') then raise exception 'La cotización cambió o ya fue enviada; recarga antes de editar' using errcode='40001'; end if;
  if not tsi210_private.can_team((p->>'team_id')::uuid) then raise exception 'Selecciona un equipo disponible para tu cuenta' using errcode='42501'; end if;
  if exists(select 1 from public.tsi210_teams where id=(p->>'team_id')::uuid and archived) then raise exception 'El equipo está archivado'; end if;
  select * into rate from public.tsi210_rate_cards where id=(p->>'rate_id')::uuid and active for share;
  if not found then raise exception 'La tarifa no está aprobada o está desactivada'; end if;
  qty:=(p->>'quantity')::numeric;
  if qty is null or qty<=0 or qty>10000 or qty<>round(qty,2) or (rate.unit<>'hour' and qty<>trunc(qty)) then raise exception 'Cantidad inválida para la unidad de la tarifa'; end if;
  price:=rate.price_cents;
  if role_name='admin' and p ? 'unit_price_cents' then price:=(p->>'unit_price_cents')::bigint;
  elsif p ? 'unit_price_cents' and (p->>'unit_price_cents')::bigint<>price then raise exception 'No puedes modificar el precio aprobado' using errcode='42501'; end if;
  gross:=round(qty*price)::bigint; discount:=coalesce((p->>'discount_cents')::bigint,0);
  if price<0 or price>9000000000 or discount<0 or discount>gross or (role_name<>'admin' and discount>floor(gross*rate.max_discount_pct/100)) then raise exception 'Precio o descuento no autorizado'; end if;
  if role_name<>'admin' and p ? 'costs' then raise exception 'Los costos internos requieren administración' using errcode='42501'; end if;
  if existing then
   update public.tsi210_quotes set team_id=(p->>'team_id')::uuid,rate_id=rate.id,sport=rate.sport,package_name=rate.package_name,unit=rate.unit,quantity=qty,unit_price_cents=price,discount_cents=discount,
    event_date=nullif(p->>'event_date','')::date,event_time=nullif(p->>'event_time','')::time,venue=coalesce(p->>'venue',''),category=coalesce(p->>'category',''),scope=coalesce(p->>'scope',rate.description),valid_until=nullif(p->>'valid_until','')::date where id=quote.id returning * into quote;
  else
   insert into public.tsi210_quotes(id,owner_id,team_id,rate_id,sport,package_name,unit,quantity,unit_price_cents,discount_cents,event_date,event_time,venue,category,scope,valid_until)
   values(coalesce((p->>'id')::uuid,gen_random_uuid()),uid,(p->>'team_id')::uuid,rate.id,rate.sport,rate.package_name,rate.unit,qty,price,discount,nullif(p->>'event_date','')::date,nullif(p->>'event_time','')::time,coalesce(p->>'venue',''),coalesce(p->>'category',''),coalesce(p->>'scope',rate.description),nullif(p->>'valid_until','')::date) returning * into quote;
  end if;
  if role_name='admin' and p ? 'costs' then
   items:=p->'costs'; if jsonb_typeof(items)<>'object' then raise exception 'Costos inválidos'; end if;
   for item in select * from jsonb_each_text(items) loop
    if item.key not in ('studio','photo','editing','transport','production','other') or item.value::numeric<0 or item.value::numeric>9000000000 or item.value::numeric<>trunc(item.value::numeric) then raise exception 'Costo inválido'; end if;
   end loop;
   insert into public.tsi210_quote_costs(quote_id,items) values(quote.id,items) on conflict(quote_id) do update set items=excluded.items,updated_at=clock_timestamp();
  end if;
  result:=to_jsonb(quote);

 elsif op='quote.status' or op='quote.convert' then
  select * into quote from public.tsi210_quotes where id=(p->>'id')::uuid for update;
  if not found or (role_name<>'admin' and (role_name<>'foto' or quote.owner_id<>uid)) then raise exception 'Cotización no disponible' using errcode='42501'; end if;
  if op='quote.convert' and quote.status='converted' and quote.match_id is not null then
   result:=jsonb_build_object('quote',quote,'match_id',quote.match_id,'created',false);
  else
   if quote.version<>expected then raise exception 'La cotización cambió; recarga antes de continuar' using errcode='40001'; end if;
   if op='quote.status' then
    status_to:=p->>'status';
    if not ((quote.status='draft' and status_to in ('sent','cancelled')) or (quote.status='sent' and status_to in ('accepted','draft','cancelled')) or (quote.status='accepted' and status_to='cancelled') or (role_name='admin' and quote.status in ('accepted','cancelled') and status_to='draft')) then raise exception 'Cambio de estado no permitido'; end if;
    if status_to='accepted' and quote.valid_until is not null and quote.valid_until<(now() at time zone 'America/Monterrey')::date then raise exception 'La cotización venció. Actualízala antes de aceptar'; end if;
    update public.tsi210_quotes set status=status_to where id=quote.id returning * into quote; result:=to_jsonb(quote);
   else
    if role_name<>'admin' then raise exception 'Administración debe vincular el partido' using errcode='42501'; end if;
    if quote.status<>'accepted' then raise exception 'Primero registra la aceptación del cliente'; end if;
    mid:=nullif(p->>'match_id',''); existing:=mid is not null;
    if existing then
     select data into m from public.matches where id=mid for update;
     if not found or coalesce((m->>'archived')::boolean,false) then raise exception 'Selecciona un partido activo'; end if;
    else
     if quote.event_date is null or quote.event_time is null or length(trim(coalesce(p->>'teams','')))=0 or length(p->>'teams')>200 then raise exception 'Completa fecha, hora y equipos antes de crear el partido'; end if;
     mid:=floor(extract(epoch from clock_timestamp())*1000000)::bigint::text;
     m:=jsonb_build_object('id',mid::bigint,'date',quote.event_date,'time',to_char(quote.event_time,'HH24:MI'),'teams',trim(p->>'teams'),'cat',quote.category,'venue',coalesce(nullif(quote.venue,''),'Por definir'),'addr',quote.venue,'f1','','f2','','ed','','stage','','cov',null,'link','');
     insert into public.matches(id,data) values(mid,m);
    end if;
    insert into public.tsi210_team_matches(team_id,match_id,actor_id) values(quote.team_id,mid,uid) on conflict do nothing;
    update public.tsi210_quotes set match_id=mid,status='converted' where id=quote.id returning * into quote;
    result:=jsonb_build_object('quote',quote,'match_id',mid,'created',not existing);
   end if;
  end if;

 elsif op='delivery.update' then
  mid:=p->>'match_id';
  if not tsi210_private.can_match(mid) then raise exception 'Este partido no está asignado a tu cuenta' using errcode='42501'; end if;
  select data into m from public.matches where id=mid for share;
  select * into delivery from public.tsi210_deliveries where match_id=mid for update;
  existing:=found;
  if (existing and delivery.version<>expected) or (not existing and expected<>0) then raise exception 'La entrega cambió; recarga antes de continuar' using errcode='40001'; end if;
  if not existing then insert into public.tsi210_deliveries(match_id) values(mid) returning * into delivery; end if;
  status_to:=p->>'action';
  if status_to in ('sent','confirmed') and role_name not in ('admin','foto') then raise exception 'El envío y la recepción los registra administración o el fotógrafo asignado' using errcode='42501'; end if;
  if status_to='sent' then
   if m->>'stage'<>'listos' or coalesce(m->>'link','') !~ '^https?://' or length(m->>'link')>3000 then raise exception 'Las fotos deben estar listas y tener un enlace válido'; end if;
   update public.tsi210_deliveries set sent_at=clock_timestamp(),sent_by=uid,link_snapshot=m->>'link',confirmed_at=null,confirmed_by=null where match_id=mid returning * into delivery;
  elsif status_to='confirmed' then
   if delivery.sent_at is null or delivery.correction_open then raise exception 'Primero registra el envío y resuelve las correcciones'; end if;
   update public.tsi210_deliveries set confirmed_at=clock_timestamp(),confirmed_by=uid where match_id=mid returning * into delivery;
  elsif status_to='correction' then
   if length(trim(coalesce(p->>'note','')))=0 then raise exception 'Describe la corrección solicitada'; end if;
   update public.tsi210_deliveries set correction_open=true,correction_note=trim(p->>'note'),confirmed_at=null,confirmed_by=null,resolved_at=null,resolved_by=null where match_id=mid returning * into delivery;
  elsif status_to='resolved' then
   if role_name not in ('admin','editora') or not delivery.correction_open then raise exception 'La corrección debe resolverla administración o la editora asignada' using errcode='42501'; end if;
   update public.tsi210_deliveries set correction_open=false,resolved_at=clock_timestamp(),resolved_by=uid where match_id=mid returning * into delivery;
  else raise exception 'Acción de entrega inválida'; end if;
  result:=to_jsonb(delivery);

 elsif op='cost.save' or op='cost.delete' then
  if role_name<>'admin' then raise exception 'Solo administración registra costos' using errcode='42501'; end if;
  select * into cost from public.tsi210_match_costs where id=(p->>'id')::uuid for update; existing:=found;
  if existing and (cost.version<>expected or cost.source_expense_id is not null) then raise exception 'El costo cambió o pertenece a un gasto compartido; usa su distribución' using errcode='40001'; end if;
  if op='cost.delete' then
   if not existing then raise exception 'Costo no disponible'; end if;
   delete from public.tsi210_match_costs where id=cost.id; result:=jsonb_build_object('deleted',true);
  else
   if existing then
    update public.tsi210_match_costs set category=p->>'category',amount_cents=(p->>'amount_cents')::bigint,note=coalesce(p->>'note','') where id=cost.id returning * into cost;
   else
    insert into public.tsi210_match_costs(id,match_id,category,amount_cents,note,actor_id) values(coalesce((p->>'id')::uuid,gen_random_uuid()),p->>'match_id',p->>'category',(p->>'amount_cents')::bigint,coalesce(p->>'note',''),uid) returning * into cost;
   end if;
   result:=to_jsonb(cost);
  end if;

 elsif op in ('expense.allocate','expense.unallocate') then
  if role_name<>'admin' then raise exception 'Solo administración distribuye gastos' using errcode='42501'; end if;
  select * into expense from public.expenses where id=p->>'expense_id' for update;
  if not found then raise exception 'Gasto no disponible'; end if;
  if op='expense.unallocate' then
   delete from public.tsi210_match_costs where source_expense_id=expense.id; result:=jsonb_build_object('removed',true);
  else
   if expense.data->>'status'<>'aprobado' then raise exception 'El gasto debe estar aprobado'; end if;
   amount:=round((expense.data->>'amount')::numeric*100)::bigint;
   if amount<=0 or amount>9000000000 then raise exception 'Monto de gasto inválido'; end if;
   select array_agg(distinct value order by value) into mids from jsonb_array_elements_text(p->'match_ids');
   n:=coalesce(array_length(mids,1),0);
   if n<1 or n>200 or p->>'method' not in ('equal','players') then raise exception 'Selecciona partidos y una forma de reparto válida'; end if;
   if exists(select 1 from public.tsi210_match_costs where source_expense_id=expense.id) and not coalesce((p->>'replace')::boolean,false) then raise exception 'Este gasto ya está distribuido. Confirma si quieres reemplazar el reparto'; end if;
   weights:='{}'; allocations:='{}';
   for i in 1..n loop
    select data into m from public.matches where id=mids[i] for share;
    if not found then raise exception 'Uno de los partidos ya no existe'; end if;
    qty:=case when p->>'method'='players' then coalesce((m->'cov'->>'players')::numeric,0) else 1 end;
    if qty<=0 then raise exception 'Para repartir por jugadores, todos los partidos requieren jugadores registrados'; end if;
    weights:=array_append(weights,qty);total_weight:=total_weight+qty;
   end loop;
   for i in 1..n loop part:=floor(amount*weights[i]/total_weight);allocations:=array_append(allocations,part);allocated:=allocated+part;end loop;
   remaining:=amount-allocated;
   for i in 1..remaining::integer loop allocations[i]:=allocations[i]+1;end loop;
   delete from public.tsi210_match_costs where source_expense_id=expense.id;
   for i in 1..n loop
    insert into public.tsi210_match_costs(match_id,category,amount_cents,note,source_expense_id,allocation_method,actor_id)
    values(mids[i],'other',allocations[i],left(coalesce(expense.data->>'cat','Gasto')||' · '||coalesce(expense.data->>'note',''),1000),expense.id,p->>'method',uid);
   end loop;
   result:=jsonb_build_object('amount_cents',amount,'matches',n);
  end if;
 else raise exception 'Operación no permitida'; end if;
 insert into tsi210_private.receipts(actor_id,request_id,request_hash,response) values(uid,rid,request_hash,result);
 return result;
end $$;
revoke all on function tsi210_private.command(text,jsonb,uuid) from public,anon;
grant execute on function tsi210_private.command(text,jsonb,uuid) to authenticated;
create or replace function public.tsi210_command(operation text,payload jsonb,request_id uuid) returns jsonb language sql security invoker set search_path='' as $$
 select tsi210_private.command(operation,payload,request_id)
$$;
revoke all on function public.tsi210_command(text,jsonb,uuid) from public,anon;
grant execute on function public.tsi210_command(text,jsonb,uuid) to authenticated;

create or replace function tsi210_private.guard_expense() returns trigger language plpgsql security definer set search_path='' as $$
declare allocated bigint; begin
 select coalesce(sum(amount_cents),0) into allocated from public.tsi210_match_costs where source_expense_id=old.id;
 if allocated>0 and (tg_op='DELETE' or new.data->>'status'<>'aprobado' or round((new.data->>'amount')::numeric*100)<allocated) then raise exception 'Retira la distribución del gasto antes de reducirlo, rechazarlo o eliminarlo'; end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
revoke all on function tsi210_private.guard_expense() from public,anon,authenticated;
create trigger tsi210_expense_allocation before update or delete on public.expenses for each row execute function tsi210_private.guard_expense();

create or replace function tsi210_private.backup_tables() returns text[] language sql immutable set search_path='' as $$
 select array['profiles','settings','matches','pays','loans','expenses','bonuses','notifs','avisos','feedback','feedback_photos','orders','reservations','shop_items','portfolio',
 'editor_capacity_settings','editor_intelligence_alerts','editor_time_estimates','editor_time_events','editor_time_sessions','editor_workload_snapshots','intelligence_model_versions','photographer_availability','role_import_batches','tsi_push_preferences',
 'tsi210_teams','tsi210_team_matches','tsi210_rate_cards','tsi210_quotes','tsi210_quote_costs','tsi210_match_costs','tsi210_deliveries','tsi210_audit_log']::text[]
$$;
revoke all on function tsi210_private.backup_tables() from public,anon,authenticated;
create or replace function tsi210_private.backup() returns jsonb language plpgsql security definer set search_path='' as $$
declare t text; rows jsonb; tables jsonb:='{}'; files jsonb; begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración puede generar respaldos' using errcode='42501'; end if;
 foreach t in array tsi210_private.backup_tables() loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r',t) into rows;
  tables:=tables||jsonb_build_object(t,rows);
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name,'size',coalesce(metadata->>'size','0'),'etag',metadata->>'eTag')),'[]') into files from storage.objects where bucket_id='tsi-feedback';
 return jsonb_build_object('format','tsi-operational-backup','schema_version',1,'app_version','2.1.0','created_at',clock_timestamp(),'project',current_setting('app.settings.project_ref',true),'tables',tables,'files',files,
 'excluded',jsonb_build_array('Credenciales y usuarios de Auth','Secretos, Vault y configuración de servidor','Suscripciones y cola de envío push'));
end $$;
revoke all on function tsi210_private.backup() from public,anon;
grant execute on function tsi210_private.backup() to authenticated;
create or replace function public.tsi210_backup() returns jsonb language sql security invoker set search_path='' as $$ select tsi210_private.backup() $$;
revoke all on function public.tsi210_backup() from public,anon;
grant execute on function public.tsi210_backup() to authenticated;

-- Ensayo de restauración: sólo tablas TEMPORARY, sin triggers ni cambios en datos vivos.
create or replace function tsi210_private.verify_restore(snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t text; rows jsonb; restored jsonb; result jsonb:='[]'; n bigint; temp_name text; begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración verifica respaldos' using errcode='42501'; end if;
 if snapshot->>'format'<>'tsi-operational-backup' or snapshot->>'schema_version'<>'1' or jsonb_typeof(snapshot->'tables')<>'object' or octet_length(snapshot::text)>52428800 then raise exception 'Respaldo no compatible o demasiado grande para la verificación interactiva'; end if;
 foreach t in array tsi210_private.backup_tables() loop
  rows:=snapshot->'tables'->t;
  if rows is null or jsonb_typeof(rows)<>'array' then raise exception 'El respaldo no contiene la tabla %',t; end if;
  temp_name:='tsi210_restore_'||t;
  execute format('drop table if exists pg_temp.%I',temp_name);
  execute format('create temporary table %I (like public.%I including generated) on commit drop',temp_name,t);
  if t='tsi210_quotes' then
   execute format('insert into pg_temp.%I (id,owner_id,team_id,rate_id,sport,package_name,unit,quantity,unit_price_cents,discount_cents,status,event_date,event_time,venue,category,scope,valid_until,match_id,version,created_at,updated_at) select id,owner_id,team_id,rate_id,sport,package_name,unit,quantity,unit_price_cents,discount_cents,status,event_date,event_time,venue,category,scope,valid_until,match_id,version,created_at,updated_at from jsonb_populate_recordset(null::public.tsi210_quotes,$1)',temp_name) using rows;
   -- LIKE conserva la columna generada, que vuelve a calcularse durante el ensayo.
  else
   execute format('insert into pg_temp.%I select * from jsonb_populate_recordset(null::public.%I,$1)',temp_name,t) using rows;
  end if;
  execute format('select count(*),coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from pg_temp.%I r',temp_name) into n,restored;
  select coalesce(jsonb_agg(v order by v::text),'[]') into rows from jsonb_array_elements(rows) v;
  if restored<>rows then raise exception 'La tabla % no se restauró de forma idéntica',t; end if;
  result:=result||jsonb_build_array(jsonb_build_object('table',t,'rows',n,'verified',true));
 end loop;
 return jsonb_build_object('verified',true,'mode','temporary_tables','tables',result,'live_data_modified',false);
end $$;
revoke all on function tsi210_private.verify_restore(jsonb) from public,anon;
grant execute on function tsi210_private.verify_restore(jsonb) to authenticated;
create or replace function public.tsi210_verify_restore(snapshot jsonb) returns jsonb language sql security invoker set search_path='' as $$ select tsi210_private.verify_restore(snapshot) $$;
revoke all on function public.tsi210_verify_restore(jsonb) from public,anon;
grant execute on function public.tsi210_verify_restore(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
