const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
async function main(){
 const {createHandler,validateGuestItems,sha256}=await import('../supabase/functions/tsi-guest-access/handler.mjs');
 const origin='https://patricioontiverosdz-hue.github.io',invitation='a'.repeat(64),token='b'.repeat(64),actor='10000000-0000-4000-8000-000000000001',invitationId='20000000-0000-4000-8000-000000000001';
 const env={SUPABASE_URL:'https://nksqpoigywfegcbvfhoa.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-only-fixture-123456789',TSI_GUEST_TEST_MODE:'true'};
 let permitted=true,admin=true,rates=true,created=[],sent=[],challenges=new Map(),sessions=new Set(),calls=[];
 const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 async function fetcher(url,options){
  calls.push({url,body:options.body&&JSON.parse(options.body)});
  assert.ok(url.startsWith(env.SUPABASE_URL+'/'),'Ninguna llamada cambia de proyecto');
  if(url.endsWith('/auth/v1/user'))return response({id:actor,is_anonymous:false});
  assert.equal(options.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);
  const body=JSON.parse(options.body),name=url.split('/').pop();
  if(name==='tsi230_guest_rate')return response(rates);
  if(name==='tsi230_guest_admin'){
   if(!admin)return new Response('{}',{status:403});
   assert.equal(body.actor_id,actor);created.push(body);
   return response({folders:[],contacts:[],invitations:[],sessions:[],invitation_id:invitationId});
  }
  if(name==='tsi230_guest_challenge'){
   const valid=body.test_invitation_id===invitationId||body.invitation_hash===await sha256(invitation,webcrypto)&&body.email_address==='approved@example.invalid';
   if(valid)challenges.set(body.challenge_id,{hash:body.code_hash,attempts:0,used:false});
   return response(valid);
  }
  if(name==='tsi230_guest_redeem'){
   const row=challenges.get(body.challenge_id);if(!row||row.used||row.attempts>=5)return response({allowed:false});row.attempts++;
   if(row.hash!==body.code_hash)return response({allowed:false});row.used=true;sessions.add(body.session_hash);
   return response({allowed:true,expires_at:new Date(Date.now()+3600000).toISOString()});
  }
  if(name==='tsi230_guest_verify_items')return response({allowed:permitted&&sessions.has(body.session_hash)&&body.item_ids.every(id=>id==='scope-photo'),expires_at:new Date(Date.now()+3600000).toISOString()});
  if(name==='tsi230_guest_catalog')return response({allowed:permitted,items:[{id:'scope-photo',title:'Scoped',price:50}],image:'data:image/jpeg;base64,/9j/AAAA'});
  if(name==='tsi230_guest_logout'){sessions.delete(body.session_hash);return response(true);}
  throw Error('RPC unexpected '+name);
 }
 const handler=createHandler({env:name=>env[name],fetch:fetcher,crypto:webcrypto});
 async function call(body,extra={},use=handler){const result=await use(new Request(env.SUPABASE_URL+'/functions/v1/tsi-guest-access',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body)}));return {status:result.status,data:await result.json(),headers:result.headers};}
 const auth={Authorization:'Bearer '+('admin.jwt.signature.'.repeat(3))};
 let result=await call({action:'config'});assert.equal(result.data.email_ready,false);assert.equal(result.data.accounts_created,false);assert.equal(result.headers.get('cache-control'),'no-store, max-age=0');
 for(const email of ['approved@example.invalid','unknown@example.invalid']){result=await call({action:'request',invitation,email});assert.equal(result.status,503);assert.equal(result.data.error,'email_not_configured');}
 assert.equal(challenges.size,0,'Sin transporte de correo no se crea una credencial útil');
 result=await call({action:'admin-test-code',invitation_id:invitationId});assert.equal(result.status,403);assert.equal(challenges.size,0);
 result=await call({action:'admin-test-code',invitation_id:invitationId},auth);assert.equal(result.status,200);assert.equal(result.data.test_only,true);const test=result.data;
 assert.equal(sent.length,0,'PRUEBA no envía correo');assert.match(test.code,/^\d{6}$/);
 result=await call({action:'verify',challenge_id:test.challenge_id,code:test.code});assert.equal(result.status,200);const session=result.data.token;assert.match(session,/^[a-f0-9]{64}$/);assert.ok(![...challenges.values()].some(c=>c.hash===test.code),'Solo se guarda hash');
 assert.equal((await call({action:'verify',challenge_id:test.challenge_id,code:test.code})).status,403,'OTP es de un solo uso');
 const guest={'x-tsi-guest-token':session};
 assert.equal((await call({action:'list'})).status,403,'Nunca hay catálogo anónimo');
 assert.equal((await call({action:'list'},guest)).status,200);
 assert.equal((await call({action:'preview',id:'scope-photo'},guest)).status,200);
 assert.equal((await call({action:'preview',id:'another-folder-photo'},guest)).status,403,'IDOR en preview bloqueado');
 assert.equal((await call({action:'validate',ids:[]},guest)).data.allowed,true,'Incluso carrito variantes exige sesión activa');
 assert.equal((await call({action:'validate',ids:['scope-photo','other']},guest)).status,403,'El carrito mixto no amplía carpeta');
 assert.equal((await call({action:'original',id:'scope-photo'},guest)).status,403,'Original requiere entrega autorizada adicional');
 permitted=false;assert.equal((await call({action:'preview',id:'scope-photo'},guest)).status,403,'Revocación se comprueba en cada lectura');permitted=true;
 result=await call({action:'admin',operation:'invite-create',payload:{contact_id:actor,test_mode:'true'}},auth);assert.equal(result.status,400,'No se evade test flag con strings');
 env.TSI_GUEST_TEST_MODE='false';result=await call({action:'admin-test-code',invitation_id:invitationId},auth);assert.equal(result.status,403);env.TSI_GUEST_TEST_MODE='true';
 delete env.TSI_GUEST_TEST_MODE;assert.equal((await call({action:'config'})).data.test_mode,true,'STAGING dispone de prueba admin sin nueva envflag');env.TSI_GUEST_TEST_MODE='true';
 result=await call({action:'admin',operation:'invite-create',payload:{contact_id:actor,expires_at:new Date(Date.now()+3600000).toISOString(),test_mode:true}},auth);assert.equal(result.status,200);assert.match(result.data.invitation,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(created).includes(result.data.invitation),'Invitación persistida como hash');
 admin=false;assert.equal((await call({action:'admin-test-code',invitation_id:invitationId},auth)).status,409,'JWT existente no omite comprobación fresca del rol');admin=true;
 result=await call({action:'logout'},guest);assert.equal(result.status,200);assert.equal((await call({action:'list'},guest)).status,403,'Logout revoca en servidor');
 rates=false;assert.equal((await call({action:'config'})).status,429);rates=true;
 const evil=new Request(env.SUPABASE_URL+'/functions/v1/tsi-guest-access?token='+token,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"action":"config"}'});assert.equal((await handler(evil)).status,400,'Credenciales nunca se admiten en URL');
 assert.equal((await call({action:'config'},{Origin:'https://evil.example'})).status,403);
 const badProject=createHandler({env:name=>name==='SUPABASE_URL'?'https://tantlgswituiwkxfgmsr.supabase.co':env[name],fetch:()=>{throw Error('Must never fetch production');},crypto:webcrypto});assert.equal((await call({action:'config'},{},badProject)).status,503);
 let rpcCount=0;assert.equal((await validateGuestItems('no-token',['photo'],{crypto:webcrypto,rpc:async()=>{rpcCount++;}})).allowed,false);assert.equal(rpcCount,0);
 const emailHandler=createHandler({env:name=>env[name],fetch:fetcher,crypto:webcrypto,emailConfigured:true,background:task=>task,sendEmail:async message=>sent.push(message)});
 const before=sent.length;let first,unknown;
 first=await call({action:'request',invitation,email:'approved@example.invalid'},{},emailHandler);unknown=await call({action:'request',invitation,email:'unknown@example.invalid'},{},emailHandler);
 assert.deepEqual(Object.keys(first.data).sort(),Object.keys(unknown.data).sort());assert.equal(first.status,unknown.status);assert.equal(sent.length,before+1);assert.ok(!JSON.stringify(first.data).includes(sent.at(-1).code),'OTP nunca sale en respuesta pública');
 const schema=fs.readFileSync(path.join(root,'supabase/functions/tsi-guest-access/schema.sql'),'utf8');
 assert.match(schema,/revoke select on public\.shop_items from anon/);assert.match(schema,/as restrictive for select to authenticated/);assert.match(schema,/expires_at<=created_at\+interval '56 days'/);assert.match(schema,/f\.expires_at>now\(\)/);assert.match(schema,/attempts>=5/);assert.match(schema,/for update/);assert.match(schema,/cron\.schedule\('tsi230-guest-retention'/);assert.doesNotMatch(schema,/security definer/i);
 assert.equal(schema,fs.readFileSync(path.join(root,'supabase/migrations/20261107024942_tsi230_guest_access.sql'),'utf8'),'Migración y esquema revisable coinciden');
 const binding=fs.readFileSync(path.join(root,'supabase/functions/tsi-guest-access/store-binding.sql'),'utf8');
 assert.equal(binding,fs.readFileSync(path.join(root,'supabase/migrations/20261107025824_tsi230_store_guest_binding.sql'),'utf8'));
 assert.match(binding,/for share of s,i,c,f/);assert.match(binding,/bound_contact is distinct from contact_key/);assert.match(binding,/ord->>'status'<>'paid'/);assert.match(binding,/tsi230_guest_verify_items\(\$1,photo_ids\)/);assert.doesNotMatch(binding,/security definer/i);
 assert.match(binding,/tsi230_store_manual_guest\(session_hash text,request_id uuid,items text\[\],name text,contact text,note text\)/);assert.match(binding,/receipt\.contact_id is distinct from contact_key/);assert.match(binding,/'status','nuevo'/);assert.match(binding,/revoke insert on public\.orders from public,anon/);
 console.log('PASS guest230: staging isolation, no accounts, no anon catalog, per-image scope, revoke, OTP single-use/hashes, admin-only test codes, quotas, retention contract.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
