const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),production=process.argv[2]==='production',pageRoot=path.join(root,production?'':'staging');
const modulePath=production?'assets/tsi-225-availability-suspensions.js':'availability-suspensions.js',moduleSource=fs.readFileSync(path.join(pageRoot,modulePath),'utf8'),html=fs.readFileSync(path.join(pageRoot,'index.html'),'utf8');
const now='2026-11-02T18:00:00.000Z';
const users=[{id:'admin',name:'Administración',role:'admin'},{id:'photo',name:'Fotógrafa de prueba',role:'foto'},{id:'editor',name:'Editora de prueba',role:'editora'}];
const copy=value=>JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function error(message,status){return Object.assign(new Error(message),{status});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function until(check,message){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('No se completó: '+message);}

async function environment(role='admin',options={}){
 const {Window}=await import('happy-dom');
 const window=new Window({url:'https://example.test/staging/'});
 window.document.body.innerHTML='<main id="app"></main>';
 window.eval(moduleSource);
 let current=users.find(u=>u.role===role),api,changed=0,loadFailure=!!options.loadFailure,ambiguous=!!options.ambiguous,rejectNext=options.rejectNext;
 const rows=copy(options.rows||[]),calls=[],receipts=new Map();
 function result(){return {server_now:now,suspensions:copy(rows.filter(r=>current.role==='admin'||r.user_id===current.id))};}
 async function sb(method,url,body){
  assert.equal(method,'POST');calls.push({url,body:copy(body)});
  if(url.endsWith('_state')){
   if(options.stateGate){const value=await options.stateGate.promise;return value;}
   if(loadFailure){loadFailure=false;throw error('Fallo temporal de consulta',503);}
   return result();
  }
  assert.equal(current.role,'admin','Ningún perfil de equipo debe enviar modificaciones');
  if(options.commandGate)return options.commandGate.promise;
  if(rejectNext){const e=rejectNext;rejectNext=null;throw e;}
  if(!receipts.has(body.p_request_id)){
   if(url.endsWith('tsi225_suspend_availability'))rows.push({id:'suspension-'+rows.length,user_id:body.p_user_id,start_date:body.p_start_date,end_date:body.p_end_date,reason:body.p_reason,created_by:current.id,created_at:now,released_at:null});
   else if(url.endsWith('tsi225_release_availability')){
    const row=rows.find(r=>r.id===body.p_id);assert.ok(row,'Suspensión que se levanta');row.released_at=now;row.released_by=current.id;row.release_reason=body.p_reason;
   }else throw Error('RPC desconocido: '+url);
   receipts.set(body.p_request_id,true);
  }
  if(ambiguous){ambiguous=false;throw error('No se recibió la respuesta',503);}
  return result();
 }
 const render=()=>{api.beforeRender();window.document.getElementById('app').innerHTML=current?.role==='admin'?api.view():api.panel(current?.id);};
 api=window.TSIAvailability225.install({me:()=>current,users:()=>users,esc,sb,uuid:()=>crypto.randomUUID(),render,changed:async()=>{changed++;if(options.changedGate)await options.changedGate.promise;}});
 render();
 function field(name,value){const input=window.document.querySelector('[data-as-field="'+name+'"]');assert.ok(input,'Campo '+name);assert.equal(input.disabled,false);input.value=value;input.dispatchEvent(new window.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));}
 function fill(overrides={}){for(const [key,value] of Object.entries(Object.assign({user_id:'photo',start_date:'2026-11-02',end_date:'2026-11-04',reason:'Recuperación médica justificada'},overrides)))field(key,value);}
 function click(action){const button=window.document.querySelector('[data-as="'+action+'"]');assert.ok(button,'Botón '+action);assert.equal(button.disabled,false);button.click();}
 return {window,api,rows,calls,field,fill,click,render,result,get changed(){return changed;},switchUser:role=>{current=users.find(u=>u.role===role);render();},close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}

async function controlsAndHistory(){
 const env=await environment();
 try{
  assert.equal(env.window.document.querySelector('[data-as="suspend"]').disabled,true,'Esperar al estado del servidor antes de permitir modificaciones');
  await env.api.load();
  const selectedRoles=[...env.window.document.querySelectorAll('[data-as-field="user_id"] option')].map(o=>o.value);
  assert.deepEqual(selectedRoles,['','photo','editor'],'Solo fotografía y edición se pueden suspender');
  env.fill({reason:'   '});await env.api.action('suspend');
  assert.match(env.api.state.error,/motivo justificado/i);assert.equal(env.calls.length,1,'No enviar un motivo vacío');
  env.fill({start_date:'2026-11-04',end_date:'2026-11-02'});await env.api.action('suspend');
  assert.match(env.api.state.error,/periodo válido/i);assert.equal(env.calls.length,1);
  env.fill({start_date:'2026-11-01'});await env.api.action('suspend');assert.match(env.api.state.error,/desde hoy/i);
  env.fill({reason:'x'.repeat(1001)});await env.api.action('suspend');assert.match(env.api.state.error,/1000/);
  env.fill({reason:'  Justificado <img src=x onerror="alert(1)">  '});env.click('suspend');
  await until(()=>env.changed===1&&!env.api.state.busy,'guardar suspensión');
  assert.equal(env.rows.length,1);assert.equal(env.rows[0].reason,'Justificado <img src=x onerror="alert(1)">');
  assert.equal(env.window.document.querySelectorAll('img').length,0,'El motivo se muestra como texto');
  assert.match(env.window.document.body.textContent,/Justificado <img/);
  assert.match(env.window.document.body.textContent,/Vigente/);
  assert.equal(env.api.state.draft.reason,'','Limpiar el formulario tras guardar');
  const create=env.calls.find(c=>c.url.endsWith('tsi225_suspend_availability'));
  assert.equal(create.body.p_user_id,'photo');assert.match(create.body.p_request_id,/^[0-9a-f-]{36}$/);
  assert.equal(create.body.p_start_date,'2026-11-02');assert.equal(create.body.p_end_date,'2026-11-04');
  assert.match(env.api.panel('photo'),/Recuperación|Justificado/);assert.equal(env.api.panel('editor'),'','Mostrar el aviso solo para la persona afectada');
  await env.api.action('release',env.rows[0].id);assert.match(env.api.state.error,/motivo para levantar/i);assert.equal(env.rows[0].released_at,null);
  const input=env.window.document.querySelector('[data-as-release-reason]');input.value='Regreso autorizado';input.dispatchEvent(new env.window.Event('input',{bubbles:true}));env.click('release');
  await until(()=>env.changed===2&&!env.api.state.busy,'levantar suspensión');
  assert.equal(env.rows[0].reason,create.body.p_reason,'Conservar el motivo original al levantar');assert.equal(env.rows[0].release_reason,'Regreso autorizado');assert.equal(env.rows[0].released_by,'admin');
  assert.match(env.window.document.body.textContent,/Levantada/);assert.equal(env.window.document.querySelector('[data-as="release"]'),null);assert.equal(env.api.panel('photo'),'');
 }finally{await env.close();}
}

async function failureRecovery(){
 let env=await environment('admin',{loadFailure:true});
 try{
  await env.api.load();assert.match(env.api.state.error,/Fallo temporal/);assert.equal(env.api.state.loaded,false);assert.equal(env.window.document.querySelector('[data-as="suspend"]').disabled,true);
  env.click('reload');await until(()=>env.api.state.loaded,'recargar después del fallo');assert.equal(env.api.state.error,'');
 }finally{await env.close();}
 env=await environment('admin',{ambiguous:true});
 try{
  await env.api.load();env.fill();await env.api.action('suspend');
  assert.equal(env.rows.length,1,'Simular una escritura que llegó al servidor antes de perder la respuesta');assert.ok(env.api.state.pending);assert.equal(env.window.document.querySelector('[data-as="suspend"]').disabled,true);
  const pending=copy(env.api.state.pending);env.click('retry');await until(()=>!env.api.state.pending&&!env.api.state.busy,'reintento idempotente');
  assert.equal(env.rows.length,1,'La recuperación no duplica la suspensión');
  const writes=env.calls.filter(c=>!c.url.endsWith('_state'));assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[1].body.p_request_id,pending.body.p_request_id);
 }finally{await env.close();}
 env=await environment('admin',{rejectNext:error('Periodo no válido',400)});
 try{await env.api.load();env.fill();await env.api.action('suspend');assert.equal(env.api.state.pending,null,'Un rechazo definitivo permite corregir el formulario');assert.match(env.api.state.error,/Periodo no válido/);assert.equal(env.api.state.draft.reason,'Recuperación médica justificada');}
 finally{await env.close();}
}

async function roleAndAccountIsolation(){
 const row={id:'s1',user_id:'photo',start_date:'2026-11-02',end_date:'2026-11-05',reason:'Motivo privado de prueba',created_at:now,created_by:'admin',released_at:null};
 for(const role of ['foto','editora']){
  const env=await environment(role,{rows:[row]});
  try{await env.api.load();assert.equal(env.api.view(),'','El panel de administración no se ofrece a '+role);assert.equal(env.window.document.querySelector('[data-as="suspend"]'),null);await env.api.action('suspend');await env.api.action('release','s1');assert.equal(env.calls.length,1,'No enviar comandos de administración desde '+role);if(role==='foto')assert.match(env.api.panel('photo'),/Motivo privado/);else assert.equal(env.api.panel('editor'),'');}
  finally{await env.close();}
 }
 let gate=deferred(),env=await environment('admin',{stateGate:gate});
 try{
  const pending=env.api.load();env.switchUser('editora');gate.resolve({server_now:now,suspensions:[row]});await pending;
  assert.equal(env.api.state.rows.length,0,'Una respuesta iniciada por otra cuenta no entrega datos a la nueva');assert.equal(env.api.state.owner,'editor');assert.equal(env.api.state.loading,false);assert.equal(env.api.state.loaded,false);
 }finally{await env.close();}
 gate=deferred();env=await environment('admin',{commandGate:gate});
 try{
  await env.api.load();env.fill();const pending=env.api.action('suspend');await until(()=>env.api.state.busy,'comando pendiente');env.switchUser('foto');gate.resolve({server_now:now,suspensions:[row]});await pending;
  assert.equal(env.api.state.rows.length,0,'Una escritura anterior no sustituye los datos de otra sesión');assert.equal(env.api.state.pending,null);assert.equal(env.api.state.busy,false);assert.equal(env.changed,0);
 }finally{await env.close();}
}

async function sameAccountSessionIsolation(){
 const stale={id:'old-result',user_id:'photo',start_date:'2026-11-02',end_date:'2026-11-04',reason:'Resultado de sesión anterior',created_at:now,created_by:'admin',released_at:null};
 let first=deferred(),next=deferred(),options={stateGate:first},env=await environment('admin',options);
 try{
  const oldLoad=env.api.load();env.switchUser('editora');env.switchUser('admin');options.stateGate=next;const currentLoad=env.api.load();
  first.resolve({server_now:now,suspensions:[stale]});await oldLoad;
  assert.equal(env.api.state.rows.length,0,'El resultado de la sesión anterior no se acepta aunque vuelva a coincidir el ID');
  assert.equal(env.api.state.loading,true,'La consulta antigua no desbloquea una consulta de la sesión actual');
  assert.equal(env.api.state.loaded,false);
  next.resolve({server_now:now,suspensions:[]});await currentLoad;assert.equal(env.api.state.loading,false);assert.equal(env.api.state.loaded,true);
 }finally{await env.close();}
 first=deferred();next=deferred();options={commandGate:first};env=await environment('admin',options);
 try{
  await env.api.load();env.fill();const oldWrite=env.api.action('suspend');env.switchUser('foto');env.switchUser('admin');await env.api.load();
  options.commandGate=next;env.fill({reason:'Solicitud de la sesión actual'});const currentWrite=env.api.action('suspend'),currentRequest=copy(env.api.state.pending);
  first.resolve({server_now:now,suspensions:[stale]});await oldWrite;
  assert.deepEqual(copy(env.api.state.pending),currentRequest,'Una escritura antigua no borra la solicitud actual al volver a la misma cuenta');
  assert.equal(env.api.state.busy,true);assert.equal(env.api.state.rows.length,0);assert.equal(env.changed,0);
  next.resolve({server_now:now,suspensions:[]});await currentWrite;assert.equal(env.api.state.pending,null);assert.equal(env.api.state.busy,false);assert.equal(env.changed,1);
 }finally{await env.close();}
 const changedGate=deferred();options={changedGate};env=await environment('admin',options);
 try{
  await env.api.load();env.fill();const oldWrite=env.api.action('suspend');await until(()=>env.changed===1,'recarga del portal posterior al cambio');
  env.switchUser('foto');env.switchUser('admin');await env.api.load();options.commandGate=deferred();options.changedGate=null;
  env.fill({reason:'Otra solicitud después de volver a iniciar sesión'});const currentWrite=env.api.action('suspend'),currentRequest=copy(env.api.state.pending);
  changedGate.reject(error('Falló una recarga iniciada en la sesión anterior',503));await oldWrite;
  assert.equal(env.api.state.error,'','Un fallo posterior de la sesión anterior no se presenta en la sesión actual');assert.equal(env.api.state.busy,true);assert.deepEqual(copy(env.api.state.pending),currentRequest);
  options.commandGate.resolve({server_now:now,suspensions:[]});await currentWrite;assert.equal(env.api.state.busy,false);
 }finally{await env.close();}
}

function forecastAndCoverage(){
 function extract(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end<0?html.length:end).trim();}
 const context={Intl,Date,console};vm.createContext(context);
 for(const name of ['tsi11LocalDate','tsi11Add','tsi11Monday','tsi11DefaultDeadline','tsi11Latest','tsi11Color','tsi225Suspended','tsi11Forecast','riStartAllowed','d29Minutes','d29Day','d29Availability'])vm.runInContext(extract(name),context);
 const suspension={start_date:'2026-11-03',end_date:'2026-11-04',released_at:null};
 const state={server_now:now,model:{id:'test',parameters:{min_completed_jobs:3}},capacity:[{week_start:'2026-11-02',version:1,daily_minutes:[120,180,240,300]}],estimates:[],sessions:[],matches:[],suspensions:[]};
 assert.equal(context.tsi11Forecast(state).current.capacity_minutes,840);
 state.suspensions=[suspension];assert.equal(context.tsi11Forecast(state).current.capacity_minutes,420,'Restar exclusivamente los días suspendidos del pronóstico');
 assert.deepEqual(state.capacity[0].daily_minutes,[120,180,240,300],'El pronóstico conserva la declaración original');
 state.suspensions=[Object.assign({},suspension,{released_at:now})];assert.equal(context.tsi11Forecast(state).current.capacity_minutes,840,'Levantar recupera el horario declarado');
 const schedule=Array.from({length:7},()=>({available:true,start:'15:00',end:'23:00'})),person={history:[{week_start:'2026-11-02',version:1,schedule}],suspensions:[suspension]};
 const match={date:'2026-11-03',time:'16:00'};
 assert.equal(context.riStartAllowed(person,match),false,'No proponer una cobertura en un día suspendido');assert.equal(context.d29Availability(person,match).allowed,false,'No recomendar coberturas en días suspendidos');
 assert.equal(context.riStartAllowed(person,{date:'2026-11-02',time:'16:00'}),true,'Conservar propuestas fuera del periodo');assert.equal(context.riStartAllowed(person,{date:'2026-11-04',time:'16:00'}),false,'El fin del periodo está incluido');
 person.suspensions[0].released_at=now;assert.equal(context.riStartAllowed(person,match),true);assert.equal(context.d29Availability(person,match).allowed,true);
 assert.equal(person.history[0].schedule[1].available,true,'La suspensión no borra el horario original');
  assert.ok(new RegExp('<script src="'+modulePath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\?v=(?:225|2\\.2\\.5)"></script>').test(html),'La página carga el módulo de suspensiones');assert.ok(html.includes('suspensiones:tabAvailabilitySuspensions'),'La ruta de administración está conectada');
}

async function pageIntegration(){
 const {Window}=await import('happy-dom'),server=html.match(/var SBU="([^"]+)"/)[1],key=html.match(/localStorage\.setItem\(["']([^"']+_auth)["']/)[1];
 const profiles=users.map((u,i)=>({...u,id:'00000000-0000-4000-8000-00000000000'+(i+1),email:u.role+'@test.invalid'}));
 for(const role of ['admin','foto','editora']){
  const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/'+(production?'':'staging/'),settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),uid=profiles.find(p=>p.role===role).id;
  Object.defineProperty(window,'crypto',{value:crypto.webcrypto});window.setInterval=()=>0;window.clearInterval=()=>{};window.document.body.innerHTML='<main id="app"></main>';
  const rows=[{id:'s1',user_id:uid,start_date:'2026-11-02',end_date:'2026-11-04',reason:'Aviso de suspensión de prueba',created_at:now,created_by:profiles[0].id,released_at:null}];
  const intelligence={server_now:now,model:{id:'test',parameters:{min_completed_jobs:3}},capacity:[],sessions:[],estimates:[],matches:[],events:[],snapshots:[],suspensions:[]};
  const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  window.fetch=async input=>{const url=new URL(String(input));assert.equal(url.origin,server,'La página solo llama al proyecto de su entorno');if(url.pathname==='/rest/v1/profiles')return response(profiles);if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}]);if(url.pathname==='/rest/v1/rpc/tsi11_state')return response(intelligence);if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({server_now:now,photographers:profiles.filter(p=>p.role==='foto').map(p=>({...p,history:[]}))});if(url.pathname==='/rest/v1/rpc/tsi225_availability_suspensions_state')return response({server_now:now,suspensions:rows});if(url.pathname==='/rest/v1/rpc/tsi210_state')return response({version:'2.1.0',teams:[],team_matches:[],rates:[],quotes:[],quote_costs:[],costs:[],deliveries:[],audit:[]});return response([]);};
  const token='test.'+Buffer.from(JSON.stringify({iss:server+'/auth/v1'})).toString('base64url')+'.test';window.localStorage.setItem(key,JSON.stringify({access:token,uid,exp:Date.now()/1000+3600}));
  try{
   for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
    const src=match[1].match(/\bsrc="([^"]+)"/);let code=src?fs.readFileSync(path.resolve(pageRoot,src[1].split('?')[0]),'utf8'):match[2];
    if(code.includes('var SBU=')){const end=code.lastIndexOf('})();');code=code.slice(0,end)+'window.__suspensionPage={S:S,AS:AS225,render:function(){render();}};\n'+code.slice(end);}
    if(code.trim())window.eval(code);
   }
   await until(()=>window.__suspensionPage?.S.meId===uid&&!window.__suspensionPage.S.booting&&window.__suspensionPage.AS.state.loaded,'arranque de página '+role);
   const api=window.__suspensionPage;api.S.view='dash';api.S.tab='resumen';api.render();
   const menu=window.document.querySelector('nav [data-tab="suspensiones"]');
   if(role==='admin'){
    assert.ok(menu,'El menú de administración ofrece suspensiones');menu.click();assert.equal(api.S.tab,'suspensiones');assert.ok(window.document.querySelector('[data-as="suspend"]'),'La ruta presenta el formulario conectado');assert.match(window.document.body.textContent,/Aviso de suspensión de prueba/);
   }else{
    assert.equal(menu,null,'El menú propio no expone administración');api.S.tab=role==='foto'?'disponibilidad':'disponibilidadedicion';api.render();
    await until(()=>window.document.body.textContent.includes('Aviso de suspensión de prueba'),'aviso propio '+role);assert.equal(window.document.querySelector('[data-as="suspend"]'),null);
   }
  }finally{await window.happyDOM.cancelAsync();window.close();}
 }
}

(async()=>{await controlsAndHistory();await failureRecovery();await roleAndAccountIsolation();await sameAccountSessionIsolation();forecastAndCoverage();await pageIntegration();console.log('Suspensiones: permisos de interfaz, motivos y fechas, guardado y levantamiento, escape de texto, fallos y reintentos idempotentes, aislamiento de sesión y reingreso a la misma cuenta, capacidad, propuestas de cobertura y navegación de la página completa aprobados.');})().catch(e=>{console.error(e);process.exitCode=1;});
