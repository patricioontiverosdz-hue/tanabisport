-- Run AFTER the TSI 2.2.2 migration on the intended project.
-- Uses existing authorized profile IDs internally; no personal data is returned.
-- All synthetic teams, command receipts and audit rows are rolled back.
begin;
set local statement_timeout = '30s';

do $verify$
declare
 admin_id uuid;
 foto_id uuid;
 editor_id uuid;
 admin_team uuid:=gen_random_uuid();
 foto_team uuid:=gen_random_uuid();
 legacy_team uuid:=gen_random_uuid();
 response jsonb;
 state jsonb;
 blocked boolean;
 bad_message text;
begin
 select id into admin_id from public.profiles where role='admin' order by id limit 1;
 select id into foto_id from public.profiles where role='foto' order by id limit 1;
 select id into editor_id from public.profiles where role='editora' order by id limit 1;
 if admin_id is null or foto_id is null or editor_id is null then
  raise exception 'Verification requires existing admin, foto and editora profiles.';
 end if;

 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';

 response:=public.tsi210_command(
  'team.save',
  jsonb_build_object('id',admin_team,'version',0,'team_name','TSI222 transactional verification',
   'sport','Flag','coordinator_name','','whatsapp','','notes','temporary; rolled back',
   'season','juvenil','season_year',2026),
  gen_random_uuid()
 );
 if response->>'season' is distinct from 'juvenil' or (response->>'season_year')::integer is distinct from 2026 then
  raise exception 'Admin team.save did not persist season and year.';
 end if;

 response:=public.tsi210_command(
  'team.save',
  response||jsonb_build_object('season','infantil','season_year',2027),
  gen_random_uuid()
 );
 if response->>'season' is distinct from 'infantil' or (response->>'season_year')::integer is distinct from 2027 then
  raise exception 'Admin update did not persist season and year.';
 end if;

 -- Legacy 2.2.1 update omits both keys and must preserve assigned season/year.
 response:=public.tsi210_command('team.save',
  (response-'season'-'season_year')||jsonb_build_object('notes','legacy update'),
  gen_random_uuid());
 if response->>'season' is distinct from 'infantil'
    or (response->>'season_year')::integer is distinct from 2027 then
  raise exception 'Legacy update discarded existing season/year.';
 end if;

 -- Legacy 2.2.1 insert must retain the unassigned legacy state.
 declare
  legacy_response jsonb;
 begin
  legacy_response:=public.tsi210_command('team.save',
   jsonb_build_object('id',legacy_team,'version',0,'team_name','TSI222 legacy verification',
    'sport','Flag','coordinator_name','','whatsapp','','notes','temporary; rolled back'),
   gen_random_uuid());
  if legacy_response->>'season' is distinct from '' or legacy_response->>'season_year' is not null then
   raise exception 'Legacy insert inferred an unsupported season/year.';
  end if;
  legacy_response:=public.tsi210_command('team.save',
   legacy_response||jsonb_build_object('season','','season_year',null,'notes','legacy clone update'),
   gen_random_uuid());
  if legacy_response->>'season' is distinct from '' or legacy_response->>'season_year' is not null then
   raise exception 'Legacy clone update changed the unassigned state.';
  end if;
 end;

 blocked:=false;
 begin
  perform public.tsi210_command('team.save',
   response||jsonb_build_object('season','','season_year',null),gen_random_uuid());
 exception when raise_exception then
  get stacked diagnostics bad_message=message_text;
  blocked:=bad_message like 'Selecciona temporada%';
 end;
 if not blocked then raise exception 'Assigned season/year could be erased by an empty pair.'; end if;

 blocked:=false;
 begin
  perform public.tsi210_command('team.save',
   jsonb_build_object('id',gen_random_uuid(),'version',0,'team_name','TSI222 invalid empty pair',
    'sport','Flag','season','','season_year',null),gen_random_uuid());
 exception when raise_exception then
  get stacked diagnostics bad_message=message_text;
  blocked:=bad_message like 'Selecciona temporada%';
 end;
 if not blocked then raise exception 'New explicit empty season/year pair was not rejected.'; end if;

 blocked:=false;
 begin
  perform public.tsi210_command('team.save',(response-'season_year'),gen_random_uuid());
 exception when raise_exception then
  get stacked diagnostics bad_message=message_text;
  blocked:=bad_message like 'Envía temporada y año juntos%';
 end;
 if not blocked then raise exception 'Partial season/year pair was not rejected.'; end if;

 blocked:=false;
 begin
  perform public.tsi210_command('team.save',response||jsonb_build_object('season','invalid'),gen_random_uuid());
 exception when raise_exception then
  get stacked diagnostics bad_message=message_text;
  blocked:=bad_message like 'Selecciona temporada%';
 end;
 if not blocked then raise exception 'Invalid season was not rejected.'; end if;

 blocked:=false;
 begin
  perform public.tsi210_command('team.save',response||jsonb_build_object('season_year',1999),gen_random_uuid());
 exception when raise_exception then
  get stacked diagnostics bad_message=message_text;
  blocked:=bad_message like 'Año fuera del intervalo%';
 end;
 if not blocked then raise exception 'Out-of-range year was not rejected.'; end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',foto_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',foto_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 response:=public.tsi210_command(
  'team.save',
  jsonb_build_object('id',foto_team,'version',0,'team_name','TSI222 foto verification',
   'sport','Flag','coordinator_name','','whatsapp','','notes','temporary; rolled back',
   'season','juvenil','season_year',2026),
  gen_random_uuid()
 );
 if response->>'owner_id' is distinct from foto_id::text or response->>'season' is distinct from 'juvenil'
    or (response->>'season_year')::integer is distinct from 2026 then
  raise exception 'Foto team.save failed season/year or ownership.';
 end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',editor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',editor_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';

 state:=public.tsi210_state();
 if not exists (select 1 from jsonb_array_elements(state->'teams') t
    where t->>'id'=admin_team::text and t->>'season'='infantil' and t->>'season_year'='2027')
    or not exists (select 1 from jsonb_array_elements(state->'teams') t where t->>'id'=foto_team::text) then
  raise exception 'Editora cannot read both synthetic directory entries including season/year.';
 end if;
 if state->'team_matches' is distinct from '[]'::jsonb or state->'rates' is distinct from '[]'::jsonb or state->'quotes' is distinct from '[]'::jsonb
    or state->'quote_costs' is distinct from '[]'::jsonb or state->'costs' is distinct from '[]'::jsonb
    or state->'audit' is distinct from '[]'::jsonb then
  raise exception 'Editora unexpectedly received restricted financial/audit data.';
 end if;

 blocked:=false;
 begin
  perform public.tsi210_command('team.save',response||jsonb_build_object('notes','forbidden'),gen_random_uuid());
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Editora team.save was not rejected.'; end if;

 blocked:=false;
 begin
  perform public.tsi210_command('team.link',jsonb_build_object('team_id',foto_team,'match_id','tsi222-nonexistent'),gen_random_uuid());
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Editora team.link was not rejected.'; end if;

 blocked:=false;
 begin
  perform public.tsi210_command('quote.save',jsonb_build_object('id',gen_random_uuid()),gen_random_uuid());
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Editora quote.save was not rejected.'; end if;

 blocked:=false;
 begin
  update public.tsi210_teams set notes='forbidden' where id=admin_team;
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Editora direct UPDATE was not rejected.'; end if;

 execute 'reset role';
end
$verify$;

rollback;
select 'TSI 2.2.2 transaction verification passed; synthetic data rolled back.' as result;

