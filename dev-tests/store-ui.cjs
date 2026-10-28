const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/tsi-store.js'),'utf8');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<150;i++){if(check())return;await pause(10);}throw Error('No se completó: '+label);}
async function environment(options={}){
 const {Window}=await import('happy-dom'),window=new Window({url:options.url||'https://patricioontiverosdz-hue.github.io/tanabisport/staging/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});window.TextEncoder=TextEncoder;window.console=console;window.confirm=()=>true;window.document.body.innerHTML='<div id="app"></div>';window.HTMLElement.prototype.scrollIntoView=()=>{};
 let role=options.role||null,status=options.status||'awaiting_payment',deferredAdmin=null;
 const buyerOrders=options.buyerOrders||{},pendingStatuses=[];
 const state={booting:!!options.booting,view:role?'dash':'shop',tab:'tienda',cfg:{shop:true},cart:[],shop:{items:[{id:701,title:'Foto de prueba',folder:'#12 — Demo',price:50,img:'protected-photo'}]}};
 const data={products:[{id:'p1',slug:'gorra',category:'merch',kind:'physical',title:'Gorra pública',description:'Producto público',image:'data:image/jpeg;base64,cHVibGlj',active:true,personalization:true,version:1},{id:'draft',slug:'draft',category:'merch',kind:'physical',title:'Borrador secreto',description:'No debe publicarse',image:'',active:false,personalization:false,version:1}],variants:[{id:'v1',product_id:'p1',title:'Negra',sku:'CAP',price_cents:25000,stock:10,active:true,version:1}],config:{id:'shop',shipping_fee_cents:10000,payments_enabled:!!options.stripeReady,version:1},orders:[{id:'private-order',reference:'TS-PRIVATE',status:'paid',fulfillment:'unfulfilled',email:'private@example.invalid',total_cents:5000,items:[],version:1}]};
 const clone=v=>JSON.parse(JSON.stringify(v)),calls=[],manual=[],stripeCounts={init:0,mount:0,destroy:0};let stripeOptions;
 const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let store;
 function render(){if(!store)return;store.beforeRender();window.document.getElementById('app').innerHTML=state.view==='shop'?store.viewShop():store.adminTab('<div id="legacy-photos">Fotos y protecciones existentes</div>');store.afterRender();}
 function quote(cart){let physical=false;const items=cart.map(row=>{assert.deepEqual(Object.keys(row).sort(),(row.customization?['customization','id','kind','quantity']:['id','kind','quantity']).sort(),'El navegador solo envía identificadores, cantidades y personalización');if(row.kind==='photo'){assert.equal(row.id,'701');assert.equal(row.quantity,1);return {kind:'photo',id:'701',title:'Foto de prueba',variant:'',quantity:1,unit_price_cents:5000,line_total_cents:5000,physical:false};}const v=data.variants.find(v=>v.id===row.id),p=v&&data.products.find(p=>p.id===v.product_id);assert.ok(v&&p&&p.active);assert.ok(row.quantity>=1&&row.quantity<=20);physical=physical||p.kind==='physical';return {kind:'variant',id:row.id,title:p.title,variant:v.title,quantity:row.quantity,unit_price_cents:v.price_cents,line_total_cents:v.price_cents*row.quantity,physical:p.kind==='physical',customization:row.customization||''};});const subtotal=items.reduce((n,i)=>n+i.line_total_cents,0),shipping=physical?data.config.shipping_fee_cents:0;return {items,subtotal_cents:subtotal,shipping_cents:shipping,total_cents:shipping==null?null:subtotal+shipping,currency:'MXN',requires_shipping:physical,shipping_configured:!physical||shipping!=null,payments_enabled:data.config.payments_enabled};}
 async function sb(method,url,body){calls.push({surface:'db',method,url,body:clone(body||{})});
  if(url.includes('/tsi224_store_products?'))return clone(data.products);
  if(url.includes('/tsi224_store_variants?'))return clone(data.variants);
  if(url.includes('/tsi224_store_config?'))return [clone(data.config)];
  if(url==='/rest/v1/rpc/tsi224_store_quote')return quote(body.cart);
  if(url==='/rest/v1/rpc/tsi224_store_admin_state'){if(role!=='admin')throw Object.assign(Error('Sin permiso'),{status:403});if(options.delayAdmin)return new Promise(resolve=>{deferredAdmin=()=>resolve(clone(data));});return clone(data);}
  if(url==='/rest/v1/rpc/tsi224_store_admin_command'){if(role!=='admin')throw Object.assign(Error('Sin permiso'),{status:403});assert.ok(body.request_id);assert.ok(!('status'in body.payload),'El administrador no puede inventar el pago');if(body.operation==='product.save'){const p=body.payload,at=data.products.findIndex(v=>v.id===p.id);const row={...clone(p),version:p.expected_version+1};if(at<0)data.products.push(row);else data.products[at]=row;return row;}if(body.operation==='variant.save'){data.variants.push({...clone(body.payload),version:1});return {};}if(body.operation==='config.save'){data.config={...data.config,...clone(body.payload),version:data.config.version+1};return {};}if(body.operation==='order.fulfill'){const o=data.orders.find(o=>o.id===body.payload.id);assert.equal(o.status,'paid');Object.assign(o,body.payload,{version:o.version+1});return {};}throw Error('Comando no implementado');}
  throw Error('Llamada de prueba no permitida: '+url);
 }
 async function edge(method,url,body){calls.push({surface:'edge',method,url,body:clone(body||{})});
  if(url==='config')return {ready:!!options.stripeReady,publishable_key:options.stripeReady?'pk_test_fixture':null,environment:'staging',currency:'MXN'};
  if(url==='quote')return quote(body.cart);
  if(url==='create-session'){assert.ok(options.stripeReady);assert.match(body.access_token,/^[a-f0-9]{64}$/);assert.ok(body.request_id);assert.ok(body.email.includes('@'));quote(body.cart);if(options.checkoutOrder)buyerOrders['buyer-order']={...clone(options.checkoutOrder),access_token:body.access_token};if(options.rejectCheckout){options.rejectCheckout=false;throw Object.assign(Error('Cancelado sin cobro'),{status:409,body:{code:'checkout_rejected'}});}if(options.networkFailOnce){options.networkFailOnce=false;throw Object.assign(Error('Conexión interrumpida'),{status:500,body:{code:'internal_error'}});}return {order_id:'buyer-order',reference:'TS-BUYER',session_id:'cs_test_fixture',client_secret:options.createStatus?null:'cs_test_fixture_secret',status:options.createStatus||'awaiting_payment'};}
  if(url==='status'){
   assert.match(body.access_token,/^[a-f0-9]{64}$/);
   const fixture=buyerOrders[body.order_id];
   if(Object.keys(buyerOrders).length){assert.ok(fixture,'Solo se consulta un pedido autorizado en esta prueba');assert.equal(body.access_token,fixture.access_token,'Cada pedido utiliza su propia autorización');}
   else assert.equal(body.order_id,'buyer-order');
   if(options.delayStatus)await new Promise(resolve=>pendingStatuses.push(resolve));
   if(options.statusError)throw Object.assign(Error('No se pudo consultar el pedido. Intenta nuevamente.'),{status:503});
   const order={id:body.order_id,reference:'TS-BUYER',status,fulfillment:'unfulfilled',items:quote(store.diagnostics().cart.length?store.diagnostics().cart:[{kind:'photo',id:'701',quantity:1}]).items,total_cents:5000,delivery_link:status==='paid'?'https://example.invalid/delivery':'',version:1,...clone(fixture||{})};
   delete order.access_token;return {order};
  }
  throw Error('Edge no permitido: '+url);
 }
 window.Stripe=key=>{assert.equal(key,'pk_test_fixture');return {initEmbeddedCheckout:async opts=>{stripeCounts.init++;stripeOptions=opts;assert.equal(await opts.fetchClientSecret(),'cs_test_fixture_secret');return {mount:selector=>{stripeCounts.mount++;const frame=window.document.createElement('iframe');frame.name='stripe-fixture';window.document.querySelector(selector).appendChild(frame);},destroy:()=>{stripeCounts.destroy++;window.document.querySelector('iframe[name="stripe-fixture"]')?.remove();}};}};};
 if(options.saved)for(const [key,value,storage]of options.saved)(storage==='local'?window.localStorage:window.sessionStorage).setItem(key,value);
 window.eval(source);
 store=window.TSIStore224Install({state,me:()=>role?{id:'user-'+role,role}:null,esc,sb,edge,server:'https://nksqpoigywfegcbvfhoa.supabase.co',render,topbar:()=>'<header>Tanabi Sports</header>',photoPreview:item=>'<div class="protected-photo" data-photo="'+item.id+'">'+esc(item.title)+'</div>',loadShop:async()=>{},manualPhotoOrder:async payload=>{manual.push(payload);return {id:901};}});
 render();if(state.view==='shop')await until(()=>store.diagnostics().loaded,'carga pública');
 const click=(action,attrs='')=>{const el=window.document.querySelector('[data-st-action="'+action+'"]'+attrs);assert.ok(el,'Control '+action+attrs);el.click();};
 const fill=(id,value,type='input')=>{const el=window.document.getElementById(id);assert.ok(el,'Campo '+id);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new window.Event(type,{bubbles:true}));};
 const storageSnapshot=(storage,kind)=>Array.from({length:storage.length},(_,i)=>{const key=storage.key(i);return kind?[key,storage.getItem(key),kind]:[key,storage.getItem(key)];});
 return {window,state,data,store,calls,manual,stripeCounts,click,fill,render,buyerOrders,role:value=>{role=value;state.view=value?'dash':'shop';render();},setStatus:value=>status=value,setCreateStatus:value=>options.createStatus=value,setStatusError:value=>options.statusError=value,resolveStatuses:async()=>{options.delayStatus=false;pendingStatuses.splice(0).forEach(resolve=>resolve());await pause(0);},complete:()=>stripeOptions.onComplete(),resolveAdmin:()=>deferredAdmin&&deferredAdmin(),saved:()=>[...storageSnapshot(window.localStorage,'local'),...storageSnapshot(window.sessionStorage)],localSaved:()=>storageSnapshot(window.localStorage,'local'),close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}
async function main(){
 let env=await environment();try{
  const {store,click,fill,window}=env;assert.equal(env.state.cart.length,0,'El carrito antiguo permanece separado');assert.ok(window.document.body.textContent.includes('Fotos'));assert.ok(!window.document.body.textContent.includes('Borrador secreto'));
  click('photo','[data-id="701"]');await until(()=>store.diagnostics().quote?.items.length===1,'precio foto confirmado');assert.equal(store.diagnostics().quote.total_cents,5000);assert.equal(env.state.cart.length,0);assert.ok(!env.saved().find(([k])=>k.includes(':cart:'))[1].includes('price'));
  fill('st224-name','Cliente');fill('st224-contact','8112345678');click('manual-order');await until(()=>env.manual.length===1&&!store.diagnostics().busy,'pedido manual');assert.equal(env.manual[0].quote.total_cents,5000);assert.equal(store.diagnostics().cart.length,0);assert.ok(window.document.body.textContent.includes('coordinar el pago'));
  click('category','[data-category="merch"]');assert.ok(window.document.body.textContent.includes('Gorra pública'));assert.ok(!window.document.body.textContent.includes('Borrador secreto'));click('detail','[data-id="p1"]');fill('st224-customization','Ana');fill('st224-quantity','2');click('add-variant');await until(()=>store.diagnostics().quote?.requires_shipping,'carrito físico');assert.equal(store.diagnostics().quote.total_cents,60000);assert.ok(window.document.body.textContent.includes('domicilio'));assert.ok(!window.document.body.textContent.toLowerCase().includes('recoger'));assert.equal(window.document.querySelector('[data-st-action="checkout"]'),null,'Sin tarjeta falsa si Stripe no está listo');assert.equal(window.document.querySelector('input[autocomplete="cc-number"]'),null);
  const reopened=await environment({saved:env.saved()});try{await reopened.store.quoteCart();assert.equal(reopened.store.diagnostics().cart[0].customization,'Ana');}finally{await reopened.close();}
 }finally{await env.close();}
 env=await environment({role:'admin'});try{
  assert.ok(env.window.document.getElementById('legacy-photos'));env.click('admin-tab','[data-st-tab="products"]');await until(()=>env.store.diagnostics().admin,'administración');assert.ok(env.window.document.body.textContent.includes('Borrador secreto'));
  env.click('toggle-product','[data-id="draft"]');assert.ok(env.store.diagnostics().adminError.includes('portada'));assert.equal(env.calls.filter(c=>c.body?.operation==='product.save').length,0,'No publicar un borrador incompleto');
  env.click('new-product');env.fill('st224-product-title','Producto nuevo');env.click('save-product');await until(()=>env.data.products.some(p=>p.title==='Producto nuevo')&&!env.store.diagnostics().busy,'guardar borrador');const p=env.data.products.find(p=>p.title==='Producto nuevo');assert.equal(p.active,false);assert.equal(p.kind,'physical');
  env.click('admin-tab','[data-st-tab="orders"]');assert.ok(env.window.document.body.textContent.includes('private@example.invalid'));env.role('editora');assert.ok(env.window.document.getElementById('legacy-photos'));assert.equal(env.window.document.querySelector('[data-st-action="admin-tab"]'),null);assert.equal(env.store.diagnostics().admin,null);assert.ok(!env.window.document.body.textContent.includes('private@example.invalid'));
 }finally{await env.close();}
 env=await environment({stripeReady:true});try{
  env.click('photo','[data-id="701"]');await until(()=>env.store.diagnostics().quote,'cotización Stripe');env.fill('st224-email','buyer@example.invalid');env.click('checkout');await until(()=>env.stripeCounts.mount===1&&!env.store.diagnostics().busy,'iframe de pago');
  const iframe=env.window.document.querySelector('iframe[name="stripe-fixture"]');assert.ok(iframe);for(let i=0;i<5;i++)env.render();assert.equal(env.stripeCounts.mount,1);assert.equal(env.window.document.querySelector('iframe[name="stripe-fixture"]'),iframe,'El iframe sobrevive renders normales');assert.equal(env.store.diagnostics().cart.length,1,'No vaciar carrito con un pago pendiente');
  env.complete();await until(()=>env.store.diagnostics().order?.status==='awaiting_payment','estado pendiente');assert.equal(env.store.diagnostics().cart.length,1);assert.equal(env.window.document.querySelector('a[href="https://example.invalid/delivery"]'),null,'No entregar archivo antes del pago');
  env.setStatus('paid');await env.store.readStatus();await until(()=>env.store.diagnostics().order?.status==='paid','confirmación desde servidor');assert.equal(env.store.diagnostics().cart.length,0);assert.equal(env.store.diagnostics().paymentActive,false);assert.ok(env.window.document.body.textContent.includes('Entrega: Pendiente de preparación'),'El comprobante pagado muestra una etiqueta de entrega comprensible');assert.ok(!env.window.document.body.textContent.includes('unfulfilled'));assert.ok(env.window.document.querySelector('a[href="https://example.invalid/delivery"]'));assert.ok(!env.window.location.href.includes('access_token'));assert.equal(env.window.document.querySelector('input[autocomplete="cc-number"]'),null);
 }finally{await env.close();}
 for(const terminal of ['paid','expired','failed','complete']){
  const expected=terminal==='complete'?'awaiting_payment':terminal;
  env=await environment({stripeReady:true,createStatus:terminal,status:expected});try{
   env.click('photo','[data-id="701"]');await until(()=>env.store.diagnostics().quote,'cotización terminal');env.fill('st224-email','buyer@example.invalid');env.click('checkout');await until(()=>env.store.diagnostics().order?.status===expected&&!env.store.diagnostics().busy,'reconciliar sesión sin client_secret '+terminal).catch(error=>{const d=env.store.diagnostics();console.error({terminal,orderStatus:d.order&&d.order.status,error:d.error,busy:d.busy,createCalls:env.calls.filter(c=>c.url==='create-session').length,statusCalls:env.calls.filter(c=>c.url==='status').length});throw error;});
   assert.equal(env.stripeCounts.init,0,'No montar un pago que ya terminó');assert.equal(env.store.diagnostics().error,'');
   const record=JSON.parse(env.saved().find(([key])=>key.includes(':orders:'))[1])[0];
   if(terminal==='paid'){assert.equal(env.store.diagnostics().cart.length,0);assert.equal(record.cleared,true);}
   else if(['expired','failed'].includes(terminal)){
    assert.equal(env.store.diagnostics().cart.length,1);assert.equal(record.closed,true,'Un estado terminal verificado cierra el intento');
    const first=env.calls.find(call=>call.url==='create-session').body.request_id;env.setCreateStatus(null);env.setStatus('awaiting_payment');env.click('checkout');await until(()=>env.stripeCounts.mount===1,'nuevo intento después del vencimiento');assert.notEqual(env.calls.filter(call=>call.url==='create-session')[1].body.request_id,first);
   }else{assert.equal(env.store.diagnostics().cart.length,1);assert.notEqual(record.closed,true,'Una sesión completa con pago pendiente no permite inventar un nuevo intento');}
  }finally{await env.close();}
 }
 for(const rejection of [true,false]){
  env=await environment({stripeReady:true,rejectCheckout:rejection,networkFailOnce:!rejection});try{
   env.click('photo','[data-id="701"]');await until(()=>env.store.diagnostics().quote,'cotización para reintento');env.fill('st224-email','buyer@example.invalid');env.click('checkout');await until(()=>env.calls.some(call=>call.url==='create-session')&&!env.store.diagnostics().busy&&!!env.store.diagnostics().error,'primer intento fallido');
   const first=env.calls.find(call=>call.url==='create-session').body.request_id,record=JSON.parse(env.saved().find(([key])=>key.includes(':orders:'))[1])[0];assert.equal(record.closed===true,rejection,'Solo el rechazo definitivo verificado cierra el intento');
   env.click('checkout');await until(()=>env.stripeCounts.mount===1,'reintento de checkout');const second=env.calls.filter(call=>call.url==='create-session')[1].body.request_id;if(rejection)assert.notEqual(second,first);else assert.equal(second,first,'La caída de red conserva la idempotencia');
  }finally{await env.close();}
 }
 const returnCart=[{kind:'photo',id:'701',quantity:1}],returnRecord={request_id:crypto.randomUUID(),access_token:'a'.repeat(64),order_id:'buyer-order',session_id:'cs_test_fixture',cart:returnCart};
 env=await environment({booting:true,stripeReady:true,status:'paid',url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/?session_id=cs_test_fixture',saved:[['tsi224:cart:nksqpoigywfegcbvfhoa',JSON.stringify({version:1,items:returnCart})],['tsi224:orders:nksqpoigywfegcbvfhoa',JSON.stringify([returnRecord])]]});try{
  for(let i=0;i<3;i++)env.render();assert.equal(env.calls.filter(c=>c.url==='status').length,0,'El retorno espera a que termine el inicio de sesión');
  env.role('cliente');assert.equal(env.calls.filter(c=>c.url==='status').length,0,'Cambiar al usuario final durante el inicio no consume el retorno');
  env.state.booting=false;env.render();await until(()=>env.store.diagnostics().order?.status==='paid','retorno tras completar inicio de sesión');
  for(let i=0;i<3;i++)env.render();assert.equal(env.calls.filter(c=>c.url==='status').length,1,'El retorno se consulta una sola vez con el usuario final');assert.equal(env.store.diagnostics().cart.length,0);assert.ok(env.window.document.body.textContent.includes('Entrega: Pendiente de preparación'));
 }finally{await env.close();}
 const orderKey='tsi224:orders:nksqpoigywfegcbvfhoa',cartKey='tsi224:cart:nksqpoigywfegcbvfhoa';
 const older={request_id:crypto.randomUUID(),access_token:'b'.repeat(64),order_id:'11111111-1111-4111-8111-111111111111',reference:'TS-OLDER',session_id:'cs_test_older',cart:[],cleared:true};
 const latest={request_id:crypto.randomUUID(),access_token:'c'.repeat(64),order_id:'22222222-2222-4222-8222-222222222222',reference:'TS-LATEST',session_id:'cs_test_latest',cart:[],cleared:true};
 const trackedOrders={
  [older.order_id]:{access_token:older.access_token,reference:older.reference,status:'paid',fulfillment:'packing',requires_shipping:true,tracking_carrier:'',tracking_number:'',tracking_url:'',delivery_link:''},
  [latest.order_id]:{access_token:latest.access_token,reference:latest.reference,status:'paid',fulfillment:'shipped',requires_shipping:true,tracking_carrier:'Paquetería de prueba',tracking_number:'GUIA-2026-002',tracking_url:'https://example.invalid/tracking/002',delivery_link:''}
 };
 let persistentOrders;
 env=await environment({saved:[[orderKey,JSON.stringify([older,latest])]],buyerOrders:trackedOrders});try{
  await until(()=>env.store.diagnostics().order?.id===latest.order_id&&!env.store.diagnostics().checking,'recuperar el último pedido sin session_id');
  assert.equal(new URL(env.window.location.href).searchParams.has('session_id'),false);
  assert.equal(env.calls.filter(c=>c.url==='status').length,1,'La recarga consulta una vez el pedido más reciente');
  assert.equal(env.calls.find(c=>c.url==='status').body.access_token,latest.access_token);
  assert.equal(env.store.diagnostics().order.fulfillment,'shipped');
  assert.ok(env.window.document.body.textContent.includes('Paquetería de prueba'),'La paquetería está visible');
  assert.ok(env.window.document.body.textContent.includes('GUIA-2026-002'),'La guía está visible');
  assert.ok(env.window.document.querySelector('a[href="https://example.invalid/tracking/002"]'),'Se puede abrir el seguimiento');
  assert.ok(env.window.document.querySelector('[data-st-action="toggle-orders"]')?.textContent.includes('Mis pedidos'),'Mis pedidos permite volver al historial');
  env.click('toggle-orders');env.click('select-order','[data-id="'+older.order_id+'"]');
  await until(()=>env.store.diagnostics().order?.id===older.order_id&&!env.store.diagnostics().checking,'elegir un pedido anterior');
  assert.equal(env.store.diagnostics().order.fulfillment,'packing');
  assert.equal(env.calls.filter(c=>c.url==='status').at(-1).body.access_token,older.access_token);
  assert.ok(!env.window.document.querySelector('a[href="https://example.invalid/tracking/002"]'),'Un pedido anterior no hereda el enlace de otro');
  assert.equal(env.calls.filter(c=>c.url==='create-session').length,0,'Consultar un pedido no crea pagos');
  persistentOrders=env.localSaved();const stored=JSON.parse(persistentOrders.find(([key])=>key===orderKey)[1]);
  assert.deepEqual(stored.map(row=>row.order_id),[older.order_id,latest.order_id],'Se migran los pedidos de la pestaña a almacenamiento persistente');
  for(const record of stored){assert.ok(record.access_token);assert.ok(record.request_id);}
  assert.ok(!env.window.document.body.innerHTML.includes(latest.access_token),'La autorización no aparece en la interfaz');
  assert.ok(!env.window.location.href.includes(latest.access_token),'La autorización no aparece en la URL');
 }finally{await env.close();}
 env=await environment({saved:persistentOrders,buyerOrders:trackedOrders});try{
  await until(()=>env.store.diagnostics().order?.id===latest.order_id,'recuperar el seguimiento en una pestaña nueva');
  assert.equal(env.store.diagnostics().order.fulfillment,'shipped');
  assert.ok(persistentOrders.every(([, ,storage])=>storage==='local'),'La pestaña nueva recupera pedidos usando solo datos de localStorage');
  assert.equal(env.store.diagnostics().cart.length,0,'El historial persistente no recupera un carrito de otra pestaña');
  trackedOrders[latest.order_id].fulfillment='delivered';env.click('refresh-order');
  await until(()=>env.store.diagnostics().order?.fulfillment==='delivered','consultar una entrega actualizada por administración');
 }finally{await env.close();trackedOrders[latest.order_id].fulfillment='shipped';}
 const untrusted={...latest,status:'paid',fulfillment:'delivered',tracking_number:'GUIA-INVENTADA',tracking_url:'https://example.invalid/invented'};
 env=await environment({saved:[[orderKey,JSON.stringify([untrusted]),'local']],buyerOrders:trackedOrders,delayStatus:true});try{
  await until(()=>env.calls.some(c=>c.url==='status'),'comprobación del pedido guardado');
  assert.equal(env.store.diagnostics().order,null,'Un registro del navegador no confirma el estado del pedido');
  assert.ok(!env.window.document.body.textContent.includes('GUIA-INVENTADA'),'No mostrar una guía guardada como estado válido');
  env.resolveStatuses();await until(()=>env.store.diagnostics().order?.fulfillment==='shipped','utilizar el estado confirmado por servidor');
 }finally{env.resolveStatuses();await env.close();}
 env=await environment({saved:[[orderKey,JSON.stringify([untrusted]),'local']],buyerOrders:trackedOrders,statusError:true});try{
  await until(()=>env.calls.some(c=>c.url==='status')&&env.window.document.querySelector('.st224-order-status [role="alert"]'),'fallo al recuperar estado');
  assert.equal(env.store.diagnostics().order,null,'La falta de conexión no inventa una confirmación');
  assert.ok(!env.window.document.body.textContent.includes('GUIA-INVENTADA'));
  env.setStatusError(false);env.click('refresh-order');
  await until(()=>env.store.diagnostics().order?.id===latest.order_id,'reintentar consulta de seguimiento');
  assert.equal(env.store.diagnostics().order.fulfillment,'shipped');
 }finally{await env.close();}
 env=await environment({saved:[['tsi224:orders:tantlgswituiwkxfgmsr',JSON.stringify([latest]),'local']]});try{
  assert.equal(env.calls.filter(c=>c.url==='status').length,0,'Los pedidos de producción no se consultan en staging');
  assert.equal(env.store.diagnostics().order,null);
 }finally{await env.close();}
 env=await environment({saved:[[orderKey,JSON.stringify([{...latest,cleared:false}]),'local'],[cartKey,JSON.stringify({version:1,items:returnCart})]],buyerOrders:{[latest.order_id]:{...trackedOrders[latest.order_id],status:'awaiting_payment',fulfillment:null,tracking_url:'',delivery_link:''}}});try{
  await until(()=>env.store.diagnostics().order?.status==='awaiting_payment','recuperar un pago pendiente');
  assert.equal(env.store.diagnostics().cart.length,1,'Recuperar un pago pendiente conserva el carrito');
  assert.equal(env.window.document.querySelector('a[href="https://example.invalid/delivery"]'),null,'Un pago pendiente no habilita la entrega digital');
 }finally{await env.close();}
 env=await environment({saved:[[orderKey,JSON.stringify([older]),'local']],buyerOrders:trackedOrders});try{
  await until(()=>env.store.diagnostics().order?.id===older.order_id,'historial inicial de la primera pestaña');
  env.window.localStorage.setItem(orderKey,JSON.stringify([older,latest]));
  env.click('photo','[data-id="701"]');await until(()=>env.store.diagnostics().quote,'conservar carrito tras un cambio en otra pestaña');
  assert.deepEqual(JSON.parse(env.window.localStorage.getItem(orderKey)).map(record=>record.order_id),[older.order_id,latest.order_id],'Guardar desde una pestaña anterior no borra pedidos agregados en otra');
 }finally{await env.close();}
 env=await environment({saved:[[orderKey,JSON.stringify([{...latest,cart:returnCart,cleared:true,closed:true}]),'local'],[orderKey,JSON.stringify([{...latest,cart:returnCart,cleared:false,closed:false}])],[cartKey,JSON.stringify({version:1,items:returnCart})]],buyerOrders:trackedOrders});try{
  await until(()=>env.store.diagnostics().order?.id===latest.order_id,'recuperar historial con respaldo de pestaña antiguo');
  assert.equal(env.store.diagnostics().cart.length,1,'Un respaldo antiguo no vuelve a descontar una compra ya retirada del carrito');
  const record=JSON.parse(env.window.localStorage.getItem(orderKey))[0];assert.equal(record.cleared,true);assert.equal(record.closed,true,'Un respaldo antiguo no reabre intentos cerrados');
 }finally{await env.close();}
 env=await environment({stripeReady:true,saved:[[orderKey,JSON.stringify([latest]),'local']],buyerOrders:JSON.parse(JSON.stringify(trackedOrders)),checkoutOrder:{reference:'TS-BUYER',status:'awaiting_payment',fulfillment:null,delivery_link:''}});try{
  await until(()=>env.store.diagnostics().order?.id===latest.order_id,'pedido anterior confirmado antes de una nueva compra');
  env.click('photo','[data-id="701"]');await until(()=>env.store.diagnostics().quote,'carrito de nueva compra');env.fill('st224-email','buyer@example.invalid');env.click('checkout');await until(()=>env.stripeCounts.mount===1&&!env.store.diagnostics().busy,'nuevo pago después del historial');
  env.click('leave-payment');
  assert.notEqual(env.store.diagnostics().order?.id,latest.order_id,'Una nueva compra no muestra la confirmación del pedido anterior');
  assert.ok(!env.window.document.querySelector('.st224-order-status')?.textContent.includes('Pago confirmado'),'Salir de un pago pendiente no hereda el pago confirmado anterior');
 }finally{await env.close();}
 env=await environment({stripeReady:true,saved:[[orderKey,JSON.stringify([latest]),'local']],buyerOrders:JSON.parse(JSON.stringify(trackedOrders)),delayStatus:true,checkoutOrder:{reference:'TS-BUYER',status:'awaiting_payment',fulfillment:null,delivery_link:''}});try{
  await until(()=>env.calls.some(c=>c.url==='status'),'consulta lenta del pedido anterior');
  env.click('photo','[data-id="701"]');await until(()=>env.store.diagnostics().quote,'nuevo carrito durante consulta anterior');env.fill('st224-email','buyer@example.invalid');
  const checkout=env.window.document.querySelector('[data-st-action="checkout"]');assert.ok(checkout);
  if(checkout.disabled){await env.resolveStatuses();env.click('checkout');await until(()=>env.stripeCounts.mount===1,'abrir un nuevo pago al terminar el seguimiento');}
  else{env.click('checkout');await until(()=>env.stripeCounts.mount===1,'abrir un nuevo pago con consulta anterior en curso');await env.resolveStatuses();}
  assert.equal(env.store.diagnostics().paymentActive,true,'La respuesta del pedido anterior no cierra un pago nuevo');
  assert.ok(env.window.document.querySelector('iframe[name="stripe-fixture"]'),'El formulario nuevo sigue montado');
 }finally{await env.resolveStatuses();await env.close();}
 env=await environment({role:'admin',delayAdmin:true});try{const pending=env.store.adminLoad(true);await until(()=>env.calls.some(c=>c.url==='/rest/v1/rpc/tsi224_store_admin_state'),'solicitud privada');env.role('editora');env.resolveAdmin();await pending;assert.equal(env.store.diagnostics().admin,null);assert.ok(!env.window.document.body.textContent.includes('private@example.invalid'));}finally{await env.close();}
 console.log('Tienda 2.2.4: catálogo, carrito, roles, pagos y seguimiento persistente tras recarga/nueva pestaña, historial, guía, actualización servidor, reintentos y compras posteriores aprobados (API/Stripe simulados).');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
