-- LAST STEP ONLY: run after HTTP confirms the new production frontend and all imported photos.
-- Capture legacy ACL/bucket state outside Git before running; use rollback template if reverting frontend.
begin;
do $$ begin
 if exists(select 1 from public.portfolio old left join tsi230_release_private.portfolio_imports i on i.legacy_id=old.id
  left join public.tsi230_portfolio p on p.id=i.photo_id where i.legacy_id is null or p.id is null
  or p.title is distinct from old.data->>'title'
  or encode(sha256(decode(split_part(p.image,',',2),'base64')),'hex') is distinct from i.image_sha256) then
  raise exception 'Legacy portfolio import is not fully verified; preserve the old public portfolio' using errcode='23514'; end if;
end $$;
revoke all on public.portfolio from public,anon,authenticated;
update storage.buckets set public=false where id='portafolio';
create policy tsi230_portfolio_storage_closed on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'portafolio') with check(bucket_id<>'portafolio');
commit;
