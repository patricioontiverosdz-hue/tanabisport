-- TSI V2.0.4: ejecutar primero en STAGING. No reescribe datos ni políticas existentes.
begin;
do $$ begin
  if exists (select 1 from unnest(array['profiles','matches','avisos','feedback','pays','expenses','loans']) t(n)
    where to_regclass('public.'||n) is null) then
    raise exception 'Faltan tablas de TSI. No ejecutar en otro proyecto.';
  end if;
end $$;

create table if not exists public.tsi_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 4096),
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tsi_push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  categories text[] not null default array['avisos','pagos','proceso','cobertura','comentarios','disponibilidad','horas','carga','autorizaciones'],
  quiet_enabled boolean not null default true,
  quiet_start int not null default 22 check (quiet_start between 0 and 23),
  quiet_end int not null default 8 check (quiet_end between 0 and 23),
  timezone text not null default 'America/Monterrey'
);
create table if not exists public.tsi_push_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  category text not null,
  title text not null,
  body text not null,
  tab text not null default 'notif',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  state text not null default 'pending' check (state in ('pending','sending','sent','skipped','failed')),
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  last_error text,
  unique(user_id,event_key)
);
create index if not exists tsi_push_events_pending on public.tsi_push_events(state,available_at);
create index if not exists tsi_push_events_user on public.tsi_push_events(user_id,created_at desc);
create table if not exists public.tsi_push_receipts (
  event_id uuid not null references public.tsi_push_events(id) on delete cascade,
  subscription_id uuid not null references public.tsi_push_subscriptions(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key(event_id,subscription_id)
);

alter table public.tsi_push_subscriptions enable row level security;
alter table public.tsi_push_preferences enable row level security;
alter table public.tsi_push_events enable row level security;
alter table public.tsi_push_receipts enable row level security;
revoke all on public.tsi_push_subscriptions,public.tsi_push_preferences,public.tsi_push_events,public.tsi_push_receipts from anon,authenticated;
grant select on public.tsi_push_preferences,public.tsi_push_events to authenticated;
grant all on public.tsi_push_subscriptions,public.tsi_push_preferences,public.tsi_push_events,public.tsi_push_receipts to service_role;
drop policy if exists tsi_push_own_preferences on public.tsi_push_preferences;
create policy tsi_push_own_preferences on public.tsi_push_preferences for select to authenticated using (user_id=auth.uid());
drop policy if exists tsi_push_own_events on public.tsi_push_events;
create policy tsi_push_own_events on public.tsi_push_events for select to authenticated using (user_id=auth.uid());

-- Sólo funciones/servidor crean destinatarios; el navegador no puede elegirlos.
create or replace function public.tsi_push_emit(ids text[], cat text, heading text, msg text, target_tab text, ekey text)
returns void language sql security definer set search_path=public,pg_temp as $$
  insert into public.tsi_push_events(user_id,event_key,category,title,body,tab)
  select distinct p.id::text::uuid, ekey,cat,left(heading,100),left(msg,240),target_tab
  from public.profiles p where p.id::text=any(ids) and p.role in ('admin','foto','editora')
  on conflict(user_id,event_key) do nothing;
$$;
revoke all on function public.tsi_push_emit(text[],text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.tsi_push_emit(text[],text,text,text,text,text) to service_role;

create or replace function public.tsi_push_source_event()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d jsonb := new.data;
  prev jsonb := case when tg_op='UPDATE' then old.data else '{}'::jsonb end;
  actor text;
  admins text[];
  photographers text[];
  editors text[];
  recipients text[];
  m jsonb;
  owner_id text;
  k text;
  label text;
begin
  select role into actor from public.profiles where id::text=auth.uid()::text;
  select coalesce(array_agg(id::text),'{}') into admins from public.profiles where role='admin';
  k := tg_table_name||':'||new.id::text||':'||txid_current()::text||':'||md5(d::text);

  if tg_table_name='avisos' and tg_op='INSERT' and (actor='admin' or auth.uid() is null) then
    select coalesce(array_agg(id::text),'{}') into recipients from public.profiles
      where role in ('admin','foto','editora') and (d->>'to'='all' or role=d->>'to');
    perform public.tsi_push_emit(recipients,'avisos','Nuevo aviso','Hay un aviso nuevo para ti en TSI.','avisos',k);

  elsif tg_table_name='feedback' and tg_op='INSERT' and (actor in ('admin','editora') or auth.uid() is null) then
    select data into m from public.matches where id::text=d->>'mid';
    perform public.tsi_push_emit(array[m->>'f1',m->>'f2'],'comentarios','Comentario de edición','Tienes un comentario sobre tus fotografías. Revísalo en TSI.','comentarios',k);

  elsif tg_table_name='matches' then
    photographers:=array[d->>'f1',d->>'f2'];
    if coalesce(nullif(d->>'ed',''),d->>'edBy','')<>'' then
      editors:=array[coalesce(nullif(d->>'ed',''),d->>'edBy')];
    else
      -- Igual que el portal: asignación implícita sólo si existe una única editora.
      select case when count(*)=1 then array_agg(id::text) else '{}'::text[] end
        into editors from public.profiles where role='editora';
    end if;
    if coalesce(d->>'stage','')<>'' and d->>'stage' is distinct from prev->>'stage' then
      label:=case d->>'stage' when 'descarga' then 'Fotos descargadas' when 'seleccion' then 'Fotos seleccionadas'
        when 'edicion' then 'Fotos editadas' when 'carga' then 'Fotos cargadas' when 'listos' then 'Archivos listos' else null end;
      if label is not null then
        perform public.tsi_push_emit(photographers,'proceso',label,'Cambió la etapa de una de tus coberturas.','cobertura',k||':stage');
      end if;
      if d->>'stage'='seleccion' then
        perform public.tsi_push_emit(editors,'carga','Material para edición','Una cobertura avanzó a selección. Revisa los archivos antes de iniciar.','proceso',k||':material');
      end if;
    end if;
    if coalesce(d->>'link','')<>'' and d->>'link' is distinct from prev->>'link' then
      perform public.tsi_push_emit(photographers||admins,'proceso','Enlace disponible','Se registró o actualizó el enlace de una cobertura. Comprueba la entrega en TSI.','cobertura',k||':link');
    end if;
    if coalesce((d->'cov'->>'locked')::boolean,false) and not coalesce((prev->'cov'->>'locked')::boolean,false) then
      perform public.tsi_push_emit(photographers,'cobertura','Cobertura registrada','Se guardó el registro final de una cobertura.','cobertura',k||':coverage');
    end if;

  elsif tg_table_name='pays' and d->>'status' is distinct from prev->>'status' then
    owner_id:=coalesce(to_jsonb(new)->>'owner',split_part(new.id::text,'|',1));
    if d->>'status' in ('aprobado','pagado') and (actor='admin' or auth.uid() is null) then
      perform public.tsi_push_emit(array[owner_id],'pagos',case when d->>'status'='pagado' then 'Pago realizado' else 'Pago para revisar' end,
        'Hay una actualización en tu pago. Consulta el detalle dentro del portal.','mipago',k);
    elsif d->>'status' in ('aceptado','revision') and (auth.uid()::text=owner_id or actor='admin' or auth.uid() is null) then
      perform public.tsi_push_emit(admins,'autorizaciones','Revisión de pago','Un integrante respondió a la revisión de su pago.','pagos',k);
    end if;

  elsif tg_table_name in ('expenses','loans') and d->>'status' is distinct from prev->>'status' then
    if d->>'status'='pendiente' then
      perform public.tsi_push_emit(admins,'autorizaciones','Solicitud pendiente','Hay una solicitud de '||case when tg_table_name='expenses' then 'gastos' else 'préstamo' end||' por revisar.',
        case when tg_table_name='expenses' then 'gastos' else 'prestamos' end,k);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.tsi_push_source_event() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['matches','avisos','feedback','pays','expenses','loans'] loop
    execute format('drop trigger if exists tsi_push_source on public.%I',t);
    execute format('create trigger tsi_push_source after insert or update on public.%I for each row execute function public.tsi_push_source_event()',t);
  end loop;
end $$;

-- Lease y SKIP LOCKED evitan que dos ejecuciones tomen la misma tanda.
create or replace function public.tsi_push_claim(batch_size int default 30)
returns setof public.tsi_push_events language sql security definer set search_path=public,pg_temp as $$
  with picked as (
    select id from public.tsi_push_events
    where ((state='pending' and available_at<=now()) or (state='sending' and leased_until<now()))
      and attempts<5 order by created_at for update skip locked limit least(greatest(batch_size,1),50)
  ) update public.tsi_push_events e set state='sending',attempts=e.attempts+1,leased_until=now()+interval '5 minutes'
    from picked where e.id=picked.id returning e.*;
$$;
revoke all on function public.tsi_push_claim(int) from public,anon,authenticated;
grant execute on function public.tsi_push_claim(int) to service_role;
commit;
