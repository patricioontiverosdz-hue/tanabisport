// Local mocked transport plus real JPEG validation. No network or customer data.
const assert=require('node:assert/strict'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
async function main(){
 const {createHandler}=await import('../supabase/functions/tsi-guest-access/handler.mjs');
 const {validatePortfolioInput}=await import('../supabase/functions/tsi-guest-access/portfolio.mjs');
 const actor='23000000-0000-4000-8000-000000000001',photo='23000000-0000-4000-8000-000000000002',request='23000000-0000-4000-8000-000000000003';
 const env={SUPABASE_URL:'https://nksqpoigywfegcbvfhoa.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-only-not-a-real-service-key-230'};
 const origin='https://patricioontiverosdz-hue.github.io',auth={Authorization:'Bearer '+('local.staff.signature.'.repeat(3))};
 const image='data:image/jpeg;base64,'+fs.readFileSync(require('node:path').join(__dirname,'../staging/photo-game-scenes/soccer-celebration.jpg')).toString('base64');
 const minimal={request_id:request,title:'Updated public title'};
 const full={...minimal,image,season_end:'2099-01-01T00:00:00Z',consent_until:'2098-01-01T00:00:00Z',consent_reference:'AUT-NEW-001',contains_minors:false,guardian_reference:null,consent_confirmed:true,guardian_confirmed:false};
 assert.deepEqual(validatePortfolioInput(minimal,{update:true}),{full:false});
 assert.throws(()=>validatePortfolioInput(minimal));assert.deepEqual(validatePortfolioInput({...minimal,image},{update:true}),{full:true});
 let role='admin',valid=true,calls=[],authCalls=0;
 const handler=createHandler({env:k=>env[k],crypto:webcrypto,fetch:async(url,opt)=>{
  assert.ok(url.startsWith(env.SUPABASE_URL+'/'));
  if(url.endsWith('/auth/v1/user')){authCalls++;return Response.json({id:actor,is_anonymous:false},{status:valid?200:401});}
  assert.equal(opt.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
  const name=url.split('/').at(-1),body=JSON.parse(opt.body);calls.push({name,body});
  if(name==='tsi230_guest_rate')return Response.json(true);
  if(name==='tsi230_portfolio_read')return Response.json(body.item_id?{id:photo,title:'Public',image,expires_at:'2099-01-01T00:00:00Z'}:{items:[],homepage:{id:photo,title:'Public',expires_at:'2099-01-01T00:00:00Z'}});
  if(name==='tsi230_portfolio_admin'){
   assert.equal(body.actor_id,actor);const allowed=['admin','editora'].includes(role)&&(body.operation!=='homepage'||role==='admin');
   return Response.json({items:[],homepage_id:body.operation==='homepage'?body.payload.id:null},{status:allowed?200:403});
  }
  throw Error('Unexpected RPC '+name);
 }});
 async function call(body,headers=auth){const r=await handler(new Request(env.SUPABASE_URL+'/functions/v1/tsi-guest-access',{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));return{status:r.status,json:await r.json()};}
 for(const member of ['admin','editora']){role=member;calls=[];assert.equal((await call({action:'portfolio/update',id:photo,payload:minimal})).status,200);assert.deepEqual(calls.filter(c=>c.name==='tsi230_portfolio_admin').map(c=>c.body.operation),['state','update']);assert.deepEqual(calls.find(c=>c.body.operation==='update').body.payload,{...minimal,id:photo});assert.equal((await call({action:'portfolio/update',id:photo,payload:full})).status,200,'Replacement larger than old 12 KB limit remains bounded but accepted');}
 role='admin';const metadata={...full};delete metadata.image;assert.equal((await call({action:'portfolio/update',id:photo,payload:metadata})).status,200,'Metadata-only authorization update retains existing image');
 for(const change of [{image:'https://other.invalid/a.jpg'},{id:photo},{unknown:true}]){calls=[];assert.equal((await call({action:'portfolio/update',id:photo,payload:{...full,...change}})).status,400);assert.ok(!calls.some(c=>c.body.operation==='update'));}
 assert.equal((await call({action:'portfolio/update',id:photo,payload:{...full,contains_minors:true,guardian_confirmed:true,guardian_reference:'TUTOR-NEW-001'}})).status,200);
 assert.equal((await call({action:'portfolio/update',id:photo,payload:{...full,consent_confirmed:false,contains_minors:true,guardian_reference:null,season_end:'2000-01-01',consent_until:'invalid'}})).status,200,'Los campos heredados no bloquean la edición manual');
 for(const body of [{action:'portfolio/update',id:'invalid',payload:minimal},{action:'portfolio/update',id:photo,payload:{...minimal,request_id:'invalid'}},{action:'portfolio/update',id:photo,payload:{...minimal,title:'x'.repeat(81)}},{action:'portfolio/homepage',id:'https://other.invalid/x',request_id:request},{action:'portfolio/homepage',request_id:request},{action:'portfolio/homepage',id:photo,request_id:'invalid'},{action:'portfolio/homepage',id:photo,request_id:request,image:'not permitted'}])assert.equal((await call(body)).status,400);
 for(const member of ['foto','pending']){role=member;calls=[];assert.equal((await call({action:'portfolio/update',id:photo,payload:minimal})).status,409);assert.ok(!calls.some(c=>c.body.operation==='update'));}
 role='editora';calls=[];assert.equal((await call({action:'portfolio/homepage',id:photo,request_id:request})).status,409,'Current database role rejects editor homepage changes');
 role='admin';assert.equal((await call({action:'portfolio/homepage',id:photo,request_id:request})).status,200);const clear=await call({action:'portfolio/homepage',id:null,request_id:request});assert.equal(clear.status,200);assert.equal(clear.json.homepage_id,null);
 assert.equal((await call({action:'portfolio/update',id:photo,payload:minimal},{})).status,403);valid=false;assert.equal((await call({action:'portfolio/homepage',id:photo,request_id:request})).status,403);valid=true;
 const before=authCalls,result=await call({action:'portfolio/list'},{});assert.equal(result.status,200);assert.equal(authCalls,before);assert.equal(result.json.homepage.id,photo);assert.ok(!JSON.stringify(result.json).includes('consent'));assert.ok(!JSON.stringify(result.json).includes('data:image'));
 console.log('PASS portfolio230 image editing transport: title/replacement without date or authorization fields, fresh staff role, admin homepage/null, no URL bypass or client actor, bounded JPEG, public homepage projection.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
