const fs=require('node:fs'),path=require('node:path');
async function main(){
 if(!process.env.TSI230_PGLITE_MODULE)throw Error('Indica TSI230_PGLITE_MODULE con una instalación local de @electric-sql/pglite. Este test nunca usa una base remota.');
 const {PGlite}=require(process.env.TSI230_PGLITE_MODULE),db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.profiles(id uuid primary key,name text,role text);create function public.my_role() returns text language sql stable as $$select role from public.profiles where id=auth.uid()$$;create table public.matches(id text primary key,data jsonb);create table public.pays(id text primary key,owner text,data jsonb);create table public.photographer_availability(photographer_id uuid,week_start date,version int,schedule jsonb);create table public.editor_time_sessions(id uuid default gen_random_uuid(),editor_id uuid,match_id text,kind text,status text,active_seconds numeric);create table public.tsi225_availability_suspensions(user_id uuid,start_date date,end_date date,released_at timestamptz);create schema tsi225_private;create function tsi225_private.is_suspended(p_user_id uuid,p_date date) returns boolean language sql stable security definer as $$select exists(select 1 from public.tsi225_availability_suspensions where user_id=p_user_id and start_date<=p_date and end_date>=p_date and released_at is null)$$;grant usage on schema public,auth to authenticated;grant select on public.profiles to authenticated;grant select,insert,update on public.matches,public.pays to authenticated;");
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261107024910_tsi230_access_payroll_rules.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'rules-230-database.sql'),'utf8'));
  console.log('rules230 PostgreSQL: semana/última versión/horarios/suspensiones, original pausado positivo, sesión activa/corrección/cero rechazados, evidencia y pagos aprobados existentes OK');
 }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
