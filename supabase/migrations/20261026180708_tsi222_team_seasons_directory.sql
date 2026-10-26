-- TSI 2.2.2 production compatibility.
-- Inspected production at 2026-10-26. No business rows are changed.
-- Keep public RPC wrappers, existing ownership checks, RLS, grants and all
-- non-team command branches unchanged.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
 if not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='tsi210_private' and p.proname='command'
    and pg_get_function_identity_arguments(p.oid)='op text, p jsonb, rid uuid'
    and md5(p.prosrc) in ('24f9dc147228602ca8e914a98c81e8d7','789d2f329f52afadf582b9501875e2ed','743bf335546ffffe0a21b58aa35fa868')
 ) then
  raise exception 'Production command changed since release review; inspect before applying.';
 end if;
 if not (select relrowsecurity from pg_class where oid='public.tsi210_teams'::regclass) then
  raise exception 'Expected RLS on tsi210_teams.';
 end if;
end
$preflight$;

alter table public.tsi210_teams
 add column if not exists season text not null default '',
 add column if not exists season_year integer;

do $constraint$
begin
 if not exists (
  select 1 from pg_constraint
  where conrelid='public.tsi210_teams'::regclass
    and conname='tsi210_teams_season_year_integrity'
 ) then
  alter table public.tsi210_teams add constraint tsi210_teams_season_year_integrity
  check (
   (season='' and season_year is null)
   or
   (season in ('juvenil','infantil') and season_year is not null and season_year between 2000 and 2100)
  );
 end if;
end
$constraint$;

-- Staging command with compatibility for TSI 2.2.1 tabs that omit both fields.
-- All non-team command branches remain byte-for-byte unchanged.
CREATE OR REPLACE FUNCTION tsi210_private.command(op text, p jsonb, rid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 uid uuid:=auth.uid(); team_season text; team_season_year integer; role_name text; old_receipt tsi210_private.receipts; request_hash text;
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
  if p ? 'season' or p ? 'season_year' then
   if not (p ? 'season' and p ? 'season_year') then raise exception 'Envía temporada y año juntos'; end if;
   if existing and team.season='' and team.season_year is null
      and coalesce(p->>'season','')='' and nullif(p->>'season_year','') is null then
    -- Legacy tabs clone the empty pair returned by tsi210_state.
    -- Accept it only for a record that is already unassigned.
    team_season:='';
    team_season_year:=null;
   else
   if coalesce(p->>'season','') not in ('juvenil','infantil') then raise exception 'Selecciona temporada Juvenil (enero-junio) o Infantil (julio-diciembre)'; end if;
   if coalesce(p->>'season_year','') !~ '^[0-9]{4}$' then raise exception 'Captura un año de cuatro dígitos'; end if;
   if (p->>'season_year')::integer not between 2000 and 2100 then raise exception 'Año fuera del intervalo 2000-2100'; end if;
   team_season:=p->>'season';
   team_season_year:=(p->>'season_year')::integer;
   end if;
  else
   -- TSI 2.2.1 clients omit both keys. Preserve existing values, or use the
   -- explicit legacy empty state on INSERT; never infer a season from today.
   team_season:=case when existing then team.season else '' end;
   team_season_year:=case when existing then team.season_year else null end;
  end if;
  if existing then
   update public.tsi210_teams set team_name=trim(p->>'team_name'),sport=trim(p->>'sport'),coordinator_name=trim(coalesce(p->>'coordinator_name','')),
    whatsapp=coalesce(p->>'whatsapp',''),notes=coalesce(p->>'notes',''),season=team_season,season_year=team_season_year,archived=coalesce((p->>'archived')::boolean,archived) where id=team.id returning * into team;
  else
   insert into public.tsi210_teams(id,owner_id,team_name,sport,coordinator_name,whatsapp,notes,season,season_year)
   values(coalesce((p->>'id')::uuid,gen_random_uuid()),uid,trim(p->>'team_name'),trim(p->>'sport'),trim(coalesce(p->>'coordinator_name','')),coalesce(p->>'whatsapp',''),coalesce(p->>'notes',''),team_season,team_season_year) returning * into team;
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
end;
$function$;

-- CREATE OR REPLACE preserves the function owner and existing ACL.
-- The original function remains SECURITY DEFINER with search_path='',
-- auth.uid() checked and current profiles.role used for authorization.

-- Read-only directory access for editora. Keep can_team unchanged, since it
-- participates in team.link and quote authorization. Do not expose team_matches,
-- quote/rate/cost/audit data to editora or grant table write access.
do $policy$
begin
 if not exists (
  select 1 from pg_policy
  where polrelid='public.tsi210_teams'::regclass
    and polname='tsi222_team_editor_read'
 ) then
  create policy tsi222_team_editor_read
  on public.tsi210_teams for select to authenticated
  using ((select auth.uid()) is not null and (select public.my_role())='editora');
 end if;
end
$policy$;

