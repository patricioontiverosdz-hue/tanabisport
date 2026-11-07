-- LOCAL ONLY: minimal isolated schema created by support-230.cjs; not hosted Auth.
-- Synthetic records only; all changes rolled back. Run after the support migration.
begin;
insert into auth.users(id) values('23000000-0000-4000-8000-000000000001'),('23000000-0000-4000-8000-000000000002'),('23000000-0000-4000-8000-000000000003'),('23000000-0000-4000-8000-000000000004') on conflict(id) do nothing;
insert into public.profiles(id,name,role) values('23000000-0000-4000-8000-000000000001','Prueba Admin','admin'),('23000000-0000-4000-8000-000000000002','Prueba Foto','foto'),('23000000-0000-4000-8000-000000000003','Prueba Edición','editora'),('23000000-0000-4000-8000-000000000004','Prueba pendiente','pending') on conflict(id) do nothing;
set local role service_role;
do $$
declare r jsonb; tid uuid; n int; a uuid; before_count int; request_id uuid:='23000000-0000-4000-8000-000000000010';
begin
 r:=public.tsi230_support_command('register','{"name":"Prueba sintética","email":"support-test@example.invalid","phone":"","consent":true}',repeat('a',64),null);
 tid:=(r->'thread'->>'id')::uuid;
 if r?'contact' or r::text like '%support-test@%' or r::text like '%session_hash%' then raise exception 'Contacto expuesto al cliente';end if;
 if r->'thread'->>'folio' not like 'TABI-%' then raise exception 'Folio no persistente';end if;
 r:=public.tsi230_support_command('register','{"name":"Prueba sintética","email":"support-test@example.invalid","consent":true}',repeat('a',64),null);
 if (r->'thread'->>'id')::uuid<>tid then raise exception 'Registro duplicado';end if;
 begin perform public.tsi230_support_command('history','{}',repeat('b',64),null);raise exception 'Sesión ajena aceptada';exception when raise_exception then if sqlerrm not like '%SUPPORT_EXPIRED%' then raise;end if;end;
 r:=public.tsi230_support_command('category','{"category":"Cotización","request_id":"23000000-0000-4000-8000-000000000011"}',repeat('a',64),null);
 r:=public.tsi230_support_command('submit',jsonb_build_object('category','Cotización','summary','Partido de prueba; fecha por confirmar','request_id',request_id),repeat('a',64),null);
 select count(*) into n from public.tsi230_support_messages where thread_id=tid;
 r:=public.tsi230_support_command('submit',jsonb_build_object('category','Cotización','summary','Partido de prueba; fecha por confirmar','request_id',request_id),repeat('a',64),null);
 if (select count(*) from public.tsi230_support_messages where thread_id=tid)<>n then raise exception 'Reintento duplicó mensaje';end if;
 begin perform public.tsi230_support_command('submit',jsonb_build_object('category','Cotización','summary','Contenido cambiado','request_id',request_id),repeat('a',64),null);raise exception 'Cambio idempotente aceptado';exception when raise_exception then if sqlerrm not like '%SUPPORT_CONFLICT%' then raise;end if;end;
 for a in select unnest(array['23000000-0000-4000-8000-000000000001'::uuid,'23000000-0000-4000-8000-000000000002'::uuid,'23000000-0000-4000-8000-000000000003'::uuid]) loop
  r:=public.tsi230_support_command('staff-list','{}',null,a);if jsonb_array_length(r->'threads')<1 then raise exception 'Equipo no comparte bandeja';end if;
  r:=public.tsi230_support_command('staff-message',jsonb_build_object('thread_id',tid,'text','Respuesta de prueba','request_id',gen_random_uuid()),null,a);
  if r->'thread'->>'bot_paused'<>'true' or r->'thread'->>'status'<>'En atención' or r->'contact'->>'email'<>'support-test@example.invalid' then raise exception 'Respuesta humana incorrecta';end if;
 end loop;
 if (select count(distinct author_id) from public.tsi230_support_messages where thread_id=tid and kind='staff')<>3 then raise exception 'Autoría incompleta';end if;
 select count(*) into before_count from public.tsi230_support_messages where thread_id=tid and kind='bot';
 r:=public.tsi230_support_command('category',jsonb_build_object('category','Humano','request_id',gen_random_uuid()),repeat('a',64),null);
 if (select count(*) from public.tsi230_support_messages where thread_id=tid and kind='bot')<>before_count then raise exception 'TABI respondió después del humano';end if;
 r:=public.tsi230_support_command('staff-status',jsonb_build_object('thread_id',tid,'status','Resuelta','request_id',gen_random_uuid()),null,'23000000-0000-4000-8000-000000000003');
 r:=public.tsi230_support_command('message',jsonb_build_object('text','Otro dato de prueba','request_id',gen_random_uuid()),repeat('a',64),null);
 if r->'thread'->>'status'<>'Por atender' or r->'thread'->>'bot_paused'<>'true' then raise exception 'Mensaje no reabrió caso';end if;
 begin perform public.tsi230_support_command('staff-list','{}',null,'23000000-0000-4000-8000-000000000004');raise exception 'Pendiente accedió';exception when raise_exception then if sqlerrm not like '%SUPPORT_FORBIDDEN%' then raise;end if;end;
 r:=public.tsi230_support_command('avatar','{"avatar":""}',null,'23000000-0000-4000-8000-000000000002');
 if r->>'user_id'<>'23000000-0000-4000-8000-000000000002' then raise exception 'Avatar ajeno';end if;
 if has_table_privilege('anon','public.tsi230_support_threads','SELECT') or has_table_privilege('authenticated','public.tsi230_support_threads','SELECT') or has_function_privilege('anon','public.tsi230_support_command(text,jsonb,text,uuid)','EXECUTE') or has_table_privilege('authenticated','public.tsi230_team_avatars','UPDATE') then raise exception 'Grants excesivos';end if;
end $$;
rollback;
