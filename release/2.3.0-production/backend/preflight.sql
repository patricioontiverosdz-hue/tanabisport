-- READ ONLY; retain results in ignored test-results/prod230-launch, never in Git.
select jsonb_build_object(
 'migrations',(select jsonb_agg(jsonb_build_object('name',name,'version',version) order by version) from supabase_migrations.schema_migrations),
 'counts',jsonb_build_object('profiles',(select count(*) from public.profiles),'matches',(select count(*) from public.matches),'pays',(select count(*) from public.pays),'orders',(select count(*) from public.orders),'legacy_portfolio',(select count(*) from public.portfolio),'shop_items',(select count(*) from public.shop_items)),
 'legacy_permissions',(select jsonb_object_agg(r,jsonb_build_object('select',has_table_privilege(r,'public.portfolio','select'),'insert',has_table_privilege(r,'public.portfolio','insert'),'update',has_table_privilege(r,'public.portfolio','update'),'delete',has_table_privilege(r,'public.portfolio','delete'),'truncate',has_table_privilege(r,'public.portfolio','truncate'),'references',has_table_privilege(r,'public.portfolio','references'),'trigger',has_table_privilege(r,'public.portfolio','trigger'))) from unnest(array['anon','authenticated']) r),
 'legacy_public_grants',(select coalesce(jsonb_agg(a.privilege_type),'[]') from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.portfolio'::regclass and a.grantee=0),
 'legacy_bucket_public',(select public from storage.buckets where id='portafolio'),
 'legacy_close_policy_exists',exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tsi230_portfolio_storage_closed'),
 'extensions',(select jsonb_agg(extname) from pg_extension),
 'cron_alter_job',to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is not null,
 'backup_registry',tsi210_private.backup_tables()
) as preflight;
