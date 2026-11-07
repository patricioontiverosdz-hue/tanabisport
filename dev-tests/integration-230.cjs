const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),htmlPath=path.join(root,'staging/index.html'),html=fs.readFileSync(htmlPath,'utf8');
const backend=html.match(/var SBU="([^"]+)"/)[1],authKey=html.match(/localStorage\.setItem\(["']([^"']+_auth)["']/)[1];
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003'};
const profiles=Object.entries(ids).map(([role,id])=>({id,role,email:role+'@test.invalid',name:'Usuario '+role}));
const guestToken='b'.repeat(64),staffPhoto={id:'staff-only',title:'Fotografía interna',price:50,folder:'Otra carpeta',img:'data:image/jpeg;base64,AAAA'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let Window;
async function until(check,label){for(let i=0;i<200;i++){if(check())return;await delay(10);}throw Error('No se completó: '+label);}
async function environment(role){
 const window=new Window({url:'https://example.invalid/tanabisport/staging/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),document=window.document;
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;window.HTMLCanvasElement.prototype.getContext=()=>null;
 document.body.innerHTML='<div id="app"></div>';const calls=[],errors=[],downloads=[];window.addEventListener('error',event=>errors.push(String(event.error||event.message)));
 document.addEventListener('click',event=>{if(event.target.tagName==='A'&&event.target.download)downloads.push(event.target.href);},true);
 const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 const editorState={server_now:new Date().toISOString(),model:{parameters:{min_completed_jobs:3}},capacity:[],estimates:[],sessions:[],matches:[],events:[],snapshots:[]};
 window.fetch=async(input,options={})=>{
  const url=new URL(String(input)),method=options.method||'GET',body=options.body?JSON.parse(options.body):null,headers=new Headers(options.headers||{});
  assert.equal(url.origin,backend,'Every data call stays in staging');calls.push({path:url.pathname,method,body,headers});
  if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:true,reservasPublicas:false,autoArchive:false}}]);
  if(url.pathname==='/rest/v1/profiles')return response(profiles);
  if(url.pathname==='/rest/v1/shop_items')return response([{id:staffPhoto.id,data:staffPhoto}]);
  if(url.pathname==='/rest/v1/rpc/tsi11_state')return response(editorState);
  if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({server_now:editorState.server_now,photographers:[]});
  if(url.pathname==='/rest/v1/rpc/tsi210_state')return response({version:'2.1.0',teams:[],team_matches:[],rates:[],quotes:[],quote_costs:[],costs:[],deliveries:[],audit:[]});
  if(url.pathname==='/rest/v1/rpc/tsi230_rules_state')return response({server_now:editorState.server_now,availability:[],clock:[],suspensions:[]});
  if(url.pathname==='/functions/v1/tsi-guest-access'){
   if(body.action==='portfolio/list')return response({items:[]});
   if(body.action==='portfolio/admin-state')return ['admin','editora'].includes(role)&&headers.get('authorization')?response({items:[]}):new Response('{"message":"Sin permiso"}',{status:403});
   if(body.action==='verify')return response({token:guestToken,expires_at:new Date(Date.now()+600000).toISOString()});
   assert.equal(headers.get('x-tsi-guest-token'),guestToken,'Guest list and image calls carry the grant');
   if(body.action==='status')return response({allowed:true});
   if(body.action==='list')return response({items:[{id:'allowed1',title:'Fotografía autorizada',price:50}]});
   if(body.action==='preview')return response({image:'data:image/jpeg;base64,AAAA'});
   if(body.action==='logout')return response({ok:true});
  }
  if(url.pathname.startsWith('/functions/v1/tsi-store-checkout/')){
   if(url.pathname.endsWith('/catalog')){assert.equal(headers.get('x-tsi-guest-token'),guestToken);return response({products:[],variants:[],config:{enabled:true}});}
   if(url.pathname.endsWith('/config'))return response({ready:false,reason:'staging'});
   if(url.pathname.endsWith('/manual-order'))return response({id:'order1',reference:'order1',total:50,status:'nuevo'});
  }
  return response([]);
 };
 window.localStorage.setItem('tsi_production_sentinel','untouched');
 if(role){const token='test.'+Buffer.from(JSON.stringify({iss:backend+'/auth/v1'})).toString('base64url')+'.test';window.localStorage.setItem(authKey,JSON.stringify({access:token,uid:ids[role],exp:Date.now()/1000+3600}));}
 const scripts=[...html.matchAll(/<script([^>]*)>([^]*?)<\/script>/g)];
 for(const [,attributes,inline]of scripts){const src=attributes.match(/\bsrc="([^"]+)"/);if(src){window.eval(fs.readFileSync(path.resolve(path.dirname(htmlPath),src[1].split('?')[0]),'utf8'));continue;}let code=inline;if(code.includes('var SBU=')){const end=code.lastIndexOf('})();');code=code.slice(0,end)+'window.__integration230={S:S,AUTH:AUTH,SYNC:SYNC,guestState:GUEST230_STATE,store:STORE224,rules:RULES230,render:function(){render();},tabs:tabsFor,edge:tsi230StoreRequest};\n'+code.slice(end);}if(code.trim())window.eval(code);}
 assert.ok(document.querySelector('.ui230-loader img'),'The integrated loader uses the real logo');
 await until(()=>window.__integration230&&!window.__integration230.S.booting&&(!role||window.__integration230.S.meId===ids[role]),'boot '+role);await delay(30);
 const api=window.__integration230;
 function click(selector){const node=document.querySelector(selector);assert.ok(node,selector);node.click();return node;}
 async function guestLogin(){if(!document.querySelector('[data-g230-form="verify"]'))window.TSI230Guest.open({next:'shop'});const form=document.querySelector('[data-g230-form="verify"]');form.querySelector('[name="challenge_id"]').value='00000000-0000-4000-8000-000000000009';form.querySelector('[name="code"]').value='123456';form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>window.TSI230Guest.authorized()&&api.guestState.shop.items.length===1,'guest photos');await delay(40);}
 return {window,document,api,calls,errors,downloads,click,guestLogin,close:async()=>{if(window.TSI230Guest.authorized())window.TSI230Guest.clear();await window.happyDOM.cancelAsync();window.close();}};
}
async function dashboards(){for(const role of Object.keys(ids)){const e=await environment(role);try{
 e.api.S.view='dash';e.api.S.tab='resumen';e.api.render();await delay(20);assert.ok(e.document.querySelector('.ui230-dashboard[data-ui230-role="'+role+'"]'));
 e.click('[data-ui230-action="tools"]');const listed=Array.from(e.document.querySelectorAll('#ui230-tools [data-ui230-module]'),b=>b.dataset.ui230Module).sort();assert.deepEqual(listed,Array.from(e.api.tabs(role),entry=>entry[0]).sort(),'Every real module is retained for '+role);
 for(const key of ['fotojuego','edicionjuego','rankingjuegos']){if(!e.document.getElementById('ui230-tools').open)e.click('[data-ui230-action="tools"]');e.click('[data-ui230-module="'+key+'"]');assert.equal(e.api.S.tab,key);assert.ok(e.document.querySelector('.ui230-main'),'Actual game module renders in the workspace');}
 e.click('.ui230-logo');assert.equal(e.api.S.view,'home');assert.equal(e.api.S.meId,ids[role]);e.click('[data-ui230-page="proceso"]');assert.equal(e.document.querySelectorAll('.ui230-process li').length,4);
 assert.equal(e.window.localStorage.getItem('tsi_production_sentinel'),'untouched');assert.deepEqual(e.errors,[]);
 }finally{await e.close();}}}
async function guestIsolation(){for(const role of [null,'admin']){const e=await environment(role);try{
 const full=JSON.stringify(e.api.S.shop.items),snap=JSON.stringify(e.api.SYNC.snap.shop_items);if(!role)assert.equal(e.calls.some(c=>c.path==='/rest/v1/shop_items'),false,'Anonymous boot never reads shop_items');
 e.api.S.view='shop';e.api.render();assert.ok(e.document.querySelector('.ui230-guest-gate'));assert.equal(e.calls.some(c=>c.path.endsWith('/catalog')),false,'A deep link cannot fetch the catalog before permission');
 e.click('[data-tsi230-guest="open"]');await e.guestLogin();assert.equal(e.api.S.view,'shop');assert.equal(JSON.stringify(e.api.S.shop.items),full,'Guest photos never replace the staff collection');assert.equal(JSON.stringify(e.api.SYNC.snap.shop_items),snap,'Guest photos never enter staff synchronization snapshots');assert.equal(e.api.guestState.shop.items[0].id,'allowed1');
 await e.api.edge('POST','manual-order',{name:'Cliente',contact:'8112345678',note:'',items:['allowed1'],request_id:'request1'});const edge=e.calls.filter(c=>c.path.endsWith('/manual-order')).pop();assert.equal(edge.headers.get('x-tsi-guest-token'),guestToken);assert.ok(edge.headers.get('apikey'));assert.equal(!!edge.headers.get('authorization'),!!role,'Store requests preserve staff authorization as well as guest access');
 e.window.TSI230Guest.clear();assert.ok(e.document.querySelector('.ui230-guest-gate'));assert.equal(e.api.guestState.shop.items.length,0);assert.equal(JSON.stringify(e.api.S.shop.items),full);assert.deepEqual(e.errors,[]);
 }finally{await e.close();}}}
async function privacy(){const e=await environment(null);try{e.api.S.view='login';e.api.render();for(const mode of ['in','up','forgot']){e.api.S.loginMode=mode;e.api.render();assert.ok(e.document.querySelector('.login .tsi-privacy-summary'));e.document.getElementById('u').value='preserved@test.invalid';e.click('.tsi-privacy-summary [data-privacy="simplified"]');assert.ok(e.document.getElementById('tsi-privacy-dialog').open);e.click('[data-privacy="download-integral"]');assert.match(e.downloads.pop(),/\/tanabisport\/assets\/Tanabi-Sports-aviso-privacidad-integral/);e.click('#tsi-privacy-dialog [data-privacy="close"]');assert.equal(e.document.getElementById('u').value,'preserved@test.invalid');}assert.deepEqual(e.errors,[]);}finally{await e.close();}}
(async()=>{const entry=require.resolve('happy-dom',{paths:[root,path.resolve(root,'../tanabisport')]});({Window}=await import(pathToFileURL(entry).href));await dashboards();await guestIsolation();await privacy();console.log('TSI 2.3.0 integrated staging: three real dashboards, all authorized modules and games, public process, guest deep-link gate, isolated guest/staff collections, protected request headers and login privacy downloads verified.');})().catch(error=>{console.error(error);process.exitCode=1;});
