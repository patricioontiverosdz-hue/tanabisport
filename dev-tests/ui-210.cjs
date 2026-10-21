const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../assets/tsi-210-model.js');
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003'};
const teamId='10000000-0000-4000-8000-000000000001',rateId='20000000-0000-4000-8000-000000000001';
const root=path.join(__dirname,'..');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function environment(role,saved){
 const {Window}=await import('happy-dom');
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 window.document.body.innerHTML='<div id="app"></div>';
 const uid=ids[role],calls=[],receipts=new Map();let failAfterSave=false,writes=0;
 const matches=[{id:'m1',date:'2026-10-21',time:'10:00',teams:'Prueba vs Rival',venue:'Campo prueba',cat:'Flag',f1:ids.foto,f2:'',ed:ids.editora,stage:'listos',link:'https://example.invalid/entrega',cov:{players:10,price:200,discount:200,paid:1000,locked:true,nums:'7, 10'}},{id:'m2',date:'2026-10-21',time:'12:00',teams:'Segunda cobertura',venue:'Otro campo',cat:'Flag',f1:ids.foto,f2:'',ed:ids.editora,stage:'',cov:null}];
 const data={version:'2.1.0',teams:[{id:teamId,owner_id:ids.foto,team_name:'Equipo de prueba',sport:'Flag',coordinator_name:'Contacto de prueba',whatsapp:'8112345678',notes:'',archived:false,version:1}],team_matches:[],rates:[{id:rateId,sport:'Flag',package_name:'Cobertura estándar',unit:'player',price_cents:20000,max_discount_pct:10,description:'Fotografías del partido',active:true,version:1}],quotes:[],quote_costs:[],costs:[],deliveries:[],audit:[]};
 const profiles=Object.keys(ids).map(r=>({id:ids[r],email:r+'@test.invalid',name:'Usuario '+r,role:r}));
 function visible(){return {...data,teams:role==='editora'?[]:data.teams,quotes:role==='admin'?data.quotes:data.quotes.filter(q=>q.owner_id===uid),rates:role==='editora'?[]:data.rates,quote_costs:role==='admin'?data.quote_costs:[],costs:role==='admin'?data.costs:[],audit:role==='admin'?data.audit:[]};}
 const response=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
 window.fetch=async(input,options={})=>{
  const url=new URL(String(input)),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};calls.push({url:url.href,method,body});
  if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}]);
  if(url.pathname==='/rest/v1/profiles')return response(profiles);
  if(url.pathname==='/rest/v1/matches')return response(matches.map(m=>({id:String(m.id),data:m})));
  if(url.pathname==='/rest/v1/rpc/tsi11_state')return response({server_now:new Date().toISOString(),model:{parameters:{min_completed_jobs:3}},capacity:[],estimates:[],sessions:[],matches:[],events:[],snapshots:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({photographers:[]});
  if(url.pathname==='/rest/v1/rpc/tsi210_state')return response(visible());
  if(url.pathname==='/rest/v1/rpc/tsi210_command'){
   if(receipts.has(body.request_id))return response(receipts.get(body.request_id));
   const p=body.payload;let r;
   if(body.operation==='team.save'){r={...p,owner_id:uid,version:p.version+1};const i=data.teams.findIndex(t=>t.id===p.id);if(i<0)data.teams.push(r);else data.teams[i]=r;}
   else if(body.operation==='rate.save'){r={...p,version:p.version+1};data.rates.push(r);}
   else if(body.operation==='quote.save'){
    const rate=data.rates.find(t=>t.id===p.rate_id);r={...p,...M.quote(p,rate,role==='admin'),owner_id:uid,sport:rate.sport,unit:rate.unit,package_name:rate.package_name,status:'draft',version:p.version+1};
    const i=data.quotes.findIndex(q=>q.id===p.id);if(i<0)data.quotes.push(r);else data.quotes[i]=r;if(p.costs)data.quote_costs.push({quote_id:p.id,items:p.costs});
   }else if(body.operation==='quote.status'){r=data.quotes.find(q=>q.id===p.id);r.status=p.status;r.version++;}
   else if(body.operation==='delivery.update'){
    let d=data.deliveries.find(d=>d.match_id===p.match_id);if(!d){d={match_id:p.match_id,version:0,correction_open:false};data.deliveries.push(d);}d.version++;
    if(p.action==='sent'){d.sent_at=new Date().toISOString();d.sent_by=uid;}if(p.action==='confirmed')d.confirmed_at=new Date().toISOString();if(p.action==='correction'){d.correction_open=true;d.correction_note=p.note;}if(p.action==='resolved')d.correction_open=false;r=d;
   }else if(body.operation==='cost.save'){r={...p,version:p.version+1,source_expense_id:null};data.costs.push(r);}
   else throw Error('Operación de prueba no implementada: '+body.operation);
   writes++;receipts.set(body.request_id,structuredClone(r));if(failAfterSave){failAfterSave=false;throw new TypeError('Conexión interrumpida después de guardar');}return response(r);
  }
  return response([]);
 };
 const token='test.'+Buffer.from(JSON.stringify({iss:'https://tantlgswituiwkxfgmsr.supabase.co/auth/v1'})).toString('base64url')+'.test';
 if(saved)for(const [k,v]of saved)window.localStorage.setItem(k,v);
 window.localStorage.setItem('tsi_production_tantlgswituiwkxfgmsr_auth',JSON.stringify({access:token,uid,exp:Date.now()/1000+3600}));
 for(const file of ['tsi-210-model.js','tsi-210-backup.js','tsi-210.js'])window.eval(fs.readFileSync(path.join(root,'assets',file),'utf8'));
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);let last=scripts.pop(),pos=last.lastIndexOf('})();');
 last=last.slice(0,pos)+'window.__t={S:S,ux:UX210,render:function(){render();}};\n'+last.slice(pos);
 for(const s of [...scripts,last])window.eval(s);
 await until(()=>window.__t?.S.meId===uid,'arranque '+role);window.__t.S.view='dash';window.__t.S.tab='resumen';window.__t.render();
 await until(()=>window.__t.ux.diagnostics().data,'carga de herramientas '+role);
 function click(action,filter=''){const el=window.document.querySelector('[data-210-action="'+action+'"]'+filter);assert.ok(el,'Botón '+action+filter);el.click();}
 function fill(id,value){const el=window.document.getElementById(id);assert.ok(el,'Campo '+id);if(el.type==='checkbox')el.checked=!!value;else el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));}
 function go(tab){window.__t.S.tab=tab;window.__t.render();}
 const store=()=>Array.from({length:window.localStorage.length},(_,i)=>{let k=window.localStorage.key(i);return [k,window.localStorage.getItem(k)];});
 return {window,data,calls,click,fill,go,store,setFailure(){failAfterSave=true;},writes:()=>writes,close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}
async function until(check,message){for(let i=0;i<100;i++){if(check())return;await delay(15);}throw Error('No se completó: '+message);}
async function settled(env){await delay(20);await until(()=>!env.window.__t.ux.diagnostics().pending&&!env.window.document.body.textContent.includes('Guardando…'),'guardar');}
async function main(){
 let env=await environment('admin');try{
  const {window,go,click,fill,data}=env;
  for(const tab of ['cotizador','rentabilidad','clientes','entregas','pendientes','borradores','registro','recuperacion']){go(tab);assert.ok(window.document.getElementById('app').textContent.trim().length>100,tab);}
  go('clientes');click('new-team');fill('s210-team-team_name','Nuevo equipo');fill('s210-team-coordinator_name','Nuevo contacto');fill('s210-team-whatsapp','81 2345 6789');click('save-team');await settled(env);assert.equal(data.teams.length,2);assert.equal(data.teams[1].whatsapp,'8123456789');
  go('cotizador');click('new-quote');fill('s210-quote-team_id',teamId);fill('s210-quote-quantity','10');fill('s210-quote-discount','100');fill('s210-quote-cost_photo','600');fill('s210-quote-cost_editing','300');click('save-quote');await settled(env);assert.equal(data.quotes[0].total_cents,190000);assert.equal(data.quote_costs[0].items.photo,60000);
  click('quote-status','[data-status="sent"]');await settled(env);assert.equal(data.quotes[0].status,'sent');click('quote-status','[data-status="accepted"]');await settled(env);assert.equal(data.quotes[0].status,'accepted');
  go('rentabilidad');click('new-cost','[data-mid="m1"]');fill('s210-cost-amount','75');click('save-cost');await settled(env);assert.equal(data.costs[0].amount_cents,7500);
  go('entregas');click('delivery-action','[data-action="sent"]');await settled(env);assert.ok(data.deliveries[0].sent_at);click('delivery-action','[data-action="confirmed"]');await settled(env);assert.ok(data.deliveries[0].confirmed_at);
  go('clientes');click('new-team');fill('s210-team-team_name','Borrador recuperable');await delay(300);const saved=env.store();assert.ok(saved.some(([k,v])=>k.includes('drafts')&&v.includes('Borrador recuperable')));
  const other=await environment('foto',saved);try{other.go('borradores');assert.ok(!other.window.document.body.textContent.includes('Borrador recuperable'));}finally{await other.close();}
  const reopened=await environment('admin',saved);try{reopened.go('borradores');reopened.click('restore-draft','[data-key="form:team"]');await delay(30);assert.equal(reopened.window.document.getElementById('s210-team-team_name').value,'Borrador recuperable');}finally{await reopened.close();}
  // Una respuesta perdida mantiene el mismo request_id al reintentar.
  go('clientes');fill('s210-team-team_name','Guardado con reintento');const writes=env.writes();env.setFailure();click('save-team');await until(()=>window.__t.ux.diagnostics().pending&&window.__t.ux.diagnostics().error,'error recuperable');
  assert.equal(env.writes(),writes+1);click('retry');await settled(env);assert.equal(env.writes(),writes+1);assert.ok(!window.__t.ux.diagnostics().pending);
  // Todas las etiquetas de formulario nuevo apuntan a un campo existente.
  for(const tab of ['cotizador','clientes','entregas','rentabilidad','recuperacion']){go(tab);for(const label of window.document.querySelectorAll('label[for]'))assert.ok(window.document.getElementById(label.htmlFor),'Etiqueta '+label.htmlFor);}
  assert.ok(env.calls.every(c=>new URL(c.url).origin==='https://tantlgswituiwkxfgmsr.supabase.co'));
 }finally{await env.close();}
 env=await environment('foto');try{
  env.go('cotizador');env.click('new-quote');assert.equal(env.window.document.getElementById('s210-quote-price').readOnly,true);assert.ok(!env.window.document.body.textContent.includes('Costos internos estimados'));
  env.go('entregas');assert.ok(env.window.document.body.textContent.includes('Registrar envío'));env.go('pendientes');assert.ok(!env.window.document.body.textContent.includes('Saldo por cobrar'));
 }finally{await env.close();}
 env=await environment('editora');try{env.go('entregas');assert.ok(!env.window.document.querySelector('[data-210-action="delivery-action"][data-action="sent"]'));assert.ok(env.window.document.body.textContent.includes('Anotar corrección'));env.go('cotizador');assert.equal(env.window.__t.S.tab,'resumen');}finally{await env.close();}
 console.log('2.1.0 interfaz: módulos por rol, alta de contacto, cotización, costos, entregas, borrador entre sesiones y aislamiento, reintento sin duplicados y etiquetas aprobados.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
