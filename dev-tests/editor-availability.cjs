const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');

const root=path.join(__dirname,'..');
const htmlPath=path.resolve(root,process.argv[2]||'index.html');
const html=fs.readFileSync(htmlPath,'utf8');
const serverUrl=html.match(/var SBU="([^"]+)"/)[1];
const authKey=html.match(/localStorage\.setItem\(["']([^"']+_auth)["']/)[1];
const tab='disponibilidadedicion';
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003'};
const profiles=Object.keys(ids).map(role=>({id:ids[role],email:role+'@test.invalid',name:'Usuario '+role,role}));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message){for(let i=0;i<150;i++){if(check())return;await delay(10);}throw Error('No se completó: '+message);}
function fixture(){return {capacity:[],events:[]};}

async function environment(role,server=fixture(),options={}){
 const {Window}=await import('happy-dom');
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/'+(htmlPath.includes(path.sep+'staging'+path.sep)?'staging/':''),settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});
 window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 window.document.body.innerHTML='<div id="app"></div>';
 const calls=[],uid=ids[role];let failures=options.failStates||0,releaseState;
 const stateGate=options.deferState?new Promise(resolve=>{releaseState=resolve;}):Promise.resolve();
 const state=()=>({server_now:'2026-10-22T18:00:00.000Z',model:{id:'test-model',parameters:{min_completed_jobs:3}},capacity:server.capacity,estimates:[],sessions:[],matches:[],events:server.events,snapshots:[]});
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 window.fetch=async(input,request={})=>{
  const url=new URL(String(input)),method=request.method||'GET',body=request.body?JSON.parse(request.body):{};
  assert.equal(url.origin,serverUrl,'Todas las solicitudes deben usar el proyecto del HTML probado');
  calls.push({path:url.pathname,method,body});
  if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}]);
  if(url.pathname==='/rest/v1/profiles')return response(profiles);
  if(url.pathname==='/rest/v1/rpc/tsi11_state'){
   await stateGate;
   if(failures-->0)return response({message:'Disponibilidad temporalmente no disponible'},503);
   return response(state());
  }
  if(url.pathname==='/rest/v1/rpc/tsi11_command'){
   assert.equal(body.operation,'capacity');
   assert.equal(role,'editora','Solo la editora debe enviar confirmaciones de disponibilidad');
   assert.equal(body.payload.editor_id,uid,'La editora declara su propia disponibilidad');
   const p=body.payload,previous=server.capacity.filter(c=>c.week_start===p.week_start);
   server.capacity.push({editor_id:p.editor_id,week_start:p.week_start,daily_minutes:p.daily_minutes,reason:p.reason,version:previous.length+1,confirmed_at:state().server_now});
   server.events.push({operation:'capacity',happened_at:state().server_now,payload:p});
   return response(state());
  }
  if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({server_now:state().server_now,photographers:[]});
  if(url.pathname==='/rest/v1/rpc/tsi210_state')return response({version:'2.1.0',teams:[],team_matches:[],rates:[],quotes:[],quote_costs:[],costs:[],deliveries:[],audit:[]});
  return response([]);
 };
 const token='test.'+Buffer.from(JSON.stringify({iss:serverUrl+'/auth/v1'})).toString('base64url')+'.test';
 window.localStorage.setItem(authKey,JSON.stringify({access:token,uid,exp:Date.now()/1000+3600}));
 const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
 let main=scripts.map((match,index)=>({index,text:match[2]})).filter(s=>s.text.includes('var SBU=')).pop();
 assert.ok(main,'Script principal de la página');
 for(let i=0;i<scripts.length;i++){
  const [,attributes,inline]=scripts[i],src=attributes.match(/\bsrc="([^"]+)"/);
  if(src){window.eval(fs.readFileSync(path.resolve(path.dirname(htmlPath),src[1].split('?')[0]),'utf8'));continue;}
  let source=inline;
  if(i===main.index){const end=source.lastIndexOf('})();');assert.ok(end>0);source=source.slice(0,end)+'window.__availabilityTest={S:S,TI:TI,render:function(){render();},tabsFor:tabsFor};\n'+source.slice(end);}
  if(source.trim())window.eval(source);
 }
 await until(()=>window.__availabilityTest?.S.meId===uid&&!window.__availabilityTest.S.booting,'arranque '+role);
 const api=window.__availabilityTest;api.S.view='dash';api.S.tab='resumen';api.render();
 if(role!=='foto'&&!options.deferState)await until(()=>api.TI.state||api.TI.error,'carga de TSI '+role);
 function click(selector){const element=window.document.querySelector(selector);assert.ok(element,'Control '+selector);element.click();return element;}
 function go(target){api.S.tab=target;api.render();}
 return {window,api,calls,server,click,go,releaseState,close:async()=>{if(releaseState)releaseState();await window.happyDOM.cancelAsync();window.close();}};
}

async function main(){
 const server=fixture();let env=await environment('editora',server);
 try{
  const {window,api,click}=env,doc=window.document;
  const menu=doc.querySelector('nav [data-tab="'+tab+'"]');
  assert.ok(menu,'El menú de editora ofrece disponibilidad de edición');
  assert.match(menu.textContent,/Disponibilidad de edición/i);
  const shortcut=doc.querySelector('.d29-actions [data-tab="'+tab+'"]');
  assert.ok(shortcut,'El inicio ofrece acceso directo a la disponibilidad de edición');
  shortcut.click();assert.equal(api.S.tab,tab,'El acceso de inicio navega a disponibilidad');
  click('nav [data-tab="resumen"]');assert.equal(api.S.tab,'resumen');
  click('nav [data-tab="'+tab+'"]');assert.equal(api.S.tab,tab,'El menú navega a disponibilidad');
  const weeks=[...new Set(Array.from(doc.querySelectorAll('[data-ti-cap]'),element=>element.getAttribute('data-ti-cap')))];
  assert.equal(weeks.length,5,'Se pueden declarar cinco semanas');
  assert.equal(doc.querySelectorAll('[data-ti-cap]').length,20,'Cada semana conserva los cuatro días de edición');
  assert.equal(doc.querySelectorAll('[data-ti="capacity"]').length,5,'Cada semana tiene confirmación propia');
  const week=weeks[0],minutes=[75,90,0,375],selects=Array.from(doc.querySelectorAll('[data-ti-cap="'+week+'"]'));
  selects.forEach((select,index)=>{assert.equal(select.disabled,false);select.value=String(minutes[index]);select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  const reason=doc.querySelector('[data-ti-cap-reason="'+week+'"]');reason.value='Horario real con intervalos de 15 minutos';reason.dispatchEvent(new window.Event('input',{bubbles:true}));
  click('[data-ti="capacity"][data-week="'+week+'"]');
  await until(()=>server.capacity.length===1&&!api.TI.busy&&!api.TI.request,'confirmación de disponibilidad');
  const call=env.calls.find(call=>call.path==='/rest/v1/rpc/tsi11_command');assert.ok(call);
  assert.deepEqual(call.body.payload.daily_minutes,minutes);
  assert.equal(call.body.payload.reason,'Horario real con intervalos de 15 minutos');
  assert.equal(call.body.payload.editor_id,ids.editora);
  assert.match(call.body.request_id,/^[0-9a-f-]{36}$/i);
  const reopened=await environment('editora',server);
  try{
   reopened.click('nav [data-tab="'+tab+'"]');
   // happy-dom 21 no aplica siempre selected al parsear listas largas; comprobar
   // la opción marcada por el renderer y el estado que devolvió el servidor.
   assert.deepEqual(Array.from(reopened.window.document.querySelectorAll('[data-ti-cap="'+week+'"]'),element=>Number(element.querySelector('option[selected]').value)),minutes,'Una nueva sesión muestra las horas confirmadas');
   assert.deepEqual(JSON.parse(JSON.stringify(reopened.api.TI.state.capacity[0].daily_minutes)),minutes,'La recarga conserva las horas guardadas en el servidor');
   assert.match(reopened.window.document.body.textContent,/Confirmada · versión 1/);
   assert.equal(reopened.calls.filter(call=>call.path==='/rest/v1/rpc/tsi11_command').length,0,'La recarga no vuelve a guardar');
  }finally{await reopened.close();}
 }finally{await env.close();}

 env=await environment('editora',fixture(),{deferState:true});
 try{
  env.click('nav [data-tab="'+tab+'"]');
  assert.equal(env.window.document.querySelectorAll('[data-ti="capacity"]').length,0,'No se presentan controles antes de cargar disponibilidad');
  assert.match(env.window.document.body.textContent,/Cargando|Preparando/i);
  env.releaseState();await until(()=>env.api.TI.state,'respuesta diferida');
  assert.equal(env.window.document.querySelectorAll('[data-ti="capacity"]').length,5);
 }finally{await env.close();}

 env=await environment('editora',fixture(),{failStates:1});
 try{
  env.click('nav [data-tab="'+tab+'"]');
  assert.match(env.window.document.body.textContent,/Disponibilidad temporalmente no disponible/);
  assert.equal(env.window.document.querySelectorAll('[data-ti="capacity"]').length,0,'Un fallo de carga no muestra un formulario vacío');
  env.click('[data-ti="reload"]');await until(()=>env.api.TI.state&&!env.api.TI.error,'reintento de carga');
  assert.equal(env.window.document.querySelectorAll('[data-ti="capacity"]').length,5);
 }finally{await env.close();}

 for(const role of ['admin','foto']){
  env=await environment(role);
  try{
   assert.ok(!env.api.tabsFor(role).some(entry=>entry[0]===tab),role+': sin pestaña de declaración de editora');
   assert.equal(env.window.document.querySelectorAll('[data-tab="'+tab+'"]').length,0,role+': sin acceso en menú o inicio');
   env.go(tab);
   assert.equal(env.window.document.querySelectorAll('[data-ti="capacity"]').length,0,role+': una ruta forzada tampoco ofrece guardar');
   if(role==='admin'){
    env.go('intelligence');
    const selects=Array.from(env.window.document.querySelectorAll('[data-ti-cap]'));
    assert.equal(selects.length,20,'Administración conserva consulta de disponibilidad');
    assert.ok(selects.every(element=>element.disabled),'Administración consulta las horas sin modificarlas');
    assert.equal(env.window.document.querySelectorAll('[data-ti="capacity"]').length,0);
   }
   assert.equal(env.calls.filter(call=>call.path==='/rest/v1/rpc/tsi11_command').length,0);
  }finally{await env.close();}
 }
 console.log('Disponibilidad de edición: menú e inicio por rol, navegación, cinco semanas, guardado propio en intervalos de 15 minutos, recarga y recuperación de carga aprobados ('+path.relative(root,htmlPath)+').');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
