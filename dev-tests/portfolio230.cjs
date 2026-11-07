// Local handler transport only. Synthetic identities, no network or real Auth.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
async function main(){
 const {validatePortfolioJpeg}=await import('../supabase/functions/tsi-guest-access/portfolio.mjs');
 const {createHandler}=await import('../supabase/functions/tsi-guest-access/handler.mjs');
 const jpeg=fs.readFileSync(path.join(__dirname,'../staging/photo-game-scenes/soccer-celebration.jpg'));
 const encode=b=>'data:image/jpeg;base64,'+b.toString('base64');
 assert.deepEqual(validatePortfolioJpeg(encode(jpeg)),{width:1400,height:788,bytes:jpeg.length});
 function transform(marker,change){let at=2,parts=[jpeg.subarray(0,2)];while(at<jpeg.length-2){const mark=jpeg[at+1],length=jpeg.readUInt16BE(at+2),part=jpeg.subarray(at,at+2+length);parts.push(mark===marker?change(Buffer.from(part)):part);at+=2+length;if(mark===0xda){parts.push(jpeg.subarray(at));break;}}return Buffer.concat(parts.filter(Boolean));}
 for(const bad of ['https://example.invalid/photo.jpg','data:image/png;base64,AAAA',encode(jpeg.subarray(0,-2)),encode(Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,225,0,8,69,120,105,102,0,0]),jpeg.subarray(2)])),encode(Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,254,0,3,65]),jpeg.subarray(2)])),encode(transform(0xdb,()=>null)),encode(transform(0xc4,()=>null)),encode(transform(0xda,b=>{b.writeUInt16BE(2,2);return b;})),encode(transform(0xc0,b=>{b.writeUInt16BE(1601,7);return b;})),encode(transform(0xc0,b=>{b[1]=0xc2;return b;}))])assert.throws(()=>validatePortfolioJpeg(bad),'Malformed or metadata-bearing JPEG must be rejected');
 const env={SUPABASE_URL:'https://nksqpoigywfegcbvfhoa.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-only-not-a-real-service-key-230'};
 const actor='23000000-0000-4000-8000-000000000001',photo='23000000-0000-4000-8000-000000000002';
 const origin='https://patricioontiverosdz-hue.github.io',auth={Authorization:'Bearer '+('local.staff.signature.'.repeat(3))};
 let role='admin',userValid=true,unavailable=false,rates=true,calls=[],authCalls=0;
 const handler=createHandler({env:k=>env[k],crypto:webcrypto,fetch:async(url,opt)=>{
  assert.ok(url.startsWith(env.SUPABASE_URL+'/'),'All service calls remain in staging');
  if(url.endsWith('/auth/v1/user')){authCalls++;return Response.json({id:actor,is_anonymous:false},{status:userValid?200:401});}
  assert.equal(opt.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);assert.equal(opt.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
  const name=url.split('/').at(-1),body=JSON.parse(opt.body);calls.push({name,body});
  if(name==='tsi230_guest_rate')return Response.json(rates);
  if(name==='tsi230_portfolio_read')return Response.json(body.item_id?(unavailable?{unavailable:true}:{id:photo,title:'Public title',image:encode(jpeg),expires_at:'2099-01-01T00:00:00Z'}):{items:[{id:photo,title:'Public title',expires_at:'2099-01-01T00:00:00Z'}]});
  if(name==='tsi230_portfolio_admin'){assert.equal(body.actor_id,actor);return Response.json({items:[]},{status:['admin','editora'].includes(role)?200:403});}
  throw Error('Unexpected RPC '+name);
 }});
 async function call(body,headers={},extra={}){const result=await handler(new Request(env.SUPABASE_URL+'/functions/v1/tsi-guest-access',{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body),...extra}));return {status:result.status,data:await result.json(),headers:result.headers};}
 const payload={request_id:'23000000-0000-4000-8000-000000000003',title:'Public title',image:encode(jpeg),season_end:'2099-01-01T00:00:00Z',consent_until:'2098-01-01T00:00:00Z',consent_reference:'AUT-LOCAL-001',contains_minors:false,guardian_reference:null,consent_confirmed:true,guardian_confirmed:false};
 let result=await call({action:'portfolio/list'});assert.equal(result.status,200);assert.equal(authCalls,0);assert.equal(result.data.items.length,1);assert.ok(!JSON.stringify(result.data).includes('consent'));assert.match(result.headers.get('cache-control'),/no-store/);assert.equal(result.headers.get('access-control-allow-origin'),origin);
 assert.equal((await call({action:'portfolio/image',id:photo})).status,200);assert.equal(authCalls,0);
 unavailable=true;assert.equal((await call({action:'portfolio/image',id:photo})).status,404);unavailable=false;
 assert.equal((await call({action:'portfolio/list',actor_id:actor})).status,400);assert.equal((await call({action:'portfolio/image',id:'invalid'})).status,400);
 assert.equal((await call({action:'portfolio/publish',payload})).status,403);assert.equal((await call({action:'portfolio/admin-state'})).status,403);assert.equal((await call({action:'portfolio/revoke',id:photo})).status,403);
 for(const r of ['admin','editora']){role=r;calls=[];assert.equal((await call({action:'portfolio/publish',payload},auth)).status,200);assert.deepEqual(calls.filter(c=>c.name==='tsi230_portfolio_admin').map(c=>c.body.operation),['state','publish']);assert.equal((await call({action:'portfolio/admin-state'},auth)).status,200);assert.equal((await call({action:'portfolio/revoke',id:photo},auth)).status,200);}
 for(const r of ['foto','pending']){role=r;calls=[];assert.equal((await call({action:'portfolio/publish',payload},auth)).status,409);assert.ok(!calls.some(c=>c.body.operation==='publish'),'Current server role prevents publication');}role='admin';
 userValid=false;assert.equal((await call({action:'portfolio/publish',payload},auth)).status,403);userValid=true;
 const invalid=[{consent_confirmed:false},{contains_minors:'false'},{contains_minors:true},{contains_minors:true,guardian_confirmed:true,guardian_reference:'https://private.invalid'},{consent_reference:'email@example.invalid'},{season_end:'2000-01-01T00:00:00Z'},{consent_until:'invalid'},{image:'data:image/jpeg;base64,/9j/AAAA'},{image:encode(transform(0xc4,()=>null))},{unauthorized_field:true}];
 for(const change of invalid){calls=[];assert.equal((await call({action:'portfolio/publish',payload:{...payload,...change}},auth)).status,400,JSON.stringify(Object.keys(change)));assert.ok(!calls.some(c=>c.body.operation==='publish'));}
 assert.equal((await call({action:'portfolio/publish',payload:{...payload,contains_minors:true,guardian_confirmed:true,guardian_reference:'TUTOR-LOCAL-001'}},auth)).status,200);
 assert.equal((await call({action:'portfolio/list'},{origin:'https://other.invalid'})).status,403);
 rates=false;assert.equal((await call({action:'portfolio/list'})).status,429);
 console.log('PASS portfolio230 handler: real baseline JPEG, malformed tables/scan/metadata/dimensions rejected; public projection, cache/CORS, fresh staff roles, consent/guardian, request bounds and staging isolation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
