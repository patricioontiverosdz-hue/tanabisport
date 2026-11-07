// In-memory PostgreSQL only. No URL, credentials, network, or remote database.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function main(){
 if(!process.env.TSI230_PGLITE_MODULE)throw Error('Indica TSI230_PGLITE_MODULE con una instalación local de @electric-sql/pglite. Nunca se usa una base remota.');
 const {PGlite}=require(process.env.TSI230_PGLITE_MODULE),db=new PGlite();
 let stage='local bootstrap';
 try{
  // Only pre-2.2.4 infrastructure and cron scheduling are modeled. All shop,
  // source-image, store, guest, binding, and manual-order functions are REAL.
  await db.exec(`
   create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create schema tsi210_private;create schema cron;create schema storage;
   create table public.portfolio(id text primary key,data jsonb);
   grant select on public.portfolio to anon,authenticated;
   create table storage.buckets(id text primary key,public boolean);
   insert into storage.buckets values('portafolio',true);
   create table storage.objects(id uuid,bucket_id text);
   alter table storage.objects enable row level security;
   grant usage on schema public,auth to anon,authenticated,service_role;
   alter default privileges in schema public grant all on tables to service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.profiles(id uuid primary key,email text,name text,role text);
   grant select on public.profiles to authenticated,service_role;
   create function public.my_role() returns text language sql stable as $$select p.role from public.profiles p where p.id=auth.uid()$$;
   create table public.settings(id text primary key,data jsonb not null default '{}');
   insert into public.settings values('cfg','{"shop":true}');
   grant select on public.settings to anon,authenticated,service_role;
   create table public.shop_items(id text primary key,data jsonb not null);
   alter table public.shop_items enable row level security;
   grant select on public.shop_items to anon,authenticated;
   grant insert,update,delete on public.shop_items to authenticated;
   create policy legacy_shop_read on public.shop_items for select to anon,authenticated using(true);
   create policy legacy_shop_admin on public.shop_items for all to authenticated using(public.my_role()='admin') with check(public.my_role()='admin');
   create table public.orders(id text primary key,data jsonb not null);
   alter table public.orders enable row level security;
   grant insert on public.orders to anon,authenticated;
   grant select,update,delete on public.orders to authenticated;
   create policy legacy_orders_insert on public.orders for insert to anon,authenticated with check(true);
   create policy legacy_orders_admin on public.orders for all to authenticated using(public.my_role()='admin') with check(public.my_role()='admin');
   create function tsi210_private.backup_tables() returns text[] language sql immutable as $$select array['profiles','settings','shop_items','orders']::text[]$$;
   create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text);
   create function cron.schedule(jobname text,schedule text,command text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
  `);
  for(const filename of [
   '20261026222548_tsi224_shop_preview.sql',
   '20261028033805_tsi224_store.sql',
   '20261028194754_tsi224_store_customer_lookup.sql',
   '20261107024942_tsi230_guest_access.sql',
   '20261107025824_tsi230_store_guest_binding.sql',
   '20261107031851_tsi230_private_portfolio_consent.sql',
   '20261107162044_tsi230_portfolio_edit_homepage.sql'
  ]){stage=filename;await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',filename),'utf8'));}
  for(const filename of ['guest230-backend.sql','guest230-store-backend.sql','guest230-admin-backend.sql','portfolio230-database.sql','portfolio230-edit-database.sql']){
   stage=filename;await db.exec(fs.readFileSync(path.join(__dirname,filename),'utf8'));console.log('PASS PostgreSQL '+filename);
  }
  stage='post-rollback isolation';
  const leak=await db.query("select (select count(*) from public.tsi230_guest_contacts) contacts,(select count(*) from public.tsi230_guest_sessions) sessions,(select count(*) from public.shop_items) photos,(select count(*) from public.orders) manual_orders,(select count(*) from public.tsi224_store_orders) stripe_orders,(select count(*) from public.tsi230_portfolio) portfolio,(select count(*) from public.tsi230_portfolio_receipts) portfolio_receipts,(select count(*) from public.tsi230_portfolio_commands) portfolio_commands,(select count(*) from public.tsi230_homepage) homepage");
  for(const [name,count]of Object.entries(leak.rows[0]))if(Number(count)!==0)throw Error('Fixture rollback leaked '+name);
  const schedule=await db.query("select count(*) jobs from cron.job where jobname='tsi230-guest-retention' and command='select public.tsi230_guest_purge();'");
  if(Number(schedule.rows[0].jobs)!==1)throw Error('Retention job was not registered');
  const portfolioSchedule=await db.query("select count(*) jobs from cron.job where jobname='tsi230-portfolio-retention' and command='select public.tsi230_portfolio_purge();'");
  if(Number(portfolioSchedule.rows[0].jobs)!==1)throw Error('Portfolio retention job was not registered');
  console.log('PASS guest230 PostgreSQL real migrations: scope, OTP, hashes/attempts, expiry, ACLs, atomic order binding, quote/prepare/contact/status, paid original recovery, manual Stripe-off/idempotency, rollback.');
  console.log('Modeled locally: pre-2.2.4 base tables/RLS, auth.uid/my_role claims context, backup registry, cron.schedule registration. Not exercised: real Auth JWT validation, cron worker timing, deployed PostgREST/Edge/CORS, email transport, Stripe signatures/network, concurrent workers.');
 }catch(error){console.error('Failed stage:',stage);throw error;}finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
