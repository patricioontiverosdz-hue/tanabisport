const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),PROJECT='nksqpoigywfegcbvfhoa',A='a'.repeat(64),B='b'.repeat(64),ORDER='23000000-0000-4000-8000-000000000099';
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<150;i++){if(fn())return;await pause(10);}throw Error('No se completó: '+label);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};}
function storage(seed={}){const values=new Map(Object.entries(seed)),reads=[],writes=[];return {values,reads,writes,getItem(k){reads.push(k);return values.has(k)?values.get(k):null;},setItem(k,v){writes.push(k);values.set(k,String(v));},removeItem(k){values.delete(k);},get length(){return values.size;}};}
const quote=title=>({currency:'MXN',items:[{kind:'photo',id:'701',quantity:1,title,unit_price_cents:5000,line_total_cents:5000}],subtotal_cents:5000,shipping_cents:0,total_cents:5000,requires_shipping:false,payments_enabled:true});
const paid=()=>({id:ORDER,reference:'TS-AAAAAAAAAAAAAAAA',status:'paid',items:[{kind:'photo',id:'701',quantity:1,title:'FOTO PRIVADA A'}],downloadable_photos:[{id:'701',title:'FOTO PRIVADA A'}],total_cents:5000,requires_shipping:false,fulfillment:'unfulfilled'});
const record=()=>({request_id:'23000000-0000-4000-8000-000000000010',order_id:ORDER,reference:'TS-AAAAAAAAAAAAAAAA',access_token:'c'.repeat(64),cart:[]});
async function main(){
 const mod=process.env.TSI230_HAPPYDOM_MODULE||require.resolve('happy-dom',{paths:[root,path.join(root,'../tanabisport')]}),{Window}=await import(pathToFileURL(mod));
 async function fixture(seed=false){
  const w=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/',settings:{disableJavaScriptFileLoading:true}});Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.TextEncoder=TextEncoder;w.console=console;w.HTMLElement.prototype.scrollIntoView=()=>{};w.document.body.innerHTML='<div id="app"></div>';
  const legacyOrders=JSON.stringify([{...record(),reference:'TS-LEGACY-FAMILY-A'}]),legacyCart=JSON.stringify({items:[{kind:'variant',id:'variant-a',quantity:1,customization:'PRIVATE-FAMILY-A'}]}),orderKey='tsi224:orders:'+PROJECT,cartKey='tsi224:cart:'+PROJECT;
  const local=storage(seed?{[orderKey]:legacyOrders}:{}),session=storage(seed?{[orderKey]:legacyOrders,[cartKey]:legacyCart}:{});Object.defineProperty(w,'localStorage',{value:local});Object.defineProperty(w,'sessionStorage',{value:session});
  let guest=A,authorized=true,store;const pending=new Map(),calls=[],downloads=[],state={view:'shop',cfg:{shop:true},booting:true};w.TSI230Guest={authorized:()=>authorized,token:()=>authorized?guest:''};
  w.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,filename:this.download});};
  function render(){if(store){store.beforeRender();w.document.getElementById('app').innerHTML=store.viewShop();}}
  const edge=async(method,route,payload)=>{calls.push({method,route,payload,guest});if(pending.has(route)){const d=pending.get(route);pending.delete(route);return d.promise;}
   if(route==='quote')return quote(guest===A?'FOTO PRIVADA A':'FOTO PRIVADA B');
   if(route==='catalog')return {products:[{id:'product-'+guest[0],title:'Producto '+guest[0],active:true}],variants:[],config:{payments_enabled:true,country:'MX'}};
   if(route==='config')return {ready:true,publishable_key:'pk_test_fixture',environment:'staging'};
   if(route==='status'||route==='lookup')return {order:paid()};
   if(route==='download-photo')return {image:'data:image/jpeg;base64,/9j/RE9XTkxPQUQ=',filename:'Tanabi-Sports-701.jpg'};
   throw Error('Ruta inesperada '+route);
  };
  w.eval(fs.readFileSync(path.join(root,'staging/tsi-230-store.js'),'utf8'));store=w.TSIStore224Install({state,esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),me:()=>null,server:'https://'+PROJECT+'.supabase.co',topbar:()=>'',render,photoItems:()=>[{id:guest===A?'701':'702',title:guest===A?'FOTO PRIVADA A':'FOTO PRIVADA B',price:50,folder:'Mi carpeta'}],photoPreview:()=>'<span>Vista protegida</span>',edge,sb:async()=>{throw Error('No se permiten consultas directas');}});render();
  return {w,store,state,local,session,calls,downloads,render,orderKey,cartKey,defer(route){const d=deferred();pending.set(route,d);return d;},switchGuest(token,allowed=true){guest=token;authorized=allowed;render();},close:()=>w.happyDOM.abort()};
 }
 {
  const f=await fixture(true);assert.equal(f.w.document.body.textContent.includes('TS-LEGACY-FAMILY-A'),false,'No restaura referencias de otra familia');assert.equal(f.w.document.body.textContent.includes('PRIVATE-FAMILY-A'),false,'No restaura personalización de otra familia');assert.equal(f.store.diagnostics().cart.length,0);
  for(const s of [f.local,f.session]){assert.equal(s.reads.filter(k=>k===f.orderKey||k===f.cartKey).length,0,'Elimina claves antiguas sin leer sus datos');assert.equal(s.values.has(f.orderKey),false);assert.equal(s.values.has(f.cartKey),false);}
  f.w.document.querySelector('[data-st-action="photo"]').click();await until(()=>!f.store.diagnostics().quoting,'carrito en memoria');assert.equal(f.store.diagnostics().cart.length,1);await f.store.readStatus(record());
  for(const s of [f.local,f.session])assert.equal(s.writes.filter(k=>k===f.orderKey||k===f.cartKey).length,0,'No persiste carrito ni tokens de pedidos');
  f.switchGuest(B);assert.equal(f.store.diagnostics().cart.length,0);assert.equal(f.store.diagnostics().order,null);assert.ok(!f.w.document.body.textContent.includes('TS-AAAAAAAAAAAAAAAA'));assert.ok(!f.w.document.body.textContent.includes('FOTO PRIVADA A'));await f.close();
 }
 {
  const f=await fixture(),d=f.defer('quote');f.w.document.querySelector('[data-st-action="photo"]').click();await until(()=>f.calls.some(c=>c.route==='quote'),'cotización pendiente');f.switchGuest(B);d.resolve(quote('PRIVADO SOLO A'));await pause(30);assert.equal(f.store.diagnostics().quote,null,'Respuesta tardía de cotización A no entra en B');assert.equal(f.store.diagnostics().cart.length,0);assert.ok(!f.w.document.body.textContent.includes('PRIVADO SOLO A'));await f.close();
 }
 {
  const f=await fixture(),d=f.defer('status'),pending=f.store.readStatus(record());await until(()=>f.calls.some(c=>c.route==='status'),'estado pendiente');f.switchGuest(B);d.resolve({order:paid()});await pending;assert.equal(f.store.diagnostics().order,null,'Respuesta tardía del pedido A no entra en B');assert.ok(!f.w.document.body.textContent.includes('TS-AAAAAAAAAAAAAAAA'));await f.close();
 }
 {
  const f=await fixture(),d=f.defer('catalog'),pending=f.store.publicLoad(true);await until(()=>f.calls.some(c=>c.route==='catalog'),'catálogo pendiente');f.switchGuest(B);d.resolve({products:[{id:'secret-a',title:'PRODUCTO PRIVADO A',active:true}],variants:[],config:{}});await pending;assert.equal(f.store.diagnostics().products.some(p=>p.id==='secret-a'),false,'Catálogo tardío A no entra en B');await f.store.publicLoad(true);assert.equal(f.store.diagnostics().products[0].id,'product-b','Catálogo inicial B conserva la identidad correcta');await f.close();
 }
 {
  const f=await fixture();await f.store.readStatus(record());let button=f.w.document.querySelector('[data-st-action="download-photo"]');assert.ok(button,'Pedido pagado muestra descarga autorizada');assert.ok(!f.w.document.querySelector('a[href*="delivery"]'));button.click();await until(()=>f.downloads.length===1,'descarga propia');assert.match(f.downloads[0].href,/^data:image\/jpeg;base64,\/9j/);assert.equal(f.downloads[0].filename,'Tanabi-Sports-701.jpg');
  const d=f.defer('download-photo');f.w.document.querySelector('[data-st-action="download-photo"]').click();await until(()=>f.calls.filter(c=>c.route==='download-photo').length===2,'descarga pendiente');f.switchGuest(B);d.resolve({image:'data:image/jpeg;base64,/9j/UFJJVkFETw==',filename:'private-a.jpg'});await pause(30);assert.equal(f.downloads.length,1,'Cambio de familia impide descarga tardía');assert.equal(f.store.diagnostics().order,null);await f.close();
 }
 {
  const f=await fixture();await f.store.readStatus(record());const d=f.defer('download-photo');f.w.document.querySelector('[data-st-action="download-photo"]').click();await until(()=>f.calls.some(c=>c.route==='download-photo'),'descarga revocada pendiente');f.switchGuest('',false);d.resolve({image:'data:image/jpeg;base64,/9j/UFJJVkFETw==',filename:'private-a.jpg'});await pause(30);assert.equal(f.downloads.length,0,'Revocación impide descarga tardía');await f.close();
 }
 // Test the actual index adapter separately, including the async Auth-refresh gap.
 const html=fs.readFileSync(path.join(root,'staging/index.html'),'utf8'),start=html.indexOf('async function tsi230StoreRequest('),end=html.indexOf('\nvar RULES230=',start);assert.ok(start>=0&&end>start,'Adaptador de staging encontrado');const adapter=html.slice(start,end);
 async function transport(){const w=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/'});w.AUTH={access:'team-access',uid:'staff-a'};w.me=()=>w.AUTH.uid?{id:w.AUTH.uid,role:'foto'}:null;w.SBK='sb_publishable_fixture';w.SBU='https://'+PROJECT+'.supabase.co';let guest=A;w.GUEST230={token:()=>guest};w.ensureToken=async()=>{};w.fetch=async()=>new Response(JSON.stringify({ok:true}),{status:200});w.eval(adapter);return {w,switchGuest:v=>guest=v,close:()=>w.happyDOM.abort()};}
 {
  const f=await transport(),d=deferred();let fetches=0;f.w.ensureToken=()=>d.promise;f.w.fetch=async()=>{fetches++;return Response.json({ok:true});};const pending=f.w.tsi230StoreRequest('POST','status',{order_id:ORDER});f.switchGuest(B);d.resolve();await assert.rejects(pending,'Cambio de familia durante refresh rechaza payload anterior');assert.equal(fetches,0,'No envía payload A con token B');await f.close();
 }
 {
  const f=await transport(),d=deferred();f.w.AUTH.access='';f.w.fetch=async()=>d.promise;const pending=f.w.tsi230StoreRequest('POST','lookup',{order_reference:'TS-AAAAAAAAAAAAAAAA',email:'synthetic@example.invalid'});f.switchGuest(B);d.resolve(Response.json({order:paid()}));await assert.rejects(pending,'Descarta respuesta si la familia cambió durante la red');await f.close();
 }
 {
  const f=await transport(),d=deferred();f.w.ensureToken=()=>d.promise;let fetches=0;f.w.fetch=async()=>{fetches++;return Response.json({ok:true});};const pending=f.w.tsi230StoreRequest('GET','catalog');f.w.AUTH.uid='staff-b';d.resolve();await assert.rejects(pending,'Cambio de cuenta durante refresh rechaza la solicitud');assert.equal(fetches,0);await f.close();
 }
 {
  const f=await transport();let headers;f.w.fetch=async(url,opt)=>{headers=opt.headers;return Response.json({ok:true});};assert.equal((await f.w.tsi230StoreRequest('GET','catalog')).ok,true);assert.equal(headers['x-tsi-guest-token'],A);await f.close();
 }
 // Exercise the real shared guest/portfolio transport. Mutation payloads must
 // never be sent under a different staff account after refreshing Auth.
 const guestStart=html.indexOf('async function tsi230GuestRequest('),guestEnd=html.indexOf('\nasync function tsi230StoreRequest(',guestStart);
 assert.ok(guestStart>=0&&guestEnd>guestStart,'Adaptador real de invitados encontrado');
 const guestAdapter=html.slice(guestStart,guestEnd);
 async function guestTransport(){const f=await transport();f.w.eval(guestAdapter);return f;}
 {
  const f=await guestTransport();let fetches=0,refreshes=0;
  f.w.ensureToken=async()=>{refreshes++;};f.w.fetch=async()=>{fetches++;return Response.json({ok:true});};
  await assert.rejects(f.w.tsi230GuestRequest({action:'portfolio/publish',payload:{title:'A'}},'',{expectedOwner:'staff-other:foto'}));
  assert.equal(fetches,0,'Propietario esperado distinto no envía la mutación');assert.equal(refreshes,0);await f.close();
 }
 for(const change of ['staff','guest']){
  const f=await guestTransport(),d=deferred();let fetches=0;
  f.w.ensureToken=()=>d.promise;f.w.fetch=async()=>{fetches++;return Response.json({ok:true});};
  const pending=f.w.tsi230GuestRequest({action:'portfolio/publish',payload:{title:'A'}},'',{expectedOwner:'staff-a:foto'});
  if(change==='staff')f.w.AUTH.uid='staff-b';else f.switchGuest(B);
  d.resolve();await assert.rejects(pending,'Cambio '+change+' durante refresh rechaza mutación anterior');assert.equal(fetches,0);await f.close();
 }
 for(const change of ['staff','guest']){
  const f=await guestTransport(),d=deferred();f.w.AUTH.access='';f.w.fetch=async()=>d.promise;
  const pending=f.w.tsi230GuestRequest({action:'portfolio/admin-state'},'',{expectedOwner:'staff-a:foto'});
  if(change==='staff')f.w.AUTH.uid='staff-b';else f.switchGuest(B);
  d.resolve(Response.json({items:[{title:'PRIVATE A'}]}));await assert.rejects(pending,'Descarta respuesta privada '+change+' después de cambiar identidad');await f.close();
 }
 {
  const f=await guestTransport();let fetches=0;f.w.fetch=async()=>{fetches++;return Response.json({ok:true});};
  await assert.rejects(f.w.tsi230GuestRequest({action:'list'},B),'No envía token distinto al permiso actual');assert.equal(fetches,0);await f.close();
 }
 {
  const f=await guestTransport();let headers;
  f.w.fetch=async(url,opt)=>{headers=opt.headers;return Response.json({ok:true});};
  assert.equal((await f.w.tsi230GuestRequest({action:'list'},A)).ok,true);
  assert.equal(headers['x-tsi-guest-token'],A);assert.equal(headers.Authorization,'Bearer team-access');await f.close();
 }
 for(const action of ['portfolio/list','portfolio/image']){
  const f=await guestTransport(),d=deferred();let headers,refreshes=0;
  f.w.ensureToken=async()=>{refreshes++;throw Error('Una lectura pública no necesita Auth');};
  f.w.fetch=async(url,opt)=>{headers=opt.headers;return d.promise;};
  const pending=f.w.tsi230GuestRequest({action});f.w.AUTH.uid='staff-b';f.switchGuest(B);
  d.resolve(Response.json({items:[]}));assert.deepEqual(JSON.parse(JSON.stringify(await pending)),{items:[]});
  assert.equal(refreshes,0);assert.equal(headers.Authorization,undefined,'Portafolio público no envía JWT de personal');
  assert.equal(headers['x-tsi-guest-token'],undefined,'Portafolio público no envía credencial de familia');await f.close();
 }
 // me() is backed by S.meId in the real application, independently of
 // AUTH.uid. A late refresh must not mix a visible account with another JWT.
 for(const kind of ['store','guest']){
  const invoke=f=>kind==='store'?f.w.tsi230StoreRequest('POST','status',{order_id:ORDER}):f.w.tsi230GuestRequest({action:'portfolio/admin-state'},'',{expectedOwner:'staff-a:foto'});
  {
   const f=await guestTransport();f.w.me=()=>({id:'staff-a',role:'foto'});f.w.AUTH.uid='staff-b';let fetches=0;
   f.w.fetch=async()=>{fetches++;return Response.json({ok:true});};
   await assert.rejects(invoke(f),kind+': cuenta visible y Auth distinta se rechazan');assert.equal(fetches,0);await f.close();
  }
  {
   const f=await guestTransport(),d=deferred();f.w.me=()=>({id:'staff-a',role:'foto'});f.w.ensureToken=()=>d.promise;let fetches=0;
   f.w.fetch=async()=>{fetches++;return Response.json({ok:true});};const pending=invoke(f);f.w.AUTH.uid='staff-b';d.resolve();
   await assert.rejects(pending,kind+': Auth distinta tras refresco se rechaza aunque me no cambie');assert.equal(fetches,0);await f.close();
  }
  {
   const f=await guestTransport(),d=deferred();f.w.me=()=>({id:'staff-a',role:'foto'});f.w.ensureToken=async()=>{};f.w.fetch=async()=>d.promise;
   const pending=invoke(f);await pause(0);f.w.AUTH.uid='staff-b';d.resolve(Response.json({items:[{title:'PRIVATE A'}]}));
   await assert.rejects(pending,kind+': respuesta con Auth cambiada no entra en cuenta visible anterior');await f.close();
  }
 }
 console.log('Store230 seguridad UI: memoria sin legados, familias, respuestas tardías, descargas y transportes reales de Tienda/invitados/portafolio con Auth verificados');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
