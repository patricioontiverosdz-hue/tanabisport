-- Read only. Feed the returned array to prepare-legacy-portfolio.mjs via an ignored file.
select id,data from public.portfolio order by id;
