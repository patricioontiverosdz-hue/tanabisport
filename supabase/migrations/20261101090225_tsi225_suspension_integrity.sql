-- TSI 2.2.5 staging follow-up: reject whitespace-only justifications and index FKs.
begin;
create index tsi225_suspensions_user_history on public.tsi225_availability_suspensions(user_id,created_at desc);
create index tsi225_suspensions_creator on public.tsi225_availability_suspensions(created_by);
create index tsi225_suspensions_releaser on public.tsi225_availability_suspensions(released_by);
create index tsi225_receipts_actor on tsi225_private.receipts(actor_id);
create index tsi225_receipts_suspension on tsi225_private.receipts(suspension_id);
alter table public.tsi225_availability_suspensions
 add constraint tsi225_reason_not_blank check(reason ~ '[^[:space:]]'),
 add constraint tsi225_release_reason_not_blank check(release_reason is null or release_reason ~ '[^[:space:]]');

-- Keep the already reviewed definitions unchanged apart from note normalization.
-- Assert one expected source occurrence per function to fail safely on schema drift.
do $hardening$
declare
 signature text; definition text;
 needle constant text:=$needle$btrim(coalesce(p_reason,''))$needle$;
 replacement constant text:=$replacement$regexp_replace(coalesce(p_reason,''),'^[[:space:]]+|[[:space:]]+$','','g')$replacement$;
begin
 foreach signature in array array['tsi225_private.suspend(uuid,date,date,text,uuid)','tsi225_private.release(uuid,text,uuid)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
   raise exception 'Unexpected suspension function definition: %',signature;
  end if;
  execute replace(definition,needle,replacement);
 end loop;
end $hardening$;
-- The trigger is invoked by PostgreSQL; clients never call this function.
revoke all on function public.auto_assign_editora() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
