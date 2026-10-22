-- Restauración de columnas generadas por el servidor, incluidos adjuntos.
begin;
create or replace function tsi210_private.verify_restore(snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t text; rows jsonb; restored jsonb; result jsonb:='[]'; n bigint; temp_name text; columns_sql text; begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración verifica respaldos' using errcode='42501'; end if;
 if snapshot->>'format'<>'tsi-operational-backup' or snapshot->>'schema_version'<>'1' or jsonb_typeof(snapshot->'tables')<>'object' or octet_length(snapshot::text)>52428800 then raise exception 'Respaldo no compatible o demasiado grande para la verificación interactiva'; end if;
 foreach t in array tsi210_private.backup_tables() loop
  rows:=snapshot->'tables'->t;
  if rows is null or jsonb_typeof(rows)<>'array' then raise exception 'El respaldo no contiene la tabla %',t; end if;
  temp_name:='tsi210_restore_'||t;
  execute format('drop table if exists pg_temp.%I',temp_name);
  execute format('create temporary table %I (like public.%I including generated) on commit drop',temp_name,t);
  select string_agg(quote_ident(attname),',' order by attnum) into columns_sql
   from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped and attgenerated='';
  execute format('insert into pg_temp.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1)',temp_name,columns_sql,columns_sql,t) using rows;
  execute format('select count(*),coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from pg_temp.%I r',temp_name) into n,restored;
  select coalesce(jsonb_agg(v order by v::text),'[]') into rows from jsonb_array_elements(rows) v;
  if restored<>rows then raise exception 'La tabla % no se restauró de forma idéntica',t; end if;
  result:=result||jsonb_build_array(jsonb_build_object('table',t,'rows',n,'verified',true));
 end loop;
 return jsonb_build_object('verified',true,'mode','temporary_tables','tables',result,'live_data_modified',false);
end $$;

commit;
