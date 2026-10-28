const assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const clone=value=>JSON.parse(JSON.stringify(value));
const ORIGIN='https://patricioontiverosdz-hue.github.io',PROJECT='nksqpoigywfegcbvfhoa';
const PHYSICAL='11111111-1111-4111-8111-111111111111',DIGITAL='22222222-2222-4222-8222-222222222222';
const shippingDetails=()=>({name:'Comprador',address:{country:'MX',line1:'Calle de prueba',city:'Monterrey',state:'NL',postal_code:'64000'}});
const validCart=[{kind:'photo',id:'701',quantity:1}],mixedCart=[{kind:'variant',id:PHYSICAL,quantity:1},{kind:'variant',id:DIGITAL,quantity:1}];
let createHandler,verifyStripeSignature,STRIPE_API_VERSION,RETURN_URL;

function fixture(overrides={}){
 let clock=Date.parse('2026-10-27T18:00:00Z'),enabled=true,stock=5,linkFailures=0,wrongAccount=false;
 const runtime={SUPABASE_URL:'https://'+PROJECT+'.supabase.co',SUPABASE_SERVICE_ROLE_KEY:crypto.randomBytes(32).toString('hex'),STRIPE_SECRET_KEY:'rk_test_'+crypto.randomBytes(24).toString('hex'),STRIPE_PUBLISHABLE_KEY:'pk_test_'+crypto.randomBytes(24).toString('hex'),STRIPE_WEBHOOK_SECRET:'whsec_'+crypto.randomBytes(24).toString('hex'),...overrides};
 const orders=new Map(),requests=new Map(),sessions=new Map(),idempotency=new Map(),events=new Set(),rpcCalls=[],stripeCalls=[],createErrors=[];
 let deniedRate=false,sessionMutation=null;
 function quote(cart){
  const items=cart.map(row=>{
   const physical=row.kind==='variant'&&row.id===PHYSICAL,price=row.kind==='photo'&&row.id==='701'?5000:physical?25000:row.id===DIGITAL?10000:null;
   if(!price||physical&&row.quantity>stock)throw Error('unavailable');
   return {kind:row.kind,id:row.id,title:physical?'Playera TS':row.kind==='photo'?'Foto del jugador':'Diseño digital',variant:physical?'Mediana':'',quantity:row.quantity,unit_price_cents:price,line_total_cents:price*row.quantity,physical,customization:row.customization||''};
  });
  const requires_shipping=items.some(item=>item.physical),subtotal_cents=items.reduce((n,item)=>n+item.line_total_cents,0),shipping_cents=requires_shipping?10000:0;
  return {items,subtotal_cents,shipping_cents,total_cents:subtotal_cents+shipping_cents,currency:'MXN',requires_shipping,shipping_configured:true,payments_enabled:enabled};
 }
 function release(order){if(!order.released){stock+=order.items.filter(item=>item.physical).reduce((n,item)=>n+item.quantity,0);order.released=true;}}
 const ok=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 const fetcher=async(url,options={})=>{
  const target=new URL(url);assert.equal(target.origin,'https://'+PROJECT+'.supabase.co','La función nunca envía secretos a otro proyecto');assert.equal(options.headers.Authorization,'Bearer '+runtime.SUPABASE_SERVICE_ROLE_KEY);
  if(target.pathname==='/rest/v1/tsi224_store_config')return ok([{payments_enabled:enabled,country:'MX',shipping_fee_cents:10000}]);
  const name=target.pathname.split('/').at(-1),p=JSON.parse(options.body);rpcCalls.push({name,p:clone(p)});
  try{
   if(name==='tsi224_store_quote')return ok(quote(p.cart));
   if(name==='tsi224_store_checkout_rate')return ok({allowed:!deniedRate,retry_after_seconds:600});
   if(name==='tsi224_store_checkout_prepare'){
    const fingerprint=JSON.stringify({access:p.access_hash,cart:p.cart,email:p.email});
    if(requests.has(p.request_id)){const saved=requests.get(p.request_id);if(saved.fingerprint!==fingerprint)throw Error('request mismatch');return ok(clone(orders.get(saved.id)));}
    if(!enabled)throw Error('disabled');const value=quote(p.cart),id=crypto.randomUUID();
    stock-=value.items.filter(item=>item.physical).reduce((n,item)=>n+item.quantity,0);
    const order={...value,id,reference:'TS-'+String(orders.size+1),status:'pending',fulfillment:'pending',email:p.email,access_hash:p.access_hash,stripe_session_id:null,created_at:new Date(clock).toISOString(),released:false};
    orders.set(id,order);requests.set(p.request_id,{id,fingerprint});return ok(clone(order));
   }
   if(name==='tsi224_store_checkout_link'){
    if(linkFailures){linkFailures--;return new Response('{}',{status:503});}
    const order=orders.get(p.order_id);if(!order||order.stripe_session_id&&order.stripe_session_id!==p.session_id)throw Error('link mismatch');order.stripe_session_id=p.session_id;order.status='awaiting_payment';return ok({linked:true});
   }
   if(name==='tsi224_store_checkout_abort'){
    const order=orders.get(p.order_id);if(!order||order.access_hash!==p.access_hash||order.stripe_session_id)throw Error('cannot abort');if(order.status==='pending'){order.status='failed';release(order);}return ok({aborted:true});
   }
   if(name==='tsi224_store_checkout_status'){
    const order=orders.get(p.order_id);if(!order||order.access_hash!==p.access_hash)throw Error('not owned');return ok({...clone(order),delivery_link:order.status==='paid'?'https://delivery.invalid/owned':'https://delivery.invalid/NOT-PAID'});
   }
   if(name==='tsi224_store_checkout_event'){
    const order=orders.get(p.order_id);if(!order||order.stripe_session_id!==p.session_id||order.total_cents!==p.amount_total||order.currency.toLowerCase()!==p.currency)throw Error('payment mismatch');
    if(p.payment_status==='paid'&&order.requires_shipping){const a=p.shipping?.address;if(a?.country!=='MX'||!a.line1||!a.city||!a.state||!/^\d{5}$/.test(a.postal_code||''))throw Error('shipping incomplete');}
    if(events.has(p.event_id))return ok({duplicate:true});events.add(p.event_id);
    if(p.payment_status==='paid'){if(order.released)order.needs_review=true;order.status='paid';}
    else if(order.status!=='paid'&&p.session_status==='expired'){order.status='expired';release(order);}
    else if(order.status!=='paid'&&p.payment_status==='failed'){order.status='failed';release(order);}
    return ok({processed:true,status:order.status});
   }
   throw Error('Unexpected RPC '+name);
  }catch{return new Response('{}',{status:409});}
 };
 const sdk={
  accounts:{retrieve:async()=>{stripeCalls.push({type:'account'});return {id:wrongAccount?'acct_unapproved':'acct_1UVH3OQ9WFCZJIYG'};}},
  checkout:{sessions:{
   create:async(params,options)=>{
    stripeCalls.push({type:'create',params:clone(params),options:clone(options)});
    assert.equal(params.payment_method_types,undefined,'Métodos dinámicos, sin listas manuales');assert.equal(params.ui_mode,'embedded_page');assert.equal(params.redirect_on_completion,'if_required','El retorno fijo permite métodos que requieren redirección sin sacar las tarjetas del pago embebido');assert.equal(params.return_url,RETURN_URL);
    assert.match(params.integration_identifier,/^tsi_store_staging_[a-z]{8}$/);assert.equal(params.expires_at,Math.floor(Date.parse(orders.get(params.client_reference_id).created_at)/1000)+45*60);
    if(createErrors.length)throw createErrors.shift();
    const fingerprint=JSON.stringify(params),saved=idempotency.get(options.idempotencyKey);
    if(saved){assert.equal(fingerprint,saved.fingerprint,'El reintento conserva exactamente los parámetros');return clone(sessions.get(saved.id));}
    const id='cs_test_'+crypto.randomBytes(16).toString('hex'),amount=params.line_items.reduce((n,item)=>n+item.quantity*item.price_data.unit_amount,0)+(params.shipping_options?.[0]?.shipping_rate_data.fixed_amount.amount||0);
    const session={id,object:'checkout.session',mode:'payment',livemode:false,currency:'mxn',amount_total:amount,status:'open',payment_status:'unpaid',metadata:params.metadata,client_reference_id:params.client_reference_id,client_secret:id+'_secret_'+crypto.randomBytes(16).toString('hex'),customer_email:params.customer_email};
    if(sessionMutation)sessionMutation(session);sessions.set(id,session);idempotency.set(options.idempotencyKey,{id,fingerprint});return clone(session);
   },
   retrieve:async id=>{stripeCalls.push({type:'retrieve',id});if(!sessions.has(id))throw Error('Missing session');return clone(sessions.get(id));}
  }},
  webhooks:{constructEventAsync:async(raw,signature,secret)=>verifyStripeSignature(new TextEncoder().encode(raw),signature,secret,clock,crypto.webcrypto)}
 };
 const handler=createHandler({env:name=>runtime[name],fetch:fetcher,crypto:crypto.webcrypto,now:()=>clock,stripeFactory:(key,options)=>{assert.equal(key,runtime.STRIPE_SECRET_KEY);assert.equal(options.apiVersion,STRIPE_API_VERSION);return sdk;}});
 const endpoint='https://'+PROJECT+'.supabase.co/functions/v1/tsi-store-checkout';
 async function call(action,body={},options={}){
  const method=options.method||'POST',headers={Origin:ORIGIN,'CF-Connecting-IP':'192.0.2.10',...(method==='POST'?{'Content-Type':'application/json'}:{}),...options.headers};
  const request=new Request(endpoint+'?action='+action,{method,headers,...(method==='POST'?{body:options.raw??JSON.stringify(body)}:{})});
  const response=await handler(request),data=await response.json();return {status:response.status,data,headers:response.headers};
 }
 const checkoutBody=(cart=validCart)=>({cart:clone(cart),request_id:crypto.randomUUID(),access_token:crypto.randomBytes(32).toString('hex'),email:'buyer@example.invalid'});
 async function webhook(type,session,options={}){
  const event={id:options.event_id||'evt_'+crypto.randomBytes(12).toString('hex'),object:'event',type,livemode:options.live??false,data:{object:{id:session.id}}};
  const raw=JSON.stringify(event),timestamp=Math.floor(clock/1000)+(options.age||0),signature=crypto.createHmac('sha256',runtime.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');
  const header=options.signature??('t='+timestamp+','+(options.multiple?'v1='+'0'.repeat(64)+',':'')+'v1='+signature);
  const response=await handler(new Request(endpoint+'/webhook',{method:'POST',headers:{'Stripe-Signature':header},body:options.tamper?raw+' ':raw}));return {status:response.status,data:await response.json(),event};
 }
 return {runtime,orders,sessions,events,rpcCalls,stripeCalls,call,checkoutBody,webhook,get stock(){return stock;},advance(ms){clock+=ms;},setEnabled(value){enabled=value;},setWrongAccount(){wrongAccount=true;},failLink(){linkFailures++;},failCreate(error){createErrors.push(error);},denyRate(){deniedRate=true;},mutateSession(fn){sessionMutation=fn;}};
}

async function main(){
 ({createHandler,verifyStripeSignature,STRIPE_API_VERSION,RETURN_URL}=await import(pathToFileURL(path.join(__dirname,'../supabase/functions/tsi-store-checkout/handler.mjs'))));
 // Configuration absence and the production boundary stop before reservations or Stripe calls.
 for(const overrides of [{STRIPE_SECRET_KEY:''},{STRIPE_WEBHOOK_SECRET:''},{STRIPE_PUBLISHABLE_KEY:''},{STRIPE_SECRET_KEY:'sk_live_'+crypto.randomBytes(18).toString('hex')},{SUPABASE_URL:'https://tantlgswituiwkxfgmsr.supabase.co'}]){
  const f=fixture(overrides),config=await f.call('config',{}, {method:'GET'});assert.equal(config.status,200);assert.equal(config.data.ready,false);assert.equal(config.data.publishable_key,null);
  const result=await f.call('create-session',f.checkoutBody());assert.equal(result.status,503);assert.equal(f.orders.size,0);assert.equal(f.stripeCalls.length,0);
  assert.ok(!JSON.stringify(result.data).includes(f.runtime.SUPABASE_SERVICE_ROLE_KEY));
 }
 {
  const f=fixture({STRIPE_SECRET_KEY:''}),quote=await f.call('quote',{cart:validCart});assert.equal(quote.status,200);assert.equal(quote.data.total_cents,5000,'Los precios se pueden consultar sin habilitar pagos');
 }
 {
  const f=fixture(),body=f.checkoutBody();f.setEnabled(false);assert.equal((await f.call('create-session',body)).status,503);assert.equal(f.orders.size,0);
  const wrong=fixture();wrong.setWrongAccount();assert.equal((await wrong.call('create-session',wrong.checkoutBody())).status,503);assert.equal(wrong.orders.size,0);
  const rate=fixture();rate.denyRate();assert.equal((await rate.call('create-session',rate.checkoutBody())).status,429);assert.equal(rate.orders.size,0);
 }
 // Only bounded item identities, quantities and personalization are accepted from the browser.
 {
  const f=fixture();
  for(const cart of [[{...validCart[0],price:1}],[{...validCart[0],quantity:2}],[{...validCart[0],quantity:-1}],[validCart[0],validCart[0]],[],Array.from({length:51},(_,i)=>({kind:'photo',id:String(i),quantity:1}))])assert.equal((await f.call('quote',{cart})).status,400);
  const specialized=[{kind:'variant',id:PHYSICAL,quantity:1,customization:'Ana'},{kind:'variant',id:PHYSICAL,quantity:1,customization:'Luis'}];assert.equal((await f.call('quote',{cart:specialized})).status,200);
  assert.equal((await f.call('quote',{cart:specialized.map(row=>({...row,quantity:11}))})).status,400);
  assert.equal((await f.call('create-session',{...f.checkoutBody(),total_cents:1})).status,400);assert.equal(f.orders.size,0);
  assert.equal((await f.call('status',{order_id:crypto.randomUUID()})).status,400);
  assert.equal((await f.call('quote',{cart:validCart},{headers:{Origin:'https://untrusted.invalid'}})).status,403);
  assert.equal((await f.call('quote',{}, {raw:'{"x":"'+'a'.repeat(70000)+'"}'})).status,413);
 }
 // Prices, shipping and every Stripe amount come from the server snapshot.
 {
  const f=fixture(),body=f.checkoutBody(mixedCart),result=await f.call('create-session',body);assert.equal(result.status,200);assert.equal(f.stock,4);
  const create=f.stripeCalls.find(row=>row.type==='create');assert.equal(create.params.line_items[0].price_data.unit_amount,25000);assert.deepEqual(create.params.shipping_address_collection,{allowed_countries:['MX']});assert.equal(create.params.shipping_options[0].shipping_rate_data.fixed_amount.amount,10000);
  assert.equal(result.data.status,'awaiting_payment');assert.ok(result.data.client_secret);assert.equal(result.data.access_token,undefined);
  const order=f.orders.get(result.data.order_id);assert.equal(order.total_cents,45000);assert.equal(order.email,'buyer@example.invalid');assert.notEqual(order.access_hash,body.access_token);
  const unauthorized=await f.call('status',{order_id:order.id,access_token:crypto.randomBytes(32).toString('hex')});assert.equal(unauthorized.status,404);
  const own=await f.call('status',{order_id:order.id,access_token:body.access_token});assert.equal(own.status,200);assert.equal(own.data.order.access_hash,undefined);assert.equal(own.data.order.delivery_link,undefined,'Una redirección no habilita entrega sin pago');
  assert.equal(own.data.order.fulfillment,'pending','El comprador recibe el campo real de seguimiento logístico');
 }
 {
  const f=fixture();await f.call('create-session',f.checkoutBody());await f.call('create-session',f.checkoutBody());
  const sameDay=f.rpcCalls.filter(row=>row.name==='tsi224_store_checkout_rate').map(row=>row.p.key_hash);
  assert.match(sameDay[0],/^[0-9a-f]{64}$/);assert.equal(sameDay[0],sameDay[1],'El límite agrupa solicitudes del mismo origen durante el día UTC');
  f.advance(24*60*60000);await f.call('create-session',f.checkoutBody());
  const nextDay=f.rpcCalls.filter(row=>row.name==='tsi224_store_checkout_rate').at(-1).p.key_hash;
  assert.notEqual(nextDay,sameDay[0],'El identificador no persiste entre días UTC');
  const anotherSecret=fixture();await anotherSecret.call('create-session',anotherSecret.checkoutBody());
  assert.notEqual(anotherSecret.rpcCalls.find(row=>row.name==='tsi224_store_checkout_rate').p.key_hash,sameDay[0],'La sal secreta del servidor impide hashes de IP globales predecibles');
 }
 {
  const f=fixture(),result=await f.call('create-session',f.checkoutBody()),create=f.stripeCalls.find(row=>row.type==='create');assert.equal(result.status,200);assert.equal(create.params.shipping_options,undefined);assert.equal(create.params.shipping_address_collection,undefined);assert.equal(create.params.phone_number_collection,undefined);
 }
 // An ambiguous link failure is retried against the same Stripe session and reservation.
 {
  const f=fixture(),body=f.checkoutBody(mixedCart);f.failLink();assert.equal((await f.call('create-session',body)).status,409);f.advance(120000);
  const retry=await f.call('create-session',body);assert.equal(retry.status,200);assert.equal(f.orders.size,1);assert.equal(f.sessions.size,1);assert.equal(f.stock,4);
  assert.equal(f.stripeCalls.filter(row=>row.type==='create').length,2);
  assert.equal((await f.call('create-session',{...body,email:'different@example.invalid'})).status,409,'No se reutiliza el request_id para otro comprador');
 }
 {
  const f=fixture(),body=f.checkoutBody(mixedCart);f.failCreate({type:'StripeConnectionError'});assert.equal((await f.call('create-session',body)).status,503);assert.equal(f.stock,4);
  f.advance(16*60000);assert.equal((await f.call('create-session',body)).status,409);assert.equal(f.sessions.size,0);assert.equal(f.stock,4,'La incertidumbre no libera reservas por un temporizador local');
  const rejected=fixture(),rejectedBody=rejected.checkoutBody(mixedCart);rejected.failCreate({type:'StripeInvalidRequestError',statusCode:400});assert.equal((await rejected.call('create-session',rejectedBody)).status,409);assert.equal(rejected.stock,5,'Rechazo definitivo anterior a una sesión libera la reserva');
  assert.equal((await rejected.call('create-session',rejectedBody)).status,409);assert.equal(rejected.sessions.size,0,'Una orden cancelada no recrea un pago después de liberar sus existencias');
 }
 // Webhooks are authenticated before retrieval/writes; duplicate and reordered events stay safe.
 {
  const f=fixture(),body=f.checkoutBody(mixedCart),created=await f.call('create-session',body),session=f.sessions.get(created.data.session_id),before=f.rpcCalls.filter(row=>row.name==='tsi224_store_checkout_event').length;
  for(const options of [{signature:'t=1,v1='+'0'.repeat(64)},{age:-301},{age:301},{tamper:true},{live:true}])assert.equal((await f.webhook('checkout.session.completed',session,options)).status,400);
  assert.equal(f.rpcCalls.filter(row=>row.name==='tsi224_store_checkout_event').length,before);
  session.status='complete';session.payment_status='paid';session.customer_details={email:body.email,name:'Comprador',phone:'8112345678'};session.collected_information={shipping_details:shippingDetails()};
  const paid=await f.webhook('checkout.session.completed',session,{multiple:true,event_id:'evt_paid_once'});assert.equal(paid.status,200);assert.equal(f.orders.get(created.data.order_id).status,'paid');
  assert.equal((await f.webhook('checkout.session.completed',session,{event_id:'evt_paid_once'})).status,200);assert.equal(f.events.size,1);
  assert.equal((await f.webhook('checkout.session.expired',session)).status,200,'Un evento de expiración atrasado consulta el estado actual pagado');assert.equal(f.orders.get(created.data.order_id).status,'paid');assert.equal(f.stock,4);
  const owned=await f.call('status',{order_id:created.data.order_id,access_token:body.access_token});assert.equal(owned.data.order.status,'paid');assert.equal(owned.data.order.delivery_link,'https://delivery.invalid/owned');
 }
 {
  const f=fixture(),body=f.checkoutBody([{kind:'variant',id:PHYSICAL,quantity:1,customization:'Nombre privado del jugador'}]),created=await f.call('create-session',body),session=f.sessions.get(created.data.session_id);
  const params=f.stripeCalls.find(row=>row.type==='create').params;
  assert.ok(!JSON.stringify(params.line_items).includes('Nombre privado'));assert.ok(!JSON.stringify(params.metadata).includes('Nombre privado'));
  session.status='complete';session.payment_status='paid';session.collected_information={shipping_details:shippingDetails()};session.presentment_details={presentment_amount:1700,presentment_currency:'usd'};
  assert.equal((await f.webhook('checkout.session.completed',session)).status,200,'Adaptive Pricing conserva el total y moneda MXN de integración');assert.equal(f.orders.get(created.data.order_id).status,'paid');
 }
 {
  const f=fixture(),created=await f.call('create-session',f.checkoutBody(mixedCart)),session=f.sessions.get(created.data.session_id);
  session.status='complete';session.payment_status='unpaid';assert.equal((await f.webhook('checkout.session.async_payment_failed',session)).status,200);assert.equal(f.orders.get(created.data.order_id).status,'failed');assert.equal(f.stock,5);
  assert.equal((await f.webhook('checkout.session.async_payment_failed',session)).status,200);assert.equal(f.stock,5);
  session.payment_status='paid';session.collected_information={shipping_details:shippingDetails()};assert.equal((await f.webhook('checkout.session.async_payment_succeeded',session)).status,200);assert.equal(f.orders.get(created.data.order_id).status,'paid');assert.equal(f.orders.get(created.data.order_id).needs_review,true);
 }
 {
  const f=fixture(),created=await f.call('create-session',f.checkoutBody(mixedCart)),session=f.sessions.get(created.data.session_id);
  session.status='expired';assert.equal((await f.webhook('checkout.session.expired',session)).status,200);assert.equal(f.stock,5);assert.equal((await f.webhook('checkout.session.expired',session)).status,200);assert.equal(f.stock,5);
 }
 {
  const f=fixture(),created=await f.call('create-session',f.checkoutBody(mixedCart)),session=f.sessions.get(created.data.session_id);session.status='complete';session.payment_status='paid';
  session.collected_information={shipping_details:{address:{country:'MX'}}};assert.equal((await f.webhook('checkout.session.completed',session)).status,409);assert.notEqual(f.orders.get(created.data.order_id).status,'paid');
  delete session.collected_information;session.shipping_details=shippingDetails();assert.equal((await f.webhook('checkout.session.completed',session)).status,200,'Formato anterior shipping_details sigue siendo compatible');
 }
 {
  const f=fixture(),created=await f.call('create-session',f.checkoutBody()),session=f.sessions.get(created.data.session_id);session.status='complete';session.payment_status='paid';session.amount_total=1;
  assert.equal((await f.webhook('checkout.session.completed',session)).status,409);assert.notEqual(f.orders.get(created.data.order_id).status,'paid');
  session.amount_total=5001;assert.equal((await f.webhook('checkout.session.completed',session)).status,409);assert.notEqual(f.orders.get(created.data.order_id).status,'paid');
 }
 console.log('Pagos TSI staging: configuración cerrada sin claves/live, cuenta test, precios servidor, tokens, reservas, idempotencia, firmas, duplicados y eventos fuera de orden aprobados con red simulada.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
