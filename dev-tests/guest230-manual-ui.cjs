const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let n=0;n<150;n++){if(check())return;await pause(5);}throw Error('Manual guest UI timeout');}
async function main(){
 const {Window}=await import(pathToFileURL(require.resolve('happy-dom',{paths:[root,path.resolve(root,'../tanabisport')]})).href);
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/'});Object.defineProperty(window,'crypto',{value:webcrypto});
 window.HTMLElement.prototype.scrollIntoView=function(){};window.document.body.innerHTML='<div id="app"></div>';
 let authorized=true,store;const requests=[],state={booting:false,view:'shop',tab:'tienda',cfg:{shop:true},shop:{items:[]},cart:[]};
 const photos=[{id:'synthetic-photo',title:'Synthetic private photo',folder:'Authorized',price:999999,img:'data:image/jpeg;base64,/9j/AAAA'}];
 const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.TSI230Guest={authorized:()=>authorized,token:()=>authorized?'a'.repeat(64):'',open:async()=>false};
 window.Stripe=()=>{throw Error('Manual order must not initialize Stripe');};
 function render(){if(!store)return;store.beforeRender();window.document.getElementById('app').innerHTML=store.viewShop();store.afterRender();}
 async function edge(method,action,payload){requests.push({method,action,payload});assert.equal(authorized,true,'Todas las rutas requieren invitado');
  if(action==='catalog')return {products:[],variants:[],config:{payments_enabled:false,shipping_fee_cents:0}};
  if(action==='config')return {ready:false,environment:'staging'};
  if(action==='quote'){assert.deepEqual(JSON.parse(JSON.stringify(payload.cart)),[{kind:'photo',id:'synthetic-photo',quantity:1}]);return {items:[{kind:'photo',id:'synthetic-photo',title:'Server title',quantity:1,unit_price_cents:5000,line_total_cents:5000,physical:false}],currency:'MXN',subtotal_cents:5000,shipping_cents:0,total_cents:5000,requires_shipping:false,shipping_configured:true,payments_enabled:false};}
  if(action==='manual-order'){assert.deepEqual(Object.keys(payload).sort(),['contact','items','name','note','request_id']);assert.match(payload.request_id,/^[a-f0-9-]{36}$/);assert.deepEqual(Array.from(payload.items),['synthetic-photo']);assert.equal(payload.name,'Synthetic chosen recipient');assert.equal(payload.contact,'8112345678');return {id:1234567890123,reference:'1234567890123',total:50,status:'nuevo'};}
  throw Error('Unexpected edge action '+action);
 }
 try{
  window.eval(fs.readFileSync(path.join(root,'staging/tsi-230-store.js'),'utf8'));
  store=window.TSIStore224Install({state,me:()=>null,esc,server:'https://nksqpoigywfegcbvfhoa.supabase.co',render,photoItems:()=>authorized?photos:[],photoPreview:item=>'<img alt="Synthetic" src="'+esc(item.img)+'">',topbar:()=>'',sb:()=>{throw Error('Guest manual flow must never write Data API');},edge,manualPhotoOrder:payload=>edge('POST','manual-order',payload)});
  render();await until(()=>store.diagnostics().loaded);
  window.document.querySelector('[data-st-action="photo"]').click();await until(()=>!!store.diagnostics().quote&&!store.diagnostics().quoting);
  for(const [id,value]of [['st224-name','Synthetic chosen recipient'],['st224-contact','8112345678'],['st224-note','Synthetic note']]){const el=window.document.getElementById(id);assert.ok(el);el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));}
  window.document.querySelector('[data-st-action="manual-order"]').click();await until(()=>requests.some(r=>r.action==='manual-order')&&!store.diagnostics().busy);
  assert.equal(requests.filter(r=>r.action==='manual-order').length,1);assert.equal(store.diagnostics().cart.length,0);assert.ok(window.document.body.textContent.includes('recibido'));assert.ok(window.document.body.textContent.includes('coordinar el pago'));
  assert.ok(!requests.some(r=>r.action==='create-session'),'Stripe no se llama con pagos deshabilitados');
  console.log('PASS guest230 manual UI: guest-only Edge, Stripe off, no client quote/price, no Data API insert, old manual confirmation.');
 }finally{await window.happyDOM.cancelAsync();window.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
