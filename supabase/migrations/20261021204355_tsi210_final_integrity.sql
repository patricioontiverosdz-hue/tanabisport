begin;
create index if not exists tsi210_delivery_sender on public.tsi210_deliveries(sent_by);
create index if not exists tsi210_delivery_confirmer on public.tsi210_deliveries(confirmed_by);
create index if not exists tsi210_delivery_resolver on public.tsi210_deliveries(resolved_by);
create index if not exists tsi210_team_matches_actor on public.tsi210_team_matches(actor_id);
create or replace function public.tsi210_state() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(public.my_role(),'') not in ('admin','foto','editora') then raise exception 'Sin permiso' using errcode='42501'; end if;
 return jsonb_build_object('version','2.1.0','server_now',now(),
 'teams',(select coalesce(jsonb_agg(t order by t.team_name),'[]') from public.tsi210_teams t),
 'team_matches',(select coalesce(jsonb_agg(t),'[]') from public.tsi210_team_matches t),
 'rates',(select coalesce(jsonb_agg(t order by t.sport,t.package_name),'[]') from public.tsi210_rate_cards t),
 'quotes',(select coalesce(jsonb_agg(t order by t.created_at desc),'[]') from public.tsi210_quotes t),
 'quote_costs',(select coalesce(jsonb_agg(t),'[]') from public.tsi210_quote_costs t),
 'costs',(select coalesce(jsonb_agg(t),'[]') from public.tsi210_match_costs t),
 'deliveries',(select coalesce(jsonb_agg(t),'[]') from public.tsi210_deliveries t),
 'audit',(select coalesce(jsonb_agg(t),'[]') from (select * from public.tsi210_audit_log order by happened_at desc limit 100) t));
end $$;

commit;
