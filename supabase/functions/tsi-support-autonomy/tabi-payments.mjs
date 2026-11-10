// TABI payments reuse the existing, signed staging Stripe webhook. No browser keys.
export const TABI_ACCOUNT='acct_1UVH3OQ9WFCZJIYG';
export const TABI_STRIPE_VERSION='2026-09-30.endive';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETURN='https://patricioontiverosdz-hue.github.io/tanabisport/staging/';
export function validateTabiSession(session,payment){
 const m=session?.metadata;
 if(session?.object!=='checkout.session'||session.livemode!==false||session.mode!=='payment'||!/^cs_test_[A-Za-z0-9_]+$/.test(session.id||'')||
  m?.tsi_environment!=='staging'||m?.tsi_integration!=='tabi'||!UUID.test(m?.tabi_payment_id||'')||!UUID.test(m?.tabi_booking_id||'')||
  session.client_reference_id!==m.tabi_payment_id||session.currency!=='mxn'||!Number.isSafeInteger(session.amount_total)||session.amount_total<=0||
  !['open','complete','expired'].includes(session.status)||!['paid','unpaid','no_payment_required'].includes(session.payment_status))throw Error('TABI_PAYMENT_MISMATCH');
 if(payment&&(payment.id!==m.tabi_payment_id||payment.booking_id!==m.tabi_booking_id||payment.amount_cents!==session.amount_total||
  payment.session_id&&payment.session_id!==session.id))throw Error('TABI_PAYMENT_MISMATCH');
 return {payment_id:m.tabi_payment_id,booking_id:m.tabi_booking_id,session_id:session.id,livemode:false,amount_total:session.amount_total,currency:session.currency,session_status:session.status,payment_status:session.payment_status};
}
export function createTabiPayments({env,db,fail,stripeFactory,now=Date.now}){
 let client,checkedAt=0;
 const rpc=(name,p)=>db('/rest/v1/rpc/'+name,p);
 function ready(){return env('SUPABASE_URL')==='https://nksqpoigywfegcbvfhoa.supabase.co'&&/^(rk|sk)_test_[A-Za-z0-9]{12,}$/.test(env('STRIPE_SECRET_KEY')||'')&&/^whsec_[A-Za-z0-9]{12,}$/.test(env('STRIPE_WEBHOOK_SECRET')||'')&&typeof stripeFactory==='function';}
 async function sdk(){
  if(!ready())fail(503,'Stripe de prueba todavía no está configurado.');
  if(!client)client=stripeFactory(env('STRIPE_SECRET_KEY'),{apiVersion:TABI_STRIPE_VERSION});
  if(!checkedAt||now()-checkedAt>300000){let a;try{a=await client.accounts.retrieve();}catch{fail(503,'No se pudo verificar la cuenta de Stripe de prueba.');}if(a?.id!==TABI_ACCOUNT)fail(503,'La cuenta de pagos no corresponde a Tanabi staging.');checkedAt=now();}
  return client;
 }
 async function retrieve(client,id,p){let s;try{s=await client.checkout.sessions.retrieve(id);}catch{fail(503,'No pudimos consultar el pago. Vuelve a intentar.');}try{validateTabiSession(s,p);}catch{fail(409,'El pago no coincide con esta contratación.');}return s;}
 async function settle(s,p){const v=validateTabiSession(s,p);return rpc('tsi231_support_payment_event',{payload:{...v,event_id:'tabi-sync-'+s.id+'-'+s.status+'-'+s.payment_status,event_type:'reconcile'}});}
 async function start(session_hash){
  const client=await sdk();
  const result=await rpc('tsi231_support_payment',{operation:'prepare',payload:{},session_hash}),p=result.payment;
  if(!p)fail(409,'No hay un importe pendiente para esta cobertura.');
  let s;
  if(p.session_id){s=await retrieve(client,p.session_id,p);await settle(s,p);}
  else{
   const expires=Math.floor(new Date(p.created_at).getTime()/1000)+2700;
   if(!Number.isFinite(expires)||expires-Math.floor(now()/1000)<1800)fail(409,'Esta solicitud de pago necesita revisión del equipo antes de reintentarse.');
   const suffix=p.id.replaceAll('-','').slice(0,8).split('').map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
   const params={mode:'payment',success_url:RETURN+'?tabi_payment=return',cancel_url:RETURN+'?tabi_payment=cancel',
    expires_at:expires,client_reference_id:p.id,integration_identifier:'tabi-staging-'+suffix,adaptive_pricing:{enabled:false},
    metadata:{tsi_environment:'staging',tsi_integration:'tabi',tabi_payment_id:p.id,tabi_booking_id:p.booking_id},
    line_items:[{quantity:1,price_data:{currency:'mxn',unit_amount:p.amount_cents,product_data:{name:'Tanabi Sports · '+p.folio+' · pago de prueba'}}}]};
   try{s=await client.checkout.sessions.create(params,{idempotencyKey:'tabi-payment-'+p.id});}catch(e){console.error('TABI_CHECKOUT_CREATE',JSON.stringify({type:e?.type,code:e?.code,param:e?.param,status:e?.statusCode,request_id:e?.requestId}));fail(503,'No pudimos confirmar la sesión de pago. Reintenta; conservamos la misma solicitud para evitar duplicados.');}
   try{validateTabiSession(s,p);}catch{fail(409,'No se pudo verificar la sesión de Stripe.');}
   await rpc('tsi231_support_payment',{operation:'link',payload:{payment_id:p.id,session_id:s.id},session_hash});
   await settle(s,p);
  }
  if(s.status!=='open'||s.payment_status==='paid')return {payment_status:s.payment_status,closed:true,test_mode:true};
  let u;try{u=new URL(s.url);}catch{}if(u?.protocol!=='https:'||u.hostname!=='checkout.stripe.com')fail(503,'Stripe no devolvió un enlace de pago válido.');
  return {checkout_url:u.href,test_mode:true,amount_cents:p.amount_cents};
 }
 async function refresh(session_hash){
  const client=await sdk(),r=await rpc('tsi231_support_payment',{operation:'state',payload:{},session_hash});
  if(r.payment?.session_id){const s=await retrieve(client,r.payment.session_id,r.payment);await settle(s,r.payment);}
  return rpc('tsi231_support_command',{operation:'history',payload:{},session_hash,actor:null});
 }
 return {ready,start,refresh};
}
