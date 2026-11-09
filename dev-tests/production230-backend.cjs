// Production package verification only: simulated HTTP and optional local PostgreSQL.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'release/2.3.0-production/backend');
const PRODUCTION='tantlgswituiwkxfgmsr',STAGING='nksqpoigywfegcbvfhoa',ORIGIN='https://patricioontiverosdz-hue.github.io';
async function main(){
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
 assert.equal(manifest.project_id,PRODUCTION);assert.equal(manifest.mode,'manual_orders_only');assert.equal(manifest.stripe_enabled,false);assert.equal(manifest.ordered_sql.length,12);assert.equal(manifest.post_frontend_sql.length,1);
 for(const [i,entry]of manifest.ordered_sql.entries()){assert.ok(fs.existsSync(path.join(base,entry.file)));assert.match(entry.file,new RegExp('/'+String(i+1).padStart(3,'0')+'_'));}
 const schema=fs.readFileSync(path.join(base,'sql/008_portfolio_schema.sql'),'utf8'),close=fs.readFileSync(path.join(base,'sql/013_close_legacy_after_frontend.sql'),'utf8');
 assert.ok(!schema.includes('revoke all on public.portfolio'),'Legacy remains available until frontend cutover');assert.ok(!schema.includes('set public=false'));assert.ok(close.includes('Legacy portfolio import is not fully verified'));assert.ok(close.includes('set public=false'));
 assert.ok(fs.readFileSync(path.join(base,'sql/001_shop_preview.sql'),'utf8').includes('previous:=tsi210_private.backup_tables()'),'Keep current backup registry');
 for(const entry of manifest.edge_functions)for(const file of entry.files){
  const content=fs.readFileSync(path.join(base,'functions',entry.name,file),'utf8');
  if(/\.(?:mjs|ts)$/.test(file))assert.ok(!content.includes(STAGING),entry.name+'/'+file+' cannot address staging');
 }
 const guestSource=fs.readFileSync(path.join(base,'functions/tsi-guest-access/handler.mjs'),'utf8'),guestSql=fs.readFileSync(path.join(base,'sql/006_guest_access.sql'),'utf8');
 for(const source of [guestSource,guestSql])assert.ok(!/test_mode|test_invitation_id|admin-test-code/.test(source),'Production has real manual access, not staging test flow');
 assert.ok(guestSource.includes('manual_codes:'));assert.ok(guestSql.includes('manual_invitation_id'));assert.ok(!fs.readFileSync(path.join(base,'functions/tsi-store-checkout/index.ts'),'utf8').includes('npm:stripe'));
 const load=async(name,file='handler.mjs')=>import(pathToFileURL(path.join(base,'functions',name,file)).href);
 const {createHandler:guestHandler}=await load('tsi-guest-access');
 const {createHandler:storeHandler,PAYMENTS_ENABLED}=await load('tsi-store-checkout');assert.equal(PAYMENTS_ENABLED,false);
 const envValues={SUPABASE_URL:'https://'+PRODUCTION+'.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-only-production-adapter-secret-230'};
 const env=k=>{assert.ok(!k.startsWith('STRIPE_'),'Disabled release must not read Stripe secrets');return envValues[k];};
 const actor='23000000-0000-4000-8000-000000000001',invitation='23000000-0000-4000-8000-000000000002',requestId='23000000-0000-4000-8000-000000000003',token='b'.repeat(64),auth={Authorization:'Bearer '+('local.actual.staff.signature.'.repeat(3))};
 let requests=[],authValid=true;
 const transport=async(url,options={})=>{
  assert.ok(String(url).startsWith(envValues.SUPABASE_URL+'/'),'Every request remains in production');requests.push({url:String(url),options});
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:actor,is_anonymous:false},{status:authValid?200:401});
  const leaf=String(url).split('/').at(-1),body=options.body?JSON.parse(options.body):null;
  assert.equal(options.headers.Authorization,'Bearer '+envValues.SUPABASE_SERVICE_ROLE_KEY);
  if(leaf==='tsi230_guest_rate')return Response.json(true);
  if(leaf==='tsi230_guest_admin')return Response.json({folders:[],contacts:[],invitations:[],sessions:[],available_folders:[]});
  if(leaf==='tsi230_guest_challenge'){assert.equal(body.manual_invitation_id,invitation);assert.match(body.code_hash,/^[a-f0-9]{64}$/);assert.ok(!Object.hasOwn(body,'code'));return Response.json(true);}
  if(leaf==='tsi230_guest_redeem')return Response.json({allowed:true,expires_at:new Date(Date.now()+3600000).toISOString()});
  if(leaf==='tsi230_guest_verify_items')return Response.json({allowed:true,contact_id:actor});
  if(leaf==='tsi230_store_manual_guest')return Response.json({id:'manual-order',reference:'manual-order',status:'nuevo',total:50});
  throw Error('Unexpected transport '+leaf);
 };
 const guest=guestHandler({env,fetch:transport,crypto:crypto.webcrypto});
 const callGuest=async(body,headers={})=>{const response=await guest(new Request(envValues.SUPABASE_URL+'/functions/v1/tsi-guest-access',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json',...headers},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()};};
 let result=await callGuest({action:'config'});assert.equal(result.status,200);assert.equal(result.body.manual_codes,true);assert.equal(result.body.email_ready,false);assert.equal(result.body.accounts_created,false);
 result=await callGuest({action:'admin-access-code',invitation_id:invitation});assert.equal(result.status,403,'Only staff can issue access codes');
 result=await callGuest({action:'admin-access-code',invitation_id:invitation},auth);assert.equal(result.status,200);assert.equal(result.body.manual_only,true);assert.match(result.body.code,/^\d{6}$/);assert.equal(result.body.expires_minutes,5);assert.ok(!JSON.stringify(result.body).includes('PRUEBA'));
 const issued=result.body;
 result=await callGuest({action:'verify',challenge_id:issued.challenge_id,code:issued.code});assert.equal(result.status,200);assert.match(result.body.token,/^[a-f0-9]{64}$/);
 result=await callGuest({action:'request',invitation:'a'.repeat(64),email:'approved@example.invalid'});assert.equal(result.status,503,'No pretend email delivery');
 authValid=false;assert.equal((await callGuest({action:'admin-access-code',invitation_id:invitation},auth)).status,403);authValid=true;
 const wrong=guestHandler({env:k=>k==='SUPABASE_URL'?'https://'+STAGING+'.supabase.co':envValues[k],fetch:()=>{throw Error('Must not address another project');},crypto:crypto.webcrypto});
 assert.equal((await wrong(new Request('https://'+STAGING+'.supabase.co/functions/v1/tsi-guest-access',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:'{"action":"config"}'}))).status,503);
 let stripeCalls=0;
 const store=storeHandler({env,fetch:transport,crypto:crypto.webcrypto,stripeFactory:()=>{stripeCalls++;throw Error('Must not create a Stripe client');}});
 const callStore=async(leaf,body,headers={})=>{const response=await store(new Request(envValues.SUPABASE_URL+'/functions/v1/tsi-store-checkout/'+leaf,{method:body===undefined?'GET':'POST',headers:{origin:ORIGIN,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}));return{status:response.status,body:await response.json()};};
 result=await callStore('config');assert.equal(result.status,200);assert.equal(result.body.environment,'production');assert.equal(result.body.ready,false);assert.equal(result.body.publishable_key,null);
 result=await callStore('manual-order',{items:['approved-photo'],name:'Cliente sintético',contact:'8112345678',note:'',request_id:requestId},{'x-tsi-guest-token':token});assert.equal(result.status,200);assert.equal(result.body.status,'nuevo');
 assert.equal((await callStore('manual-order',{items:['approved-photo'],name:'Cliente sintético',contact:'8112345678',note:'',request_id:requestId})).status,403);
 result=await callStore('create-session',{cart:[{kind:'photo',id:'approved-photo',quantity:1}],request_id:requestId,access_token:token,email:'approved@example.invalid'},{'x-tsi-guest-token':token});assert.equal(result.status,503);assert.equal(stripeCalls,0);
 const {prepareLegacyRows,exifOrientation}=await import(pathToFileURL(path.join(base,'prepare-legacy-portfolio.mjs')).href);
 const {normalizePortfolioJpeg,validatePortfolioInput}=await load('tsi-guest-access','portfolio.mjs');
 const jpeg=fs.readFileSync(path.join(root,'staging/photo-game-scenes/soccer-celebration.jpg')),fixture={id:"legacy-'1",data:{title:'Fotografía sintética',path:'synthetic.jpg',url:'https://'+PRODUCTION+'.supabase.co/storage/v1/object/public/portafolio/synthetic.jpg'}};
 const prepared=await prepareLegacyRows([fixture],{fetcher:async()=>new Response(jpeg)});assert.equal(prepared.length,1);assert.equal(prepared[0].orientation,1);assert.equal(exifOrientation(jpeg),1);assert.match(prepared[0].sql,/set local role service_role/);assert.ok(prepared[0].sql.includes("legacy-''1"),'SQL string escaping');assert.equal(prepared[0].bytes,jpeg.length);
 for(const url of ['https://evil.invalid/x.jpg','http://'+PRODUCTION+'.supabase.co/storage/v1/object/public/portafolio/synthetic.jpg','https://'+PRODUCTION+'.supabase.co/storage/v1/object/public/portafolio/synthetic.jpg?token=private']){
  await assert.rejects(prepareLegacyRows([{...fixture,data:{...fixture.data,url}}],{fetcher:()=>{throw Error('Must reject before network');}}),/Unexpected legacy source/);
 }
 const block=Buffer.alloc(65004);block[0]=255;block[1]=225;block.writeUInt16BE(65002,2);
 const large=Buffer.concat([jpeg.subarray(0,2),...Array(6).fill(block),jpeg.subarray(2)]),largeUri='data:image/jpeg;base64,'+large.toString('base64');
 assert.throws(()=>normalizePortfolioJpeg(largeUri),'Ordinary upload bound remains 500000');
 const normalized=normalizePortfolioJpeg(largeUri,{maxLength:1500000});assert.equal(normalized,'data:image/jpeg;base64,'+jpeg.toString('base64'),'Legacy metadata removal preserves original image bytes');
 assert.throws(()=>validatePortfolioInput({request_id:requestId,title:'No bypass',image:largeUri,maxLength:1500000}),'HTTP clients cannot opt into legacy import size');
 console.log('Production backend: isolated project, real manual codes, no customer Auth/email, Stripe disabled, approved manual orders and safe legacy importer verified.');
 if(process.env.TSI230_PGLITE_MODULE){
  const pg=spawnSync(process.execPath,[path.join(__dirname,'production230-backend-postgres.cjs')],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
  if(pg.error||pg.status!==0)throw pg.error||Error('Production PostgreSQL test failed: '+pg.status);
 }else console.log('OMITIDO PostgreSQL local: define TSI230_PGLITE_MODULE to run the complete SQL promotion test.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
