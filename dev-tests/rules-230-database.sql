-- Local synthetic fixture for the isolated rules migration. Always rolled back.
begin;
insert into public.profiles(id,name,role) values('23000000-0000-4000-8000-000000000001','Admin prueba','admin'),('23000000-0000-4000-8000-000000000002','Foto prueba','foto'),('23000000-0000-4000-8000-000000000003','Edición prueba','editora');
do $$
declare wk date:=date_trunc('week',now() at time zone 'America/Monterrey')::date+14; all_days jsonb:='[{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"}]';latest jsonb;
begin
 insert into public.photographer_availability(photographer_id,week_start,version,schedule) values('23000000-0000-4000-8000-000000000002',wk,1,all_days);
 latest:=jsonb_set(all_days,'{0}','{"available":true,"start":"10:00","end":"11:00"}');
 insert into public.photographer_availability(photographer_id,week_start,version,schedule) values('23000000-0000-4000-8000-000000000002',wk,2,latest);
 if tsi230_rules.photo_allowed('23000000-0000-4000-8000-000000000002',wk,'09:30') then raise exception 'Usó versión antigua';end if;
 if not tsi230_rules.photo_allowed('23000000-0000-4000-8000-000000000002',wk,'10:00') then raise exception 'Inicio inclusivo rechazado';end if;
 if tsi230_rules.photo_allowed('23000000-0000-4000-8000-000000000002',wk,'11:00') then raise exception 'Fin exclusivo aceptado';end if;
 if tsi230_rules.photo_allowed('23000000-0000-4000-8000-000000000002',wk+7,'10:00') then raise exception 'Disponibilidad otra semana aceptada';end if;
end $$;
select set_config('request.jwt.claim.sub','23000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$
declare wk date:=date_trunc('week',now() at time zone 'America/Monterrey')::date+14; blocked boolean;
begin
 insert into public.matches(id,data) values('rules-photo',jsonb_build_object('date',wk,'time','10:00','f1','23000000-0000-4000-8000-000000000002'));
 blocked:=false;begin insert into public.matches(id,data) values('rules-photo-end',jsonb_build_object('date',wk,'time','11:00','f1','23000000-0000-4000-8000-000000000002'));exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Trigger ignoró horario';end if;
 blocked:=false;begin insert into public.matches(id,data) values('rules-photo-missing',jsonb_build_object('date',wk,'time','','f1','23000000-0000-4000-8000-000000000002'));exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Asignó sin hora';end if;
end $$;
reset role;
insert into public.tsi225_availability_suspensions(user_id,start_date,end_date) values('23000000-0000-4000-8000-000000000002',date_trunc('week',now() at time zone 'America/Monterrey')::date+14,date_trunc('week',now() at time zone 'America/Monterrey')::date+14);
set local role authenticated;
do $$
declare blocked boolean;wk date:=date_trunc('week',now() at time zone 'America/Monterrey')::date+14;
begin
 update public.matches set data=data||'{"note":"Dato histórico conservado"}' where id='rules-photo';
 blocked:=false;begin update public.matches set data=data||'{"time":"10:30"}' where id='rules-photo';exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Cambió horario durante suspensión';end if;
 blocked:=false;begin insert into public.matches(id,data) values('rules-photo-suspended',jsonb_build_object('date',wk,'time','10:00','f1','23000000-0000-4000-8000-000000000002'));exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Asignó durante suspensión';end if;
end $$;
reset role;
insert into public.matches(id,data) values('rules-edit', '{"stage":"listos","cov":{"players":5},"ed":"23000000-0000-4000-8000-000000000003"}');
select set_config('request.jwt.claim.sub','23000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$
declare blocked boolean;
begin
 blocked:=false;begin insert into public.pays(id,owner,data) values('rules-no-clock','23000000-0000-4000-8000-000000000003','{"total":100,"lines":[{"mid":"rules-edit","amount":100}]}');exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Pago sin cronómetro aceptado';end if;
end $$;
reset role;
insert into public.editor_time_sessions(editor_id,match_id,kind,status,active_seconds) values('23000000-0000-4000-8000-000000000003','rules-edit','original','active',30),('23000000-0000-4000-8000-000000000003','rules-edit','correction','paused',90),('23000000-0000-4000-8000-000000000003','rules-edit','original','paused',0);
set local role authenticated;
do $$
declare blocked boolean;
begin
 blocked:=false;begin insert into public.pays(id,owner,data) values('rules-wrong-clock','23000000-0000-4000-8000-000000000003','{"total":100,"lines":[{"mid":"rules-edit","amount":100}]}');exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Pago con sesión activa/corrección/cero aceptado';end if;
end $$;
reset role;
insert into public.editor_time_sessions(editor_id,match_id,kind,status,active_seconds) values('23000000-0000-4000-8000-000000000003','rules-edit','original','paused',125);
set local role authenticated;
insert into public.pays(id,owner,data) values('rules-valid-clock','23000000-0000-4000-8000-000000000003','{"total":100,"lines":[{"mid":"rules-edit","amount":100}]}');
do $$begin if (select data->'tsi230_clock'->0->>'original_seconds' from public.pays where id='rules-valid-clock')<>'125' then raise exception 'Evidencia incorrecta';end if;end $$;
reset role;
-- Historical approved payments existed before the trigger, with no timer or evidence.
alter table public.pays disable trigger tsi230_guard_editor_pay;
insert into public.pays(id,owner,data) values('rules-legacy-approved','23000000-0000-4000-8000-000000000003','{"total":70,"lines":[{"mid":"legacy-without-timer","amount":70}],"status":"approved"}');
alter table public.pays enable trigger tsi230_guard_editor_pay;
delete from public.editor_time_sessions;
set local role authenticated;
update public.pays set data=data||'{"status":"paid","settlement":"fixture"}' where id='rules-legacy-approved';
update public.pays set data=data||'{"status":"approved","tsi230_clock":[{"original_seconds":999999}]}' where id='rules-valid-clock';
do $$
declare blocked boolean;
begin
 if (select data->>'status' from public.pays where id='rules-legacy-approved')<>'paid' then raise exception 'Pago aprobado perdió flujo';end if;
 if (select data->'tsi230_clock'->0->>'original_seconds' from public.pays where id='rules-valid-clock')<>'125' then raise exception 'Evidencia previa alterable';end if;
 blocked:=false;begin update public.pays set data=jsonb_set(data,'{total}','101') where id='rules-valid-clock';exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Nuevo monto sin cronómetro aceptado';end if;
end $$;
rollback;
