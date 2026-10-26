select
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='tsi210_teams' and column_name='season' and data_type='text' and is_nullable='NO') as season_column,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='tsi210_teams' and column_name='season_year' and data_type='integer') as season_year_column,
 exists(select 1 from pg_constraint where conrelid='public.tsi210_teams'::regclass and conname='tsi210_teams_season_year_integrity') as season_constraint,
 (select md5(prosrc)='743bf335546ffffe0a21b58aa35fa868' from pg_proc where oid='tsi210_private.command(text,jsonb,uuid)'::regprocedure) as command_matches_compatible_release,
 exists(select 1 from pg_policies where schemaname='public' and tablename='tsi210_teams' and policyname='tsi222_team_editor_read' and cmd='SELECT') as editor_read_policy,
 (select relrowsecurity from pg_class where oid='public.tsi210_teams'::regclass) as rls_enabled,
 not has_table_privilege('authenticated','public.tsi210_teams','INSERT,UPDATE,DELETE') as authenticated_has_no_direct_writes;

