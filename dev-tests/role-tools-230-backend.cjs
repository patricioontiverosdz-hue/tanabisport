const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),migration='20261108034808_tsi230_role_tools.sql';
const ID={admin:'23000000-0000-4000-8000-000000000001',admin2:'23000000-0000-4000-8000-000000000002',foto:'23000000-0000-4000-8000-000000000003',editora:'23000000-0000-4000-8000-000000000004',pending:'23000000-0000-4000-8000-000000000005'};
const rid=n=>'23000000-0000-4000-8000-'+String(n).padStart(12,'0');
const CATALOG={foto:['resumen','disponibilidad','partidos','micalendario','cobertura','comentarios','mipago','gastos','prestamos','avisos','notif','calendario','ubicaciones','cotizador','clientes','entregas','pendientes','borradores','fotojuego','edicionjuego','rankingjuegos','proceso','atencion'],editora:['resumen','intelligence','disponibilidadedicion','proceso','tienda','comentarios','mipago','gastos','prestamos','avisos','notif','calendario','clientes','entregas','pendientes','borradores','fotojuego','edicionjuego','rankingjuegos','portafolio','atencion']};
async function edge(){
 const {createHandler,validateSave,PROJECT,ORIGIN}=await import(pathToFileURL(path.join(root,'supabase/functions/tsi-role-tools/handler.mjs')));
 const valid={role:'foto',enabled:['resumen'],expected_version:1,request_id:rid(10)};
 assert.deepEqual(validateSave(valid),valid);
 for(const p of [{...valid,role:'admin'},{...valid,enabled:[]},{...valid,enabled:['resumen','resumen']},{...valid,expected_version:0},{...valid,request_id:'x'},{...valid,actor:ID.admin}])assert.throws(()=>validateSave(p));
 const env={SUPABASE_URL:'https://'+PROJECT+'.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-service-key-for-tests-only'};
 let role='admin',calls=[],authStatus=200,anonymous=false,dbError=null;
 const handler=createHandler({env:k=>env[k],fetch:async(url,init)=>{
  const u=new URL(url);assert.equal(u.origin,env.SUPABASE_URL);calls.push({url,init});
  if(u.pathname==='/auth/v1/user'){assert.equal(init.headers.Authorization,'Bearer session');return Response.json({id:ID.admin,is_anonymous:anonymous},{status:authStatus});}
  assert.equal(init.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
  if(u.pathname==='/rest/v1/profiles')return Response.json([{id:ID.admin,role}]);
  assert.equal(u.pathname,'/rest/v1/rpc/tsi230_role_tools_command');const p=JSON.parse(init.body);assert.equal(p.actor_id,ID.admin);assert.ok(!Object.hasOwn(p.payload,'actor_id'));
  return dbError?Response.json({message:dbError},{status:400}):Response.json({catalog_version:1,actor_role:role,roles:{foto:{version:2,enabled:['resumen']}}});
 }});
 const call=(route,p={},extra={})=>handler(new Request(env.SUPABASE_URL+'/functions/v1/tsi-role-tools/'+route,{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer session','content-type':'application/json',...extra},body:JSON.stringify(p)}));
 assert.equal((await call('config')).status,200);assert.equal((await call('save',valid)).status,200);
 assert.equal((await call('config',{role:'editora'})).status,400);
 for(const staff of ['foto','editora']){role=staff;assert.equal((await call('config')).status,200);calls=[];assert.equal((await call('save',valid)).status,403);assert.ok(!calls.some(c=>c.url.includes('/rpc/')));}
 role='pending';assert.equal((await call('config')).status,403);role='admin';
 for(const [code,status] of [['ROLE_TOOLS_CONFLICT',409],['ROLE_TOOLS_FORBIDDEN',403],['ROLE_TOOLS_INVALID',400]]){dbError=code;const r=await call('save',valid);assert.equal(r.status,status);assert.equal((await r.json()).code,code);}dbError=null;
 authStatus=401;assert.equal((await call('config')).status,401);authStatus=200;anonymous=true;assert.equal((await call('config')).status,403);anonymous=false;
 assert.equal((await call('config',{}, {authorization:''})).status,401);assert.equal((await call('config',{}, {origin:'https://example.invalid'})).status,403);
 assert.equal((await call('save',{...valid,actor_id:ID.admin2})).status,400);assert.equal((await call('config',{oversize:'x'.repeat(8200)})).status,413);
 let contacted=false;const blocked=createHandler({env:k=>k==='SUPABASE_URL'?'https://tantlgswituiwkxfgmsr.supabase.co':env[k],fetch:()=>{contacted=true;throw Error();}});
 assert.equal((await blocked(new Request(env.SUPABASE_URL+'/functions/v1/tsi-role-tools/config',{method:'POST',headers:{authorization:'Bearer session','content-type':'application/json'},body:'{}'}))).status,503);assert.equal(contacted,false);
 console.log('role-tools230 Edge PASS: JWT, fresh profile, own actor, no staff save, bounded exact payload, conflict and production isolation');
}
async function database(){
 if(!process.env.TSI230_PGLITE_MODULE)throw Error('Set TSI230_PGLITE_MODULE to run the required real PostgreSQL checks.');
 const {PGlite}=require(process.env.TSI230_PGLITE_MODULE),db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table public.profiles(id uuid primary key,name text,role text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant select,update on public.profiles to service_role;");
  for(const [role,id] of Object.entries(ID))await db.query('insert into public.profiles values($1,$2,$3)',[id,role,role==='admin2'?'admin':role]);
  await db.exec(fs.readFileSync(path.join(root,'docs/staging-game-ranking.sql'),'utf8'));
  await db.exec("create table public.matches(id text primary key,data jsonb);insert into public.matches values('shared-match','{\"existing\":true}');grant select on public.matches to authenticated;");
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
  const as=async(role,uid='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role '+role);};
  const command=async(actor,op='config',payload={})=>(await db.query('select public.tsi230_role_tools_command($1,$2,$3::jsonb) value',[actor,op,JSON.stringify(payload)])).rows[0].value;
  const reject=async(fn,code,message)=>{await assert.rejects(fn,e=>{assert.equal(e.code,code);if(message)assert.ok(e.message.includes(message),e.message);return true;});};
  const save=(role,enabled,version,request=10)=>({role,enabled,expected_version:version,request_id:rid(request)});
  await as('service_role');const initial=await command(ID.admin);assert.equal(initial.catalog_version,1);for(const role of ['foto','editora']){assert.deepEqual(initial.roles[role].enabled,CATALOG[role]);assert.equal(initial.roles[role].version,1);}
  for(const role of ['foto','editora'])assert.deepEqual(Object.keys((await command(ID[role])).roles),[role]);
  await reject(()=>command(ID.pending),'42501');await reject(()=>command(ID.foto,'save',save('foto',['resumen'],1)),'42501');await reject(()=>command(ID.editora,'save',save('editora',['resumen'],1)),'42501');
  for(const [role,tool] of [['foto','rentabilidad'],['foto','equipo'],['foto','pagos'],['foto','datos'],['foto','ajustes'],['foto','intelligence'],['editora','cotizador'],['editora','rentabilidad'],['editora','registro'],['editora','recuperacion']])await reject(()=>command(ID.admin,'save',save(role,['resumen',tool],1)),'22023');
  for(const payload of [save('admin',['resumen'],1),save('foto',[],1),save('foto',['resumen','resumen'],1),{...save('foto',['resumen'],1),actor_id:ID.admin2},save('foto',['resumen'],0)])await reject(()=>command(ID.admin,'save',payload),'22023');
  const first=await command(ID.admin,'save',save('foto',['resumen'],1));assert.equal(first.roles.foto.version,2);assert.deepEqual(first.roles.foto.enabled,['resumen']);
  assert.deepEqual(await command(ID.admin,'save',save('foto',['resumen'],1)),first,'same retry returns stable receipt');
  await reject(()=>command(ID.admin2,'save',save('foto',CATALOG.foto,1,11)),'40001','ROLE_TOOLS_CONFLICT');
  await reject(()=>command(ID.admin,'save',save('editora',['resumen'],1,10)),'40001','ROLE_TOOLS_CONFLICT');
  await reject(()=>command(ID.admin,'save',save('foto',['resumen','partidos'],1,10)),'40001','ROLE_TOOLS_CONFLICT');
  const game=actor=>db.query("select public.tsi_game_save_result($1,'camera','daylight-action',70,true,'{}')",[actor]);
  await reject(()=>game(ID.foto),'42501','ROLE_TOOLS_DISABLED');await game(ID.editora);await game(ID.admin);
  await as('authenticated',ID.foto);assert.equal((await db.query("select public.tsi230_tool_enabled('fotojuego') value")).rows[0].value,false);
  assert.equal((await db.query("select public.tsi230_assert_tool_enabled('resumen') value")).rows[0].value,true);
  await reject(()=>db.query("select public.tsi230_assert_tool_enabled('fotojuego')"),'42501','ROLE_TOOLS_DISABLED');
  await reject(()=>db.query("select public.tsi_game_rankings('all')"),'42501','ROLE_TOOLS_DISABLED');
  await reject(()=>db.query("select tsi_training.rankings('all')"),'42501','ROLE_TOOLS_DISABLED');
  await reject(()=>db.query("select tsi_training.rankings_before_role_tools('all')"),'42501');
  await reject(()=>command(ID.admin),'42501');await reject(()=>db.query('select * from tsi230_role_tools_private.config'),'42501');await reject(()=>db.query("update tsi230_role_tools_private.config set enabled=array['resumen']"),'42501');
  assert.deepEqual((await db.query('select data from public.matches')).rows[0].data,{existing:true},'shared data remains available to enabled features');
  await as('authenticated',ID.editora);assert.equal((await db.query("select public.tsi230_tool_enabled('fotojuego') value")).rows[0].value,true);await db.query("select public.tsi_game_rankings('all')");
  await as('authenticated');assert.equal((await db.query("select public.tsi230_tool_enabled('resumen') value")).rows[0].value,false);
  await as('anon');await reject(()=>db.query("select public.tsi230_tool_enabled('resumen')"),'42501');await reject(()=>command(ID.admin),'42501');
  await as('service_role');const restored=await command(ID.admin2,'save',save('foto',CATALOG.foto,2,12));assert.equal(restored.roles.foto.version,3);
  assert.deepEqual(await command(ID.admin,'save',save('foto',['resumen'],1)),first);assert.equal((await command(ID.admin)).roles.foto.version,3,'old retry never overwrites newer config');
  await db.exec('reset role');await db.query("update public.profiles set role='foto' where id=$1",[ID.admin]);
  await as('service_role');await reject(()=>command(ID.admin,'save',save('foto',['resumen'],3,13)),'42501','ROLE_TOOLS_FORBIDDEN');
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.profiles')).rows[0].n,5);assert.equal((await db.query('select role from public.profiles where id=$1',[ID.editora])).rows[0].role,'editora');
  const policies=(await db.query("select relrowsecurity from pg_class where oid='tsi230_role_tools_private.config'::regclass")).rows[0];assert.equal(policies.relrowsecurity,true);
  await db.exec('grant select on tsi230_role_tools_private.config to authenticated');await as('authenticated',ID.editora);assert.equal((await db.query('select count(*)::int n from tsi230_role_tools_private.config')).rows[0].n,0,'RLS denies rows even if a read grant is accidentally added later');
  console.log('role-tools230 PostgreSQL PASS: exact defaults, private RLS/grants, all roles, capability ceiling, own read, fresh demotion, optimistic versions, stable replay and disabled game/ranking server denial');
 }finally{await db.close();}
}
edge().then(database).catch(e=>{console.error(e);process.exitCode=1;});
