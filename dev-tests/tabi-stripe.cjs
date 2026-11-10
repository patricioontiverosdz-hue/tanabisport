const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const {createTabiPayments,validateTabiSession}=await import(pathToFileURL(path.join(__dirname,'../supabase/functions/tsi-support-autonomy/tabi-payments.mjs')));
 const id='23000000-0000-4000-8000-000000000001',bid='23000000-0000-4000-8000-000000000002',time=Date.parse('2026-11-10T04:00:00Z');
 let payment={id,booking_id:bid,folio:'COT-TEST',amount_cents:65000,session_id:null,created_at:new Date(time).toISOString()},calls=[],created=[],key='rk_test_'+'a'.repeat(20),account='acct_1UVH3OQ9WFCZJIYG';
 let session={id:'cs_test_tabi',object:'checkout.session',livemode:false,mode:'payment',client_reference_id:id,currency:'mxn',amount_total:65000,status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/cs_test_tabi',metadata:{tsi_environment:'staging',tsi_integration:'tabi',tabi_payment_id:id,tabi_booking_id:bid}};
 const service=createTabiPayments({now:()=>time,env:n=>({SUPABASE_URL:'https://nksqpoigywfegcbvfhoa.supabase.co',STRIPE_SECRET_KEY:key,STRIPE_WEBHOOK_SECRET:'whsec_'+'b'.repeat(20)})[n],fail:(status,message)=>{throw Object.assign(Error(message),{status});},db:async(url,p)=>{
  calls.push({url,p});
  if(url.endsWith('tsi231_support_payment')){if(p.operation==='link')payment.session_id=p.payload.session_id;return {payment:{...payment}};}
  if(url.endsWith('tsi231_support_payment_event'))return {received:true};
  if(url.endsWith('tsi231_support_command'))return {thread:{id:bid},booking:{paid:650}};
  throw Error(url);
 },stripeFactory:(secret,options)=>{assert.ok(secret.startsWith('rk_test_'));assert.equal(options.apiVersion,'2026-09-30.endive');return {accounts:{retrieve:async()=>({id:account})},checkout:{sessions:{create:async(p,o)=>{created.push({p,o});return structuredClone(session);},retrieve:async()=>structuredClone(session)}}};}});
 let r=await service.start('hash');assert.ok(r.test_mode);assert.equal(r.amount_cents,65000);assert.equal(created.length,1);
 assert.equal(created[0].p.line_items[0].price_data.unit_amount,65000);assert.equal(created[0].p.payment_method_types,undefined);assert.ok(created[0].p.integration_identifier.match(/[a-z]{8}$/));
 assert.ok(!JSON.stringify(created).includes('hash'));assert.equal(created[0].p.metadata.tabi_booking_id,bid);
 await service.start('hash');assert.equal(created.length,1,'retry reuses linked session');
 session.payment_status='paid';session.status='complete';r=await service.refresh('hash');assert.equal(r.booking.paid,650);
 assert.ok(calls.some(c=>c.url.endsWith('payment_event')&&c.p.payload.payment_status==='paid'));
 for(const override of [{livemode:true},{currency:'usd'},{amount_total:1},{client_reference_id:bid},{metadata:{...session.metadata,tabi_booking_id:id}}])assert.throws(()=>validateTabiSession({...session,...override},payment));
 key='rk_live_'+'a'.repeat(20);assert.equal(service.ready(),false);
 await assert.rejects(()=>service.start('hash'),e=>e.status===503);
 console.log('TABI Stripe: test-only keys/account, server amount, dynamic methods, stable session, reconciliation and mismatch checks OK');
})().catch(e=>{console.error(e);process.exitCode=1;});