const assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const {createHandler}=await import(pathToFileURL(path.join(__dirname,'../supabase/functions/tsi-store-checkout/handler.mjs')));
 const id='23000000-0000-4000-8000-000000000001',bid='23000000-0000-4000-8000-000000000002',now=Date.now(),cfg={SUPABASE_URL:'https://nksqpoigywfegcbvfhoa.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret-for-test-only',STRIPE_SECRET_KEY:'rk_test_'+'a'.repeat(20),STRIPE_PUBLISHABLE_KEY:'pk_test_'+'a'.repeat(20),STRIPE_WEBHOOK_SECRET:'whsec_'+'a'.repeat(20)},calls=[];
 let session={object:'checkout.session',id:'cs_test_tabi_webhook',livemode:false,mode:'payment',client_reference_id:id,amount_total:65000,currency:'mxn',status:'complete',payment_status:'unpaid',metadata:{tsi_environment:'staging',tsi_integration:'tabi',tabi_payment_id:id,tabi_booking_id:bid}};
 const event={id:'evt_tabi_webhook_test',livemode:false,type:'checkout.session.completed',data:{object:structuredClone(session)}};
 const handler=createHandler({env:n=>cfg[n],now:()=>now,crypto:crypto.webcrypto,fetch:async(url,opt)=>{
  assert.ok(url.endsWith('/rest/v1/rpc/tsi231_support_payment_event'));calls.push(JSON.parse(opt.body));return Response.json({received:true});
 },stripeFactory:()=>({accounts:{retrieve:async()=>({id:'acct_1UVH3OQ9WFCZJIYG'})},checkout:{sessions:{retrieve:async()=>structuredClone(session)}}})});
 async function call(valid=true){
  const raw=JSON.stringify(event),t=Math.floor(now/1000),sig=crypto.createHmac('sha256',cfg.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');
  return handler(new Request(cfg.SUPABASE_URL+'/functions/v1/tsi-store-checkout/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':'t='+t+',v1='+(valid?sig:'0'.repeat(64))},body:raw}));
 }
 assert.equal((await call(false)).status,400);assert.equal(calls.length,0);
 assert.equal((await call()).status,200);assert.equal(calls[0].payload.payment_status,'unpaid');
 session.payment_status='paid';event.type='checkout.session.async_payment_succeeded';event.id='evt_tabi_webhook_paid';
 assert.equal((await call()).status,200);assert.equal(calls[1].payload.payment_status,'paid');assert.equal(calls[1].payload.amount_total,65000);
 session.livemode=true;assert.equal((await call()).status,409);assert.equal(calls.length,2);
 console.log('TABI webhook: raw Stripe signature, async unpaid/paid, server retrieval, test-only session and dedicated RPC OK');
})().catch(e=>{console.error(e);process.exitCode=1;});