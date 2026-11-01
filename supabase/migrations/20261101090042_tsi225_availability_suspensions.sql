-- TSI 2.2.5: suspensión justificada de disponibilidad. Aplicar SOLO a staging.
begin;
create schema if not exists tsi225_private;
revoke all on schema tsi225_private from public,anon;
grant usage on schema tsi225_private to authenticated;

create table public.tsi225_availability_suspensions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 start_date date not null,
 end_date date not null,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 released_at timestamptz,
 released_by uuid references public.profiles(id),
 release_reason text,
 check(end_date>=start_date),
 check((released_at is null and released_by is null and release_reason is null)
    or (released_at is not null and released_by is not null and release_reason is not null and length(btrim(release_reason)) between 1 and 1000))
);
create index tsi225_suspensions_person_dates on public.tsi225_availability_suspensions(user_id,start_date,end_date) where released_at is null;
alter table public.tsi225_availability_suspensions enable row level security;
revoke all on public.tsi225_availability_suspensions from public,anon,authenticated;
grant select on public.tsi225_availability_suspensions to authenticated;
create policy tsi225_suspensions_read on public.tsi225_availability_suspensions for select to authenticated
 using((select public.is_admin()) or user_id=(select auth.uid()));

create table tsi225_private.receipts (
 request_id uuid primary key,
 actor_id uuid not null references public.profiles(id),
 operation text not null check(operation in ('suspend','release')),
 payload jsonb not null,
 suspension_id uuid not null references public.tsi225_availability_suspensions(id),
 created_at timestamptz not null default now()
);
alter table tsi225_private.receipts enable row level security;
revoke all on tsi225_private.receipts from public,anon,authenticated;

create function tsi225_private.state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r text;
begin
 select role into r from public.profiles where id=uid;
 if uid is null or r is null or r not in ('admin','foto','editora') then
  raise exception 'Sin permiso para consultar suspensiones' using errcode='42501';
 end if;
 return jsonb_build_object('server_now',now(),'suspensions',coalesce((
  select jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id)
  from public.tsi225_availability_suspensions s where r='admin' or s.user_id=uid
 ),'[]'::jsonb));
end $$;

create function tsi225_private.suspend(p_user_id uuid,p_start_date date,p_end_date date,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r text; who text; note text:=btrim(coalesce(p_reason,''));
 body jsonb; prior tsi225_private.receipts%rowtype; sid uuid;
begin
 select role into r from public.profiles where id=uid;
 if uid is null or r is distinct from 'admin' then raise exception 'Solo administración puede suspender disponibilidad' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Identificador de solicitud requerido' using errcode='22023'; end if;
 body:=jsonb_build_object('user_id',p_user_id,'start_date',p_start_date,'end_date',p_end_date,'reason',note);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,225));
 select * into prior from tsi225_private.receipts where request_id=p_request_id;
 if found then
  if prior.actor_id<>uid or prior.operation<>'suspend' or prior.payload is distinct from body then raise exception 'Solicitud ya utilizada con otros datos' using errcode='22023'; end if;
  return tsi225_private.state();
 end if;
 if length(note) not between 1 and 1000 then raise exception 'Indica un motivo justificado de hasta 1000 caracteres' using errcode='22023'; end if;
 if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_start_date<(now() at time zone 'America/Monterrey')::date or not isfinite(p_start_date) or not isfinite(p_end_date) then
  raise exception 'Periodo inválido: selecciona fechas desde hoy y un final igual o posterior al inicio' using errcode='22023';
 end if;
 select role into who from public.profiles where id=p_user_id for update;
 if who is null or who not in ('foto','editora') then raise exception 'Selecciona una persona de fotografía o edición' using errcode='22023'; end if;
 if exists(select 1 from public.tsi225_availability_suspensions where user_id=p_user_id and released_at is null and start_date<=p_end_date and end_date>=p_start_date) then
  raise exception 'La persona ya tiene una suspensión que coincide con ese periodo' using errcode='23505';
 end if;
 insert into public.tsi225_availability_suspensions(user_id,start_date,end_date,reason,created_by)
 values(p_user_id,p_start_date,p_end_date,note,uid) returning id into sid;
 insert into tsi225_private.receipts(request_id,actor_id,operation,payload,suspension_id) values(p_request_id,uid,'suspend',body,sid);
 return tsi225_private.state();
end $$;

create function tsi225_private.release(p_id uuid,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r text; target uuid; note text:=btrim(coalesce(p_reason,''));
 body jsonb; prior tsi225_private.receipts%rowtype; row_before public.tsi225_availability_suspensions%rowtype;
begin
 select role into r from public.profiles where id=uid;
 if uid is null or r is distinct from 'admin' then raise exception 'Solo administración puede levantar suspensiones' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Identificador de solicitud requerido' using errcode='22023'; end if;
 body:=jsonb_build_object('id',p_id,'reason',note);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,225));
 select * into prior from tsi225_private.receipts where request_id=p_request_id;
 if found then
  if prior.actor_id<>uid or prior.operation<>'release' or prior.payload is distinct from body then raise exception 'Solicitud ya utilizada con otros datos' using errcode='22023'; end if;
  return tsi225_private.state();
 end if;
 if length(note) not between 1 and 1000 then raise exception 'Justifica el levantamiento con hasta 1000 caracteres' using errcode='22023'; end if;
 select user_id into target from public.tsi225_availability_suspensions where id=p_id;
 if target is null then raise exception 'Suspensión inexistente' using errcode='22023'; end if;
 perform 1 from public.profiles where id=target for update;
 select * into row_before from public.tsi225_availability_suspensions where id=p_id for update;
 if row_before.released_at is not null then raise exception 'Esta suspensión ya fue levantada' using errcode='22023'; end if;
 update public.tsi225_availability_suspensions set released_at=now(),released_by=uid,release_reason=note where id=p_id;
 insert into tsi225_private.receipts(request_id,actor_id,operation,payload,suspension_id) values(p_request_id,uid,'release',body,p_id);
 return tsi225_private.state();
end $$;

create function public.tsi225_availability_suspensions_state() returns jsonb
language sql stable security invoker set search_path='' as $$ select tsi225_private.state() $$;
create function public.tsi225_suspend_availability(p_user_id uuid,p_start_date date,p_end_date date,p_reason text,p_request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select tsi225_private.suspend(p_user_id,p_start_date,p_end_date,p_reason,p_request_id) $$;
create function public.tsi225_release_availability(p_id uuid,p_reason text,p_request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select tsi225_private.release(p_id,p_reason,p_request_id) $$;

create function tsi225_private.is_suspended(p_user_id uuid,p_date date) returns boolean
language sql volatile security invoker set search_path='' as $$
 select exists(select 1 from public.tsi225_availability_suspensions where user_id=p_user_id and released_at is null and p_date between start_date and end_date)
$$;
create function tsi225_private.person_suspensions(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id),'[]'::jsonb)
 from public.tsi225_availability_suspensions s where s.user_id=p_user_id
$$;
create function tsi225_private.capacity_record(record jsonb,p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select record||jsonb_build_object('effective_daily_minutes',coalesce((
 select jsonb_agg(case when tsi225_private.is_suspended(p_user_id,(record->>'week_start')::date+(d.ordinality::integer-1)) then '0'::jsonb else d.value end order by d.ordinality)
 from jsonb_array_elements(record->'daily_minutes') with ordinality d(value,ordinality)
 ),'[]'::jsonb))
$$;
create function tsi225_private.photo_record(record jsonb,p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when record is null or record='null'::jsonb then record else record||jsonb_build_object('effective_schedule',coalesce((
 select jsonb_agg(case when tsi225_private.is_suspended(p_user_id,(record->>'week_start')::date+(d.ordinality::integer-1)) then d.value||'{"available":false,"suspended":true}'::jsonb else d.value end order by d.ordinality)
 from jsonb_array_elements(record->'schedule') with ordinality d(value,ordinality)
 ),'[]'::jsonb)) end
$$;

-- Runs after trg_auto_editora / trg_guard_matches. Old assignments and work history
-- remain intact; only a new assignment or a changed match date needs a new check.
create function tsi225_private.guard_match_assignments() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_data jsonb:='{}'::jsonb; person uuid; day date; slot text; candidate text; people uuid[]:='{}'::uuid[];
begin
 if tg_op='UPDATE' then old_data:=old.data; end if;
 for slot in select unnest(array['f1','f2','ed']) loop
  candidate:=nullif(new.data->>slot,'');
  if candidate is not null and (candidate is distinct from old_data->>slot or new.data->>'date' is distinct from old_data->>'date') and candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   people:=array_append(people,candidate::uuid);
  end if;
 end loop;
 if cardinality(people)=0 then return new; end if;
 if coalesce(new.data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'La asignación requiere una fecha válida' using errcode='22023'; end if;
 day:=(new.data->>'date')::date;
 for person in select distinct x from unnest(people) x order by x loop
  perform 1 from public.profiles where id=person for update;
  if tsi225_private.is_suspended(person,day) then raise exception 'No se puede asignar: la disponibilidad de esa persona está suspendida para la fecha del partido' using errcode='23514'; end if;
 end loop;
 return new;
end $$;
create trigger tsi225_guard_match_assignments before insert or update of data on public.matches
 for each row execute function tsi225_private.guard_match_assignments();

CREATE OR REPLACE FUNCTION public.tsi11_state(eid uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); role_name text; target uuid; result jsonb;
BEGIN
 SELECT role INTO role_name FROM public.profiles WHERE id=uid;
 IF uid IS NULL OR role_name NOT IN ('admin','editora') OR role_name IS NULL THEN RAISE EXCEPTION 'Sin permiso TSI'; END IF;
 target:=coalesce(eid,uid);
 IF role_name<>'admin' AND target<>uid THEN RAISE EXCEPTION 'Solo tu propia carga'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND role='editora') THEN RAISE EXCEPTION 'Selecciona una editora'; END IF;
 SELECT jsonb_build_object('server_now',now(),'editor_id',target,
 'model',(SELECT to_jsonb(v) FROM public.intelligence_model_versions v WHERE id='tsi-1.1-inicial'),
 'capacity',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY week_start,version) FROM public.editor_capacity_settings c WHERE editor_id=target),'[]'::jsonb),
 'estimates',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at,version) FROM public.editor_time_estimates e WHERE editor_id=target),'[]'::jsonb),
 'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY started_at,id) FROM public.editor_time_sessions s WHERE editor_id=target),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY happened_at) FROM public.editor_time_events e WHERE actor_id=target OR (role_name='admin' AND payload->>'editor_id'=target::text)),'[]'::jsonb),
 'matches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'data',m.data) ORDER BY m.id) FROM public.matches m WHERE public.tsi11_can_work(m.id,target)),'[]'::jsonb),
 'snapshots',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY created_at DESC) FROM (SELECT * FROM public.editor_workload_snapshots WHERE editor_id=target ORDER BY created_at DESC LIMIT 30) s),'[]'::jsonb)
 ) INTO result;
 RETURN result||jsonb_build_object('suspensions',tsi225_private.person_suspensions(target),'capacity',coalesce((select jsonb_agg(tsi225_private.capacity_record(c,target)) from jsonb_array_elements(result->'capacity') c),'[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.tsi11_photo_availability_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); r text; result jsonb;
BEGIN
 SELECT role INTO r FROM public.profiles WHERE id=uid;
 IF uid IS NULL OR r IS NULL OR r NOT IN ('admin','foto') THEN RAISE EXCEPTION 'Sin permiso para consultar disponibilidad'; END IF;
 SELECT jsonb_build_object('server_now',now(),'photographers',
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'latest',
 (SELECT to_jsonb(a) FROM public.photographer_availability a WHERE a.photographer_id=p.id AND a.week_start=date_trunc('week',now() AT TIME ZONE 'America/Mexico_City')::date ORDER BY version DESC LIMIT 1),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.week_start DESC NULLS LAST,a.version DESC) FROM public.photographer_availability a WHERE a.photographer_id=p.id),'[]'::jsonb)
 ) ORDER BY p.name,p.id) FROM public.profiles p WHERE p.role='foto' AND (r='admin' OR p.id=uid)),'[]'::jsonb)) INTO result;
 RETURN result||jsonb_build_object('suspensions',(tsi225_private.state()->'suspensions'),'photographers',coalesce((select jsonb_agg(person||jsonb_build_object('suspensions',tsi225_private.person_suspensions((person->>'id')::uuid),'latest',tsi225_private.photo_record(person->'latest',(person->>'id')::uuid),'history',coalesce((select jsonb_agg(tsi225_private.photo_record(rec,(person->>'id')::uuid)) from jsonb_array_elements(person->'history') rec),'[]'::jsonb))) from jsonb_array_elements(result->'photographers') person),'[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.tsi11_command(operation text, payload jsonb, request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); role_name text; target uuid; mid text; entry public.editor_time_sessions%ROWTYPE;
 ver integer; day integer; minutes numeric; wk date; job jsonb; stamp timestamptz:=clock_timestamp();
 snap uuid; source jsonb; note text; seconds numeric; deadline timestamptz;
BEGIN
 SELECT role INTO role_name FROM public.profiles WHERE id=uid;
 IF uid IS NULL OR role_name IS NULL OR role_name NOT IN ('admin','editora') THEN RAISE EXCEPTION 'Sin permiso TSI'; END IF;
 IF request_id IS NULL OR payload IS NULL OR jsonb_typeof(payload)<>'object' THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
 target:=coalesce(nullif(payload->>'editor_id','')::uuid,uid);
 IF role_name<>'admin' AND target<>uid THEN RAISE EXCEPTION 'Solo tu propio registro'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND role='editora') THEN RAISE EXCEPTION 'Editora inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,11));
 IF EXISTS(SELECT 1 FROM public.editor_time_events e WHERE e.actor_id=uid AND e.request_id=tsi11_command.request_id) THEN RETURN public.tsi11_state(target); END IF;
 -- Al expirar, conservar solo tiempo confirmado hasta la última señal.
 -- No añadir los 75 segundos de tolerancia como tiempo trabajado.
 UPDATE public.editor_time_sessions SET stopped_at=last_ping,status='expired'
 WHERE editor_id=target AND status='active' AND last_ping+interval '75 seconds'<stamp;
 mid:=payload->>'match_id';
 IF operation IN ('start','job') AND NOT public.tsi11_can_work(mid,target) THEN RAISE EXCEPTION 'Partido no asignado a esa editora'; END IF;
 IF operation='capacity' THEN
  IF uid<>target OR role_name<>'editora' THEN RAISE EXCEPTION 'La disponibilidad debe confirmarla la propia editora'; END IF;
  wk:=(payload->>'week_start')::date;
  IF extract(isodow FROM wk)<>1 OR wk<(stamp AT TIME ZONE 'America/Mexico_City')::date-extract(isodow FROM stamp AT TIME ZONE 'America/Mexico_City')::integer+1 THEN RAISE EXCEPTION 'Semana inválida o histórica'; END IF;
  IF jsonb_typeof(payload->'daily_minutes')<>'array' OR jsonb_array_length(payload->'daily_minutes')<>4 THEN RAISE EXCEPTION 'Declara cuatro días'; END IF;
  FOR day IN 0..3 LOOP
   minutes:=(payload->'daily_minutes'->>day)::numeric;
   IF minutes IS NULL OR minutes<0 OR minutes>1440 OR minutes<>trunc(minutes) THEN RAISE EXCEPTION 'Minutos inválidos'; END IF;
  END LOOP;
  note:=btrim(coalesce(payload->>'reason',''));
  IF note='' THEN RAISE EXCEPTION 'Indica el motivo de la confirmación o cambio'; END IF;
  SELECT coalesce(max(version),0)+1 INTO ver FROM public.editor_capacity_settings WHERE editor_id=target AND week_start=wk;
  INSERT INTO public.editor_capacity_settings(editor_id,week_start,version,daily_minutes,reason,actor_id)
  VALUES(target,wk,ver,payload->'daily_minutes',note,uid);
 ELSIF operation='job' THEN
  job:=payload->'data'; note:=btrim(coalesce(payload->>'reason',''));
  IF job IS NULL OR jsonb_typeof(job)<>'object' OR note='' THEN RAISE EXCEPTION 'Datos y motivo requeridos'; END IF;
  IF (job->>'players_total')::integer<0 OR (job->>'players_done')::integer<0 OR (job->>'players_done')::integer>(job->>'players_total')::integer
   OR (job->>'players_total')::integer IS NULL OR (job->>'players_done')::integer IS NULL THEN RAISE EXCEPTION 'Jugadores inválidos'; END IF;
  IF job->>'manual_minutes_per_player' IS NOT NULL AND ((job->>'manual_minutes_per_player')::numeric<=0 OR (job->>'manual_minutes_per_player')::numeric>1440) THEN RAISE EXCEPTION 'Estimación inválida'; END IF;
  IF (job->>'correction_pending_minutes')::numeric IS NULL OR ((job->>'correction_pending_minutes')::numeric<0 OR (job->>'correction_pending_minutes')::numeric>604800) THEN RAISE EXCEPTION 'Declara correcciones pendientes'; END IF;
  deadline:=(job->>'deadline')::timestamptz;
  IF deadline IS NULL THEN RAISE EXCEPTION 'Fecha límite requerida'; END IF;
  SELECT coalesce(max(version),0)+1 INTO ver FROM public.editor_time_estimates WHERE editor_id=target AND match_id=mid;
  INSERT INTO public.editor_time_estimates(editor_id,match_id,version,data,actor_id)
  VALUES(target,mid,ver,job||jsonb_build_object('reason',note,'model_id','tsi-1.1-inicial'),uid);
 ELSIF operation='start' THEN
  IF uid<>target OR role_name<>'editora' THEN RAISE EXCEPTION 'Solo la editora inicia su cronómetro'; END IF;
  IF EXISTS(SELECT 1 FROM public.matches WHERE id=mid AND coalesce((data->>'archived')::boolean,false)) THEN RAISE EXCEPTION 'Partido archivado'; END IF;
  IF payload->>'kind'='original' AND EXISTS(SELECT 1 FROM public.matches WHERE id=mid AND data->>'stage'='listos') THEN RAISE EXCEPTION 'La edición original ya terminó; registra una corrección'; END IF;
  IF EXISTS(SELECT 1 FROM public.editor_time_sessions WHERE editor_id=target AND status='active') THEN RAISE EXCEPTION 'Pausa la sesión activa antes de iniciar otra'; END IF;
  IF payload->>'kind' NOT IN ('original','correction') OR payload->>'kind' IS NULL THEN RAISE EXCEPTION 'Tipo de sesión inválido'; END IF;
  IF payload->>'kind'='correction' AND btrim(coalesce(payload->>'note',''))='' THEN RAISE EXCEPTION 'Describe la corrección'; END IF;
  INSERT INTO public.editor_time_sessions(editor_id,match_id,kind,correction_note,status,started_at,last_ping)
  VALUES(target,mid,payload->>'kind',coalesce(payload->>'note',''),'active',stamp,stamp);
 ELSIF operation IN ('heartbeat','pause','adjust') THEN
  SELECT * INTO entry FROM public.editor_time_sessions WHERE id=(payload->>'session_id')::uuid AND editor_id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión inexistente'; END IF;
  IF operation='heartbeat' AND uid<>target THEN RAISE EXCEPTION 'No puedes mantener sesiones ajenas'; END IF;
  IF operation='adjust' THEN
   seconds:=(payload->>'active_seconds')::numeric;
   IF seconds IS NULL OR seconds<0 OR seconds>604800 OR btrim(coalesce(payload->>'reason',''))='' OR entry.status='active' THEN RAISE EXCEPTION 'Pausa la sesión y justifica el ajuste de tiempo'; END IF;
   payload:=payload||jsonb_build_object('previous_seconds',entry.active_seconds);
   UPDATE public.editor_time_sessions SET active_seconds=seconds WHERE id=entry.id;
  ELSIF entry.status='active' THEN
   UPDATE public.editor_time_sessions SET active_seconds=active_seconds+greatest(0,extract(epoch FROM (least(stamp,last_ping+interval '75 seconds')-last_ping))),
   last_ping=stamp,status=CASE WHEN operation='pause' THEN 'paused' ELSE 'active' END,
   stopped_at=CASE WHEN operation='pause' THEN stamp ELSE NULL END WHERE id=entry.id;
  END IF;
 ELSIF operation='snapshot' THEN
  source:=public.tsi11_state(target);
  IF payload->'basis' IS DISTINCT FROM jsonb_build_object('capacity',source->'capacity','estimates',source->'estimates','sessions',source->'sessions','matches',source->'matches','model',source->'model','suspensions',source->'suspensions') THEN RAISE EXCEPTION 'Los datos cambiaron. Recarga TSI antes de guardar el pronóstico'; END IF;
  IF jsonb_typeof(payload->'forecast')<>'object' OR payload->'forecast'->>'model_id'<>'tsi-1.1-inicial' THEN RAISE EXCEPTION 'Modelo inválido'; END IF;
  INSERT INTO public.editor_workload_snapshots(editor_id,model_id,source_data,forecast,actor_id)
  VALUES(target,'tsi-1.1-inicial',source-'snapshots',payload->'forecast',uid) RETURNING id INTO snap;
  FOR job IN SELECT value FROM jsonb_array_elements(jsonb_build_array(payload->'forecast'->'current')||(payload->'forecast'->'weeks')) LOOP
   IF job->>'color'='red' THEN
    INSERT INTO public.editor_intelligence_alerts(snapshot_id,editor_id,kind,data) VALUES(snap,target,'weekly_overload',job);
   END IF;
   IF (job->>'critical')::boolean THEN
    INSERT INTO public.editor_intelligence_alerts(snapshot_id,editor_id,kind,data) VALUES(snap,target,'deadline_risk',job);
   END IF;
  END LOOP;
  INSERT INTO public.editor_intelligence_alerts(snapshot_id,editor_id,kind,data)
  VALUES(snap,target,'capacity_recommendation',payload->'forecast');
 ELSE RAISE EXCEPTION 'Operación no permitida';
 END IF;
 INSERT INTO public.editor_time_events(request_id,actor_id,operation,payload,happened_at)
 VALUES(tsi11_command.request_id,uid,operation,(payload-'basis')||jsonb_build_object('editor_id',target),stamp);
 RETURN public.tsi11_state(target);
END $function$;

CREATE OR REPLACE FUNCTION public.auto_assign_editora()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n   int;
  eid text;
begin
  if coalesce(new.data->>'ed', '') = '' then
    select count(*), min(id::text) into n, eid from public.profiles where role = 'editora';
    if n = 1 then
      perform 1 from public.profiles where id=eid::uuid for update;
      if coalesce(new.data->>'date','') ~ '^\d{4}-\d{2}-\d{2}$' and tsi225_private.is_suspended(eid::uuid,(new.data->>'date')::date) then return new; end if;
      new.data := jsonb_set(new.data, '{ed}', to_jsonb(eid));
    end if;
  end if;
  return new;
end $function$;

-- Keep privileged implementation functions private, with explicit caller checks.
revoke all on all functions in schema tsi225_private from public,anon,authenticated;
grant execute on function tsi225_private.state(),tsi225_private.suspend(uuid,date,date,text,uuid),tsi225_private.release(uuid,text,uuid) to authenticated;
revoke all on function public.tsi225_availability_suspensions_state(),public.tsi225_suspend_availability(uuid,date,date,text,uuid),public.tsi225_release_availability(uuid,text,uuid) from public,anon;
grant execute on function public.tsi225_availability_suspensions_state(),public.tsi225_suspend_availability(uuid,date,date,text,uuid),public.tsi225_release_availability(uuid,text,uuid) to authenticated;

-- Include the suspension audit records in the existing admin-only backup.
do $backup$
declare previous text[];
begin
 previous:=tsi210_private.backup_tables();
 if not 'tsi225_availability_suspensions'=any(previous) then
  execute format('create or replace function tsi210_private.backup_tables() returns text[] language sql immutable set search_path='''' as %L',
    'select '||quote_literal(previous||array['tsi225_availability_suspensions'])||'::text[]');
 end if;
end $backup$;
revoke all on function tsi210_private.backup_tables() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
