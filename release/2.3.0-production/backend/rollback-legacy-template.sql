-- TEMPLATE ONLY. Do not execute with markers or before comparing captured preflight.
-- Reverse only the legacy exposure cut; never truncate/drop operational or new data.
begin;
drop policy if exists tsi230_portfolio_storage_closed on storage.objects;
-- Replace with the exact legacy_bucket_public boolean captured immediately before 013:
update storage.buckets set public=__CAPTURED_BUCKET_PUBLIC__ where id='portafolio';
revoke all on public.portfolio from public,anon,authenticated;
-- Replace this marker with GRANT statements built only from captured legacy permissions:
__CAPTURED_LEGACY_GRANTS__
commit;
