begin;
do $$
declare token text:=repeat('e',64);r jsonb;q jsonb;bid uuid;tid uuid;a uuid;mid text;ok boolean;rid uuid:=gen_random_uuid();
begin
 select id into a from public.profiles where role='admin' limit 1;
 select id into mid from public.matches limit 1;
 r:=public.tsi231_support_command('register',jsonb_build_object('name','Prueba sin partido','phone','8112345678','consent',true,'request_id',gen_random_uuid()),token,null);
 tid:=(r->'thread'->>'id')::uuid;
 q:=jsonb_build_object('sport','flag','package','equipo','players',6,'team','Equipo sin partido','request_id',rid,'match_id','NO-EXISTE','event_date','2026-12-01','event_time','18:30','event_venue','Campo de prueba');
 r:=public.tsi231_support_command('quote',q,token,null);
 bid:=(r->'booking'->>'id')::uuid;
 if r->'booking'->>'event_date'<>'2026-12-01' or r->'booking'->>'event_time'<>'18:30:00' or r->'booking'->>'event_venue'<>'Campo de prueba' then raise exception 'Event details lost';end if;
 if r->'booking'->>'match_id' is not null or (r->'booking'->>'total')::numeric<>1200 or (r->'booking'->>'deposit')::numeric<>600 then raise exception 'Quote without match failed';end if;
 r:=public.tsi231_support_command('quote',q,token,null);
 if (select count(*) from public.tsi231_support_bookings where thread_id=tid)<>1 then raise exception 'Duplicate quote';end if;
 r:=public.tsi231_support_command('confirm',jsonb_build_object('booking_id',bid,'accept_terms',true,'request_id',gen_random_uuid()),token,null);
 if r->'booking'->>'status'<>'Confirmada' or r->'booking'->>'match_id' is not null then raise exception 'Confirm without match failed';end if;
 r:=public.tsi231_support_payment('prepare','{}',token);
 if (r->'payment'->>'amount_cents')::integer<>60000 then raise exception 'Payment without match failed';end if;
 r:=public.tsi231_support_command('staff-booking',jsonb_build_object('thread_id',tid,'match_id',mid,'request_id',gen_random_uuid()),null,a);
 if r->'booking'->>'match_id' is distinct from mid then raise exception 'Staff relation failed';end if;
 ok:=false;begin perform public.tsi231_support_command('staff-booking',jsonb_build_object('thread_id',tid,'match_id','INVALID','request_id',gen_random_uuid()),null,a);exception when others then ok:=true;end;if not ok then raise exception 'Invalid relation accepted';end if;
 ok:=false;begin perform public.tsi231_support_command('staff-slots',jsonb_build_object('thread_id',tid),token,null);exception when others then ok:=true;end;if not ok then raise exception 'Visitor accessed staff relation';end if;
 r:=public.tsi231_support_command('staff-slots',jsonb_build_object('thread_id',tid),null,a);
 if jsonb_typeof(r->'slots')<>'array' then raise exception 'Staff catalog unavailable';end if;
 r:=public.tsi231_support_command('staff-booking',jsonb_build_object('thread_id',tid,'match_id','','request_id',gen_random_uuid()),null,a);
 if r->'booking'->>'match_id' is not null then raise exception 'Clearing relation failed';end if;
end $$;
rollback;