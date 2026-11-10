const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');const {chromium}=require(process.env.TSI_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.join(__dirname,'..'),{answer}=await import(pathToFileURL(path.join(root,'supabase/functions/tsi-support-autonomy/assistant.mjs')));
 const server=http.createServer((req,res)=>{if(req.url==='/support.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(root,'staging/tsi-230-support.js')));}if(req.url==='/support.css'){res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync(path.join(root,'staging/tsi-230-support.css')));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/support.css"><main id="app"></main><script src="/support.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1280,height:850}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let record={thread:{id:'23000000-0000-4000-8000-000000000099',folio:'TABI-TEST',status:'Por atender',version:1,bot_paused:false},messages:[],assistant_state:{},settings:{},booking:null},routes=[];
 const response=()=>JSON.parse(JSON.stringify(record));
 await page.route('https://nksqpoigywfegcbvfhoa.supabase.co/functions/v1/tsi-support-autonomy/**',async route=>{
  const r=route.request(),op=r.url().split('/').at(-1),p=r.postDataJSON();routes.push(op);
  if(op==='slots')return route.fulfill({json:{slots:[{id:'match-test',sport:'flag',date:'2026-12-01',time:'12:00',teams:'A vs B',venue:'Campo prueba'}]}});
  if(op==='message'){const plan=answer(p.text,record.assistant_state,record);record.assistant_state=plan.state;record.thread.bot_paused=plan.handoff;record.messages.push({kind:'client',text:p.text,author_name:'Cliente'},{kind:'bot',text:plan.reply,author_name:'Tabi'});}
  if(op==='quote'){assert.equal(p.event_date,'2026-12-01');assert.equal(p.event_time,'18:30');assert.equal(p.event_venue,'Campo de prueba');assert.equal(p.match_id,undefined);}if(op==='quote')record.booking={id:'23000000-0000-4000-8000-000000000077',folio:'COT-TEST',team:p.team,sport:p.sport,package:p.package,players:p.players,total:1200,deposit:600,paid:0,discount:0,balance:1200,status:'Cotizada',progress:'Programada',delivery_url:''};
  if(op==='confirm'){assert.equal(p.accept_terms,true);record.booking.status='Confirmada';}
  if(op==='checkout'){record.booking.paid=600;record.booking.balance=600;return route.fulfill({json:{closed:true,payment_status:'paid',test_mode:true}});}
  await route.fulfill({json:response()});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{
  window.testRole=null;window.state={view:'home',tab:'resumen'};
  window.renderFixture=()=>{document.getElementById('app').innerHTML=state.tab==='atencion'?'<h1>Atención</h1><div data-ts231-inbox></div>':'<h1>Inicio</h1>';TSI230Support.afterRender();};
  TSI230Support.install({state,me:()=>testRole?{id:'23000000-0000-4000-8000-000000000001',role:testRole,name:'Equipo prueba'}:null,backendURL:'https://nksqpoigywfegcbvfhoa.supabase.co',publicKey:'publishable-test',render:renderFixture,sb:async(method,url,p)=>{
   const op=url.split('/').at(-1);if(op==='staff-slots')return {slots:[{id:'match-test',teams:'A vs B',date:'2026-12-01',time:'12:00',venue:'Campo prueba'}]};if(op==='profile')return {avatar:''};if(op==='staff-list')return {threads:[{id:'thread-test',folio:'TABI-STAFF',contact_name:'Cliente privado',status:'Por atender'}]};
   return {thread:{id:'thread-test',folio:'TABI-STAFF',bot_paused:true,status:'En atención'},messages:[],contact:{name:'Cliente privado',phone:'8112345678'},owner:{name:'Equipo prueba'},booking:{id:'booking-test',folio:'COT-STAFF',team:'Equipo',sport:'flag',package:'equipo',players:6,total:1200,deposit:600,paid:0,discount:0,balance:1200,status:'Confirmada',progress:'Programada',delivery_url:''}};
  }});TSI230Support.open();
 });
 await page.locator('input[name="name"]').fill('Visitante prueba');await page.locator('input[name="phone"]').fill('8112345678');await page.locator('input[name="consent"]').check();await page.locator('form[data-ts230="register"] button').click();
 await page.getByRole('button',{name:'Paquetes',exact:true}).click();await page.getByText('📷 Flag: $200',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Cotizar',exact:true}).click();assert.equal(await page.locator('form[data-ts230="quote"] select[name="match_id"]').count(),0);
 await page.locator('input[name="team"]').fill('Equipo prueba');await page.locator('input[name="event_date"]').fill('2026-12-01');await page.locator('input[name="event_time"]').fill('18:30');await page.locator('input[name="event_venue"]').fill('Campo de prueba');await page.getByRole('button',{name:'Generar cotización'}).click();
 await page.locator('input[name="terms"]').check();await page.getByRole('button',{name:'Confirmar cobertura',exact:true}).click();await page.locator('.ts231-booking').getByText('Confirmada',{exact:true}).waitFor();
 await page.getByRole('button',{name:/Pagar.*Stripe de prueba/}).click();
 await page.waitForFunction(()=>document.querySelector('.ts231-booking')?.textContent.includes('Pago registrado'));
 assert.ok(routes.includes('checkout'));assert.ok(!routes.includes('slots'),'Visitor quote must not request match availability');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(()=>{testRole='foto';TSI230Support.afterRender();TSI230Support.openStaff();});
 await page.locator('[data-ts231-inbox] .ts231-inline').waitFor();await page.locator('[data-ts230-thread]').click();await page.getByText('Cliente privado',{exact:true}).waitFor();
 assert.equal(await page.locator('input[name="discount"]').count(),0);assert.equal(await page.locator('form[data-ts230="staff-booking"] select[name="match_id"]').count(),1);
 assert.equal(await page.locator('.ts230-bubble:visible').count(),0);
 assert.equal(await page.locator('.ts230-panel').getAttribute('role'),'region');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(()=>{testRole=null;TSI230Support.afterRender();});
 assert.equal(await page.getByText('Cliente privado',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('TABI browser: visitor registration, natural reply, live slots, quote, terms, confirmation, mobile width, staff inbox, discount permission and logout OK');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});