-- ONLY staging nksqpoigywfegcbvfhoa, after TSI 2.2.5 migration.
-- Uses existing role IDs internally; returns no personal data. All changes roll back.
begin;
set local statement_timeout='30s';
do $verify$
#variable_conflict use_variable
declare
 admin_id uuid; foto_id uuid; editor_id uuid; other_foto uuid;
 wk date:=date_trunc('week',now() at time zone 'America/Monterrey')::date+14;
 s_editor uuid; s_foto uuid; request_editor uuid:=gen_random_uuid(); request_foto uuid:=gen_random_uuid(); request_release uuid:=gen_random_uuid();
 mid text:='tsi225-test-'||gen_random_uuid()::text; response jsonb; original jsonb; blocked boolean; count_before bigint; ver integer;
begin
 select id into admin_id from public.profiles where role='admin' order by id limit 1;
 select id into foto_id from public.profiles where role='foto' order by id limit 1;
 select id into editor_id from public.profiles where role='editora' order by id limit 1;
 select id into other_foto from public.profiles where role='foto' and id<>foto_id order by id limit 1;
 if admin_id is null or foto_id is null or editor_id is null then raise exception 'Requires existing admin/foto/editora role fixtures'; end if;
 -- Qualify column to avoid collision with local editor_id.
 select coalesce(max(c.version),0)+1 into ver from public.editor_capacity_settings c where c.editor_id=editor_id and c.week_start=wk;
 insert into public.editor_capacity_settings(editor_id,week_start,version,daily_minutes,reason,actor_id)
 values(editor_id,wk,ver,'[120,120,120,120]','TSI225 rollback fixture',editor_id);
 select coalesce(max(a.version),0)+1 into ver from public.photographer_availability a where a.photographer_id=foto_id;
 original:='[{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"},{"available":true,"start":"09:00","end":"18:00"}]'::jsonb;
 insert into public.photographer_availability(photographer_id,version,schedule,reason,request_id,week_start)
 values(foto_id,ver,original,'TSI225 rollback fixture',gen_random_uuid(),wk);

 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 -- An existing assignment must survive a later suspension and unrelated updates.
 insert into public.matches(id,data) values(mid,jsonb_build_object('id',mid,'date',wk,'time','10:00','ed',editor_id::text,'f1','','f2','','stage','','cat','TSI225','teams','Rollback fixture','venue','Pruebas'));
 select count(*) into count_before from public.tsi225_availability_suspensions;
 response:=public.tsi225_suspend_availability(editor_id,wk,wk+1,'Justificación de prueba',request_editor);
 select (x->>'id')::uuid into s_editor from jsonb_array_elements(response->'suspensions') x where x->>'user_id'=editor_id::text and x->>'reason'='Justificación de prueba';
 if s_editor is null then raise exception 'Missing created editor suspension'; end if;
 response:=public.tsi225_suspend_availability(editor_id,wk,wk+1,'Justificación de prueba',request_editor);
 if (select count(*) from public.tsi225_availability_suspensions)<>count_before+1 then raise exception 'Retry created duplicate suspension'; end if;
 blocked:=false;
 begin perform public.tsi225_suspend_availability(editor_id,wk,wk+1,'Changed payload',request_editor); exception when sqlstate '22023' then blocked:=true; end;
 if not blocked then raise exception 'Reused request id accepted changed data'; end if;
 blocked:=false;
 begin perform public.tsi225_suspend_availability(editor_id,wk+1,wk+2,'Overlap',gen_random_uuid()); exception when unique_violation then blocked:=true; end;
 if not blocked then raise exception 'Inclusive overlap accepted'; end if;
 blocked:=false;
 begin perform public.tsi225_suspend_availability(foto_id,wk,wk+1,' ',gen_random_uuid()); exception when sqlstate '22023' then blocked:=true; end;
 if not blocked then raise exception 'Blank reason accepted'; end if;
 blocked:=false;
 begin perform public.tsi225_suspend_availability(foto_id,wk,wk+1,E'\t\n\r ',gen_random_uuid()); exception when sqlstate '22023' then blocked:=true; end;
 if not blocked then raise exception 'Whitespace-only suspension reason accepted'; end if;
 blocked:=false;
 begin perform public.tsi225_suspend_availability(foto_id,wk+1,wk,'Reverse dates',gen_random_uuid()); exception when sqlstate '22023' then blocked:=true; end;
 if not blocked then raise exception 'Reversed dates accepted'; end if;
 response:=public.tsi11_state(editor_id);
 if not exists(select 1 from jsonb_array_elements(response->'capacity') c where c->>'week_start'=wk::text and c->'daily_minutes'='[120,120,120,120]'::jsonb and c->'effective_daily_minutes'='[0,0,120,120]'::jsonb) then raise exception 'Effective editing capacity or original hours incorrect'; end if;
 if not exists(select 1 from jsonb_array_elements(response->'suspensions') x where x->>'id'=s_editor::text) then raise exception 'Editing state omitted suspension'; end if;
 update public.matches set data=data||'{"tsi225_test_note":"preserve existing assignment"}'::jsonb where id=mid;
 if not exists(select 1 from public.matches where id=mid and data->>'ed'=editor_id::text) then raise exception 'Existing assignment lost'; end if;
 blocked:=false;
 begin insert into public.matches(id,data) values(mid||'-blocked',jsonb_build_object('id',mid||'-blocked','date',wk+1,'time','10:00','ed',editor_id::text,'f1','','f2','')); exception when check_violation then blocked:=true; end;
 if not blocked then raise exception 'Explicit editor assignment bypassed suspension on inclusive end'; end if;
 -- Publishing an unassigned coverage option remains available while sole editor is suspended.
 insert into public.matches(id,data) values(mid||'-option',jsonb_build_object('id',mid||'-option','date',wk,'time','10:00','ed','','f1','','f2',''));
 if exists(select 1 from public.matches where id=mid||'-option' and coalesce(data->>'ed','')<>'') then raise exception 'Suspended editor automatically assigned to option'; end if;
 response:=public.tsi225_suspend_availability(foto_id,wk+2,wk+4,'Cobertura suspendida de prueba',request_foto);
 select (x->>'id')::uuid into s_foto from jsonb_array_elements(response->'suspensions') x where x->>'user_id'=foto_id::text and x->>'reason'='Cobertura suspendida de prueba';
 response:=public.tsi11_photo_availability_state();
 if not exists(select 1 from jsonb_array_elements(response->'photographers') p,jsonb_array_elements(p->'history') a where p->>'id'=foto_id::text and a->>'week_start'=wk::text and a->'schedule'=original and a->'effective_schedule'->2->>'available'='false' and a->'effective_schedule'->1->>'available'='true') then raise exception 'Photo state did not preserve schedule and apply effective suspension'; end if;
 blocked:=false;
 begin insert into public.matches(id,data) values(mid||'-photo',jsonb_build_object('id',mid||'-photo','date',wk+4,'time','10:00','ed','','f1',foto_id::text,'f2','')); exception when check_violation then blocked:=true; end;
 if not blocked then raise exception 'Photo assignment bypassed suspension'; end if;
 -- Removing an assignment is allowed; rescheduling into a suspension is not.
 blocked:=false;
 begin update public.matches set data=data||jsonb_build_object('date',wk+3,'f2',foto_id::text) where id=mid; exception when check_violation then blocked:=true; end;
 if not blocked then raise exception 'New second photographer bypassed suspension'; end if;

 perform set_config('request.jwt.claim.sub',foto_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',foto_id,'role','authenticated')::text,true);
 response:=public.tsi225_availability_suspensions_state();
 if exists(select 1 from jsonb_array_elements(response->'suspensions') x where x->>'user_id'<>foto_id::text) then raise exception 'Own state exposed another person'; end if;
 if exists(select 1 from public.tsi225_availability_suspensions where user_id<>foto_id) then raise exception 'RLS exposed another person'; end if;
 blocked:=false;
 begin perform public.tsi225_suspend_availability(foto_id,wk+6,wk+6,'Unauthorized',gen_random_uuid()); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Photographer suspended availability'; end if;
 blocked:=false;
 begin perform public.tsi225_release_availability(s_foto,'Unauthorized',gen_random_uuid()); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Photographer released suspension'; end if;
 blocked:=false;
 begin update public.tsi225_availability_suspensions set released_at=now() where id=s_foto; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Direct mutation bypassed RPC'; end if;

 perform set_config('request.jwt.claim.sub',editor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',editor_id,'role','authenticated')::text,true);
 response:=public.tsi225_availability_suspensions_state();
 if exists(select 1 from jsonb_array_elements(response->'suspensions') x where x->>'user_id'<>editor_id::text) then raise exception 'Editor state exposed another person'; end if;
 blocked:=false;
 begin perform public.tsi225_release_availability(s_editor,'Unauthorized',gen_random_uuid()); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Editor released suspension'; end if;

 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 blocked:=false;
 begin perform public.tsi225_release_availability(s_editor,E'\t\n\r ',gen_random_uuid()); exception when sqlstate '22023' then blocked:=true; end;
 if not blocked then raise exception 'Whitespace-only release reason accepted'; end if;
 response:=public.tsi225_release_availability(s_editor,'Retorno autorizado de prueba',request_release);
 response:=public.tsi225_release_availability(s_editor,'Retorno autorizado de prueba',request_release);
 if not exists(select 1 from jsonb_array_elements(response->'suspensions') x where x->>'id'=s_editor::text and x->>'released_by'=admin_id::text and x->>'release_reason'='Retorno autorizado de prueba' and x->>'released_at' is not null and x->>'created_by'=admin_id::text) then raise exception 'Release audit/idempotency incorrect'; end if;
 response:=public.tsi11_state(editor_id);
 if not exists(select 1 from jsonb_array_elements(response->'capacity') c where c->>'week_start'=wk::text and c->'effective_daily_minutes'='[120,120,120,120]'::jsonb) then raise exception 'Release did not restore original effective capacity'; end if;
 insert into public.matches(id,data) values(mid||'-returned',jsonb_build_object('id',mid||'-returned','date',wk,'time','10:00','ed',editor_id::text,'f1','','f2',''));
 response:=public.tsi225_release_availability(s_foto,'Retorno cobertura',gen_random_uuid());
 insert into public.matches(id,data) values(mid||'-photo-returned',jsonb_build_object('id',mid||'-photo-returned','date',wk+4,'time','10:00','ed','','f1',foto_id::text,'f2',''));
 execute 'reset role';
 if has_function_privilege('anon','public.tsi225_suspend_availability(uuid,date,date,text,uuid)','EXECUTE') or has_function_privilege('anon','public.tsi225_availability_suspensions_state()','EXECUTE') then raise exception 'Anonymous access was granted'; end if;
 if not 'tsi225_availability_suspensions'=any(tsi210_private.backup_tables()) then raise exception 'Suspension audit omitted from operational backup'; end if;
end $verify$;
rollback;
select 'TSI225 backend: RPC authorization, RLS privacy, reasons/dates/overlap, idempotency, original/effective availability, assignment guards, unassigned coverage and release passed; all fixtures rolled back.' as result;
