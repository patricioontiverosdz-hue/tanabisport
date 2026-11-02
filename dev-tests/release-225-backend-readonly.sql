-- TSI 2.2.5: comprobación de catálogo, permisos y código; sin fixtures ni escrituras.
-- Ejecutar DESPUÉS de ambas migraciones. No devuelve filas operativas ni datos personales.
-- Los hashes MD5 identifican bytes prosrc del SQL revisado, no son hashes de seguridad.
begin read only;
set local statement_timeout='15s';
do $verify$
declare item record; oid_fn oid; signature text; allowed boolean;
begin
 if to_regclass('public.tsi225_availability_suspensions') is null
    or to_regclass('tsi225_private.receipts') is null then
  raise exception 'TSI225: falta una tabla requerida';
 end if;
 if exists(select 1 from pg_class where oid in ('public.tsi225_availability_suspensions'::regclass,'tsi225_private.receipts'::regclass) and not relrowsecurity) then
  raise exception 'TSI225: RLS deshabilitado';
 end if;
 if (select count(*) from pg_policy where polrelid='public.tsi225_availability_suspensions'::regclass)<>1
    or not exists(select 1 from pg_policy where polrelid='public.tsi225_availability_suspensions'::regclass
      and polname='tsi225_suspensions_read' and polcmd='r'
      and polroles=array[(select oid from pg_roles where rolname='authenticated')]
      and pg_get_expr(polqual,polrelid) like '%is_admin()%'
      and pg_get_expr(polqual,polrelid) like '%auth.uid()%'
      and pg_get_expr(polqual,polrelid) like '%user_id%') then
  raise exception 'TSI225: política de lectura distinta a admin o persona propia';
 end if;
 if exists(select 1 from pg_policy where polrelid='tsi225_private.receipts'::regclass) then
  raise exception 'TSI225: recibos privados con políticas inesperadas';
 end if;
 if has_table_privilege('anon','public.tsi225_availability_suspensions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or not has_table_privilege('authenticated','public.tsi225_availability_suspensions','SELECT')
    or has_table_privilege('authenticated','public.tsi225_availability_suspensions','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('anon','tsi225_private.receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('authenticated','tsi225_private.receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
  raise exception 'TSI225: permisos directos de tablas incorrectos';
 end if;
 if has_schema_privilege('anon','tsi225_private','USAGE')
    or has_schema_privilege('authenticated','tsi225_private','CREATE')
    or not has_schema_privilege('authenticated','tsi225_private','USAGE') then
  raise exception 'TSI225: privilegios del esquema privado incorrectos';
 end if;
 if (select count(*) from pg_constraint where conrelid='public.tsi225_availability_suspensions'::regclass
      and conname in ('tsi225_reason_not_blank','tsi225_release_reason_not_blank') and contype='c' and convalidated)<>2 then
  raise exception 'TSI225: faltan restricciones de justificación';
 end if;
 for signature in select unnest(array['public.tsi225_suspensions_person_dates','public.tsi225_suspensions_user_history','public.tsi225_suspensions_creator','public.tsi225_suspensions_releaser','tsi225_private.tsi225_receipts_actor','tsi225_private.tsi225_receipts_suspension']) loop
  if to_regclass(signature) is null or not exists(select 1 from pg_index where indexrelid=to_regclass(signature) and indisvalid) then
   raise exception 'TSI225: índice ausente o inválido: %',signature;
  end if;
 end loop;
 -- Exact source fingerprints for all fifteen migration-defined functions after hardening.
 for item in select * from (values
  ('tsi225_private.state()','c27069db8122e687ff716396e1effa5e'),
  ('tsi225_private.suspend(uuid,date,date,text,uuid)','8d3205c8f952245a6991b8799fbd01d3'),
  ('tsi225_private.release(uuid,text,uuid)','ffaf6a47dcee31d66dd9e36cfd253814'),
  ('public.tsi225_availability_suspensions_state()','a8d98b95223fc70e52a70193ace03ef0'),
  ('public.tsi225_suspend_availability(uuid,date,date,text,uuid)','913bfcd436a47dfc5202a66d4aac5f60'),
  ('public.tsi225_release_availability(uuid,text,uuid)','db8445a882941bd4d89e33cbbe9bbac7'),
  ('tsi225_private.is_suspended(uuid,date)','0bd0e32c417e41c315a8981aab240be0'),
  ('tsi225_private.person_suspensions(uuid)','c55cccfb928b6f482e693d80a21596ea'),
  ('tsi225_private.capacity_record(jsonb,uuid)','7429775546032c96f77a24991da6f790'),
  ('tsi225_private.photo_record(jsonb,uuid)','537f028aa12271f7d4173ff6080dac8a'),
  ('tsi225_private.guard_match_assignments()','d5a2bd3d94c052ebd0566b6ecae4702f'),
  ('public.tsi11_state(uuid)','286b2b85b77098a5ba1b9b3fcca44ace'),
  ('public.tsi11_photo_availability_state()','a74ca3c20fc544dcc45613ec9f172168'),
  ('public.tsi11_command(text,jsonb,uuid)','2be2782b7811acbb3917c7d7d49b0771'),
  ('public.auto_assign_editora()','b791c252f0177d0b31732c3f6ac7ad79')
 ) expected(signature,source_md5) loop
  oid_fn:=to_regprocedure(item.signature);
  if oid_fn is null then raise exception 'TSI225: función ausente: %',item.signature; end if;
  if not exists(select 1 from pg_proc where oid=oid_fn and md5(prosrc)=item.source_md5
     and proconfig=array['search_path=""']) then
   raise exception 'TSI225: código o search_path inesperado: %',item.signature;
  end if;
 end loop;
 for item in select p.oid,n.nspname,p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='tsi225_private' or (n.nspname='public' and p.proname like 'tsi225\_%' escape '\') loop
  allowed:=item.proname in ('state','suspend','release','tsi225_availability_suspensions_state','tsi225_suspend_availability','tsi225_release_availability');
  if has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE') is distinct from allowed then
   raise exception 'TSI225: EXECUTE incorrecto: %.%',item.nspname,item.proname;
  end if;
  if item.nspname='public' and item.prosecdef then raise exception 'TSI225: RPC pública SECURITY DEFINER'; end if;
 end loop;
 if has_function_privilege('anon','public.auto_assign_editora()','EXECUTE')
    or has_function_privilege('authenticated','public.auto_assign_editora()','EXECUTE')
    or has_function_privilege('anon','tsi210_private.backup_tables()','EXECUTE')
    or has_function_privilege('authenticated','tsi210_private.backup_tables()','EXECUTE') then
  raise exception 'TSI225: funciones internas ejecutables por cliente';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.matches'::regclass and tgname='tsi225_guard_match_assignments'
    and tgfoid='tsi225_private.guard_match_assignments()'::regprocedure and tgenabled='O'
    and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE OF data ON%') then
  raise exception 'TSI225: protección de nuevas asignaciones ausente';
 end if;
 if not 'tsi225_availability_suspensions'=any(tsi210_private.backup_tables()) then
  raise exception 'TSI225: historial de suspensiones fuera del respaldo operativo';
 end if;
end $verify$;
rollback;
select 'TSI225: código, RLS, permisos, motivos, índices, trigger y respaldo verificados en solo lectura' as result;
