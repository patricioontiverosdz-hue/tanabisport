// Synthetic local PostgreSQL only. Never opens a production connection.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),pack=path.join(root,'release/2.3.0-production/backend');
async function main(){
 if(!process.env.TSI230_PGLITE_MODULE)throw Error('TSI230_PGLITE_MODULE is required for production SQL verification.');
 const {PGlite}=require(process.env.TSI230_PGLITE_MODULE),db=new PGlite();let step='bootstrap';
 try{
  // Reuse the established pre-224 fixture, not a model of the new migrations.
  const source=fs.readFileSync(path.join(__dirname,'guest230-postgres.cjs'),'utf8'),bootstrap=source.match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  await db.exec(bootstrap);
  await db.exec(`create table auth.users(id uuid primary key);
   create schema tsi225_private;
   create table public.matches(id text primary key,data jsonb);
   create table public.pays(id text primary key,owner text,data jsonb);
   create table public.photographer_availability(photographer_id uuid,week_start date,version int,schedule jsonb);
   create table public.editor_time_sessions(id uuid default gen_random_uuid(),editor_id uuid,match_id text,kind text,status text,active_seconds numeric);
   create table public.tsi225_availability_suspensions(user_id uuid,start_date date,end_date date,released_at timestamptz);
   create function tsi225_private.is_suspended(p_user_id uuid,p_date date) returns boolean language sql stable security definer as $$select exists(select 1 from public.tsi225_availability_suspensions where user_id=p_user_id and start_date<=p_date and end_date>=p_date and released_at is null)$$;
   grant select,insert,update on public.matches,public.pays to authenticated;
   create table public.original_registry_sentinel(id int primary key,data jsonb);insert into public.original_registry_sentinel values(1,'{"preserve":true}');
   create or replace function tsi210_private.backup_tables() returns text[] language sql immutable as $$select array['profiles','settings','shop_items','orders','tsi225_availability_suspensions','original_registry_sentinel']::text[]$$;
   alter table cron.job add column active boolean not null default true;
   create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null) returns void language sql as $$update cron.job set active=$6 where jobid=$1$$;
   insert into public.portfolio values('preserved-legacy','{"title":"Existing legacy photograph"}');`);
  await db.exec(fs.readFileSync(path.join(root,'docs/production-game-ranking.sql'),'utf8'));
  const plan=JSON.parse(fs.readFileSync(path.join(pack,'manifest.json')));
  assert.equal(plan.ordered_sql.length,12);assert.equal(plan.post_frontend_sql.length,1);
  for(const item of plan.ordered_sql){step=item.file;await db.exec(fs.readFileSync(path.join(pack,item.file),'utf8'));}
  step='preservation and restrictive defaults';
  assert.equal((await db.query("select public from storage.buckets where id='portafolio'")).rows[0].public,true,'Old images stay available before frontend cutover');
  assert.equal((await db.query("select has_table_privilege('anon','public.portfolio','select') value")).rows[0].value,true);
  assert.deepEqual((await db.query('select data from public.original_registry_sentinel')).rows[0].data,{preserve:true});
  const backup=(await db.query('select tsi210_private.backup_tables() value')).rows[0].value;
  for(const table of ['original_registry_sentinel','tsi225_availability_suspensions','tsi224_store_orders'])assert.ok(backup.includes(table),'Backup registry retained '+table);
  const cfg=(await db.query("select payments_enabled from public.tsi224_store_config where id='shop'")).rows[0];assert.equal(cfg.payments_enabled,false);
  const jobs=(await db.query("select jobname,active from cron.job where jobname like 'tsi230-%-retention'")).rows;
  assert.equal(jobs.find(j=>j.jobname==='tsi230-portfolio-retention').active,false);assert.equal(jobs.find(j=>j.jobname==='tsi230-guest-retention').active,true);
  for(const name of ['guest230-backend.sql','guest230-store-backend.sql','guest230-admin-backend.sql','rules-230-database.sql']){
   step=name;let sql=fs.readFileSync(path.join(__dirname,name),'utf8').replaceAll('test_mode','manual_code').replaceAll('test_invitation_id','manual_invitation_id');await db.exec(sql);
  }
  step='post-frontend cleanup blocks incomplete import';
  const cleanup=fs.readFileSync(path.join(pack,plan.post_frontend_sql[0].file),'utf8');await assert.rejects(()=>db.exec(cleanup),/not fully verified/);await db.exec('rollback');
  assert.equal((await db.query("select public from storage.buckets where id='portafolio'")).rows[0].public,true);
  step='trusted legacy import, large legacy-only bound and stable retries';
  const bytes=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(420000)]),image='data:image/jpeg;base64,'+bytes.toString('base64'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const importSQL='select public.tsi230_import_legacy_portfolio($1,$2,$3,$4) value',args=['preserved-legacy',image,hash,hash];
  await db.exec('set role service_role');const first=(await db.query(importSQL,args)).rows[0].value;assert.equal(first.imported,true);assert.equal(first.reused,false);
  const retry=(await db.query(importSQL,args)).rows[0].value;assert.equal(retry.photo_id,first.photo_id);assert.equal(retry.reused,true);
  await assert.rejects(()=>db.query(importSQL,['preserved-legacy',image,'0'.repeat(64),hash]),/mismatch/);
  await db.exec('reset role');const photo=(await db.query('select created_by,legacy_imported,image,expires_at from public.tsi230_portfolio where id=$1',[first.photo_id])).rows[0];
  assert.equal(photo.created_by,null);assert.equal(photo.legacy_imported,true);assert.equal(photo.image,image);assert.equal(photo.expires_at,null);
  await assert.rejects(()=>db.query('update public.tsi230_portfolio set legacy_imported=false where id=$1',[first.photo_id]),e=>e.code==='23514');
  await db.exec('set role authenticated');await assert.rejects(()=>db.query(importSQL,args),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from tsi230_release_private.portfolio_imports'),e=>e.code==='42501');await db.exec('reset role');
  step='fresh role ceilings and disabled dedicated server operations';
  const admin='23000000-0000-4000-8000-000000000091',foto='23000000-0000-4000-8000-000000000092';
  await db.query("insert into public.profiles(id,name,role) values($1,'Admin fixture','admin'),($2,'Photo fixture','foto')",[admin,foto]);
  await db.exec('set role service_role');const roles=(await db.query("select public.tsi230_role_tools_command($1,'config','{}') value",[admin])).rows[0].value;assert.equal(roles.roles.foto.enabled.length,23);assert.equal(roles.roles.editora.enabled.length,21);
  await db.query("select public.tsi230_role_tools_command($1,'save',$2::jsonb)",[admin,JSON.stringify({role:'foto',enabled:['resumen'],expected_version:1,request_id:crypto.randomUUID()})]);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[foto]);await db.exec('set role authenticated');
  assert.equal((await db.query("select public.tsi230_tool_enabled('resumen') value")).rows[0].value,true);await assert.rejects(()=>db.query("select public.tsi230_assert_tool_enabled('atencion')"),/ROLE_TOOLS_DISABLED/);await assert.rejects(()=>db.query("select public.tsi_game_rankings('all')"),/ROLE_TOOLS_DISABLED/);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");
  step='verified cutover and revoked source compatibility';await db.exec(cleanup);
  assert.equal((await db.query("select public from storage.buckets where id='portafolio'")).rows[0].public,false);assert.equal((await db.query("select has_table_privilege('anon','public.portfolio','select') value")).rows[0].value,false);
  assert.equal((await db.query('select count(*)::int n from public.tsi230_portfolio')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from public.portfolio')).rows[0].n,1,'Historical rows are preserved');
  assert.equal((await db.query("select data->>'preserve' value from public.original_registry_sentinel")).rows[0].value,'true');
  console.log('PASS production PostgreSQL: all 12 prepared migrations, original backup registry, manual access/orders, expiry/payroll rules, role ceilings, source preservation, bounded legacy import/retry, partial-cutover gate and final cleanup.');
 }catch(error){console.error('Production PostgreSQL failed at '+step);throw error;}finally{await db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
