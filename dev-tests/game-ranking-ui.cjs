const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.join(__dirname,'..','staging'),STAGING='https://nksqpoigywfegcbvfhoa.supabase.co';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),plain=value=>JSON.parse(JSON.stringify(value));
async function until(check,message){for(let i=0;i<200;i++){if(check())return;await pause(5);}throw Error('No se completó: '+message);}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const cameraSettings={shutter:500,aperture:2.8,iso:400};
const editingSettings={exposure:0,temperature:0,highlights:0,shadows:0,contrast:0,saturation:0,crop:'original',panX:0,panY:0};
const entries=[
 {user_id:'one',name:'Primera <img src=x onerror=alert(1)>',rank:1,total_score:1800,challenges:20},
 {user_id:'two',name:'Segundo & equipo',rank:1,total_score:1800,challenges:20},
 {user_id:'three',name:'Tercera',rank:3,total_score:1750,challenges:19},
 {user_id:'mine',name:'Mi cuenta',rank:4,total_score:900,challenges:10}
];
async function environment(options={}){
 const {Window}=await import('happy-dom'),window=new Window({url:'https://test.invalid/staging/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 window.document.body.innerHTML='<main id="app"></main>';
 let current=options.role===null?null:{id:'mine',role:options.role||'foto',name:'Mi cuenta'},handler=options.handler||(()=>({entries:[],server_now:'2026-10-23T04:00:00Z'})),screen=null,game=null;
 const calls=[],errors=[];
 window.addEventListener('error',event=>errors.push(event.error||event.message));
 window.eval(fs.readFileSync(path.join(base,'game-ranking.js'),'utf8'));
 function render(){
  const app=window.document.getElementById('app');
  if(game){app.innerHTML=game.render();game.afterRender();}
  else if(screen){app.innerHTML='<div class="pg-shell">'+ranking.attemptMarkup(screen.game,screen.sceneId,screen.settings)+'</div>';}
  else{app.innerHTML=ranking.render();ranking.afterRender();}
 }
 const ranking=window.TSIGameRanking.create({me:()=>current,server:options.server||STAGING,render,request:async(method,url,body)=>{calls.push({method,url,body:plain(body)});return handler(method,url,body);}});
 function click(selector){const button=window.document.querySelector(selector);assert.ok(button,'Control '+selector);button.click();}
 return {window,ranking,calls,errors,render,click,setHandler:value=>handler=value,setUser:value=>current=value,
  setScreen:value=>{screen=value;game=null;render();},setGame:value=>{game=value;screen=null;render();},
  close:async()=>{if(game&&game.destroy)game.destroy();ranking.destroy();await window.happyDOM.cancelAsync();window.close();}};
}
async function rankings(){
 const first=deferred(),env=await environment({handler:()=>first.promise});
 try{
  env.render();assert.ok(env.window.document.querySelector('.gr-loading'),'Mientras consulta hay un estado de carga');
  assert.equal(env.window.document.querySelectorAll('.gr-podium-card').length,0,'La carga no inventa puntuaciones');
  await until(()=>env.calls.length===1,'petición inicial');
  first.resolve({entries,server_now:'2026-10-23T04:00:00Z'});
  await until(()=>env.ranking.snapshot().state.phase==='ready','clasificación cargada');
  const doc=env.window.document;
  assert.equal(doc.querySelectorAll('.gr-podium-card').length,3,'Los tres primeros puestos forman el podio');
  assert.equal(doc.querySelectorAll('.gr-place-1').length,2,'Un empate conserva el mismo puesto');
  assert.equal(doc.querySelectorAll('.gr-row').length,1,'Los demás participantes siguen en la clasificación');
  assert.ok(doc.querySelector('.gr-row.gr-self'),'La fila de la cuenta actual queda identificada');
  assert.match(doc.querySelector('.gr-your-place').textContent,/4.*900/,'Se muestra el puesto propio');
  assert.equal(doc.querySelectorAll('.gr-shell img').length,0,'Los nombres de participantes se escapan');
  assert.match(doc.querySelector('.gr-podium').textContent,/<img src=x onerror=alert\(1\)>/,'El nombre se trata como texto');
  assert.match(doc.querySelector('.gr-rules').textContent,/mejor puntuación de cada reto/,'Se explica que cuenta la mejor marca por reto');
  assert.match(doc.querySelector('.gr-rules').textContent,/intentos no añade puntos/,'Los intentos no se presentan como puntos');
  for(const filter of ['camera','editing','all']){
   env.setHandler(()=>({entries:[],server_now:'2026-10-23T04:00:00Z'}));
   env.click('[data-gr-filter="'+filter+'"]');
   await until(()=>env.ranking.snapshot().state.phase==='ready','filtro '+filter);
   assert.equal(env.calls.at(-1).body.p_game,filter,'El filtro solicita su clasificación');
   assert.equal(doc.querySelector('[data-gr-filter="'+filter+'"]').getAttribute('aria-pressed'),'true','El filtro indica su estado');
   assert.ok(doc.querySelector('.gr-empty'),'Un ranking vacío tiene un estado real sin participantes ficticios');
   assert.equal(doc.querySelectorAll('.gr-podium-card,.gr-row').length,0);
  }
  env.setHandler(()=>{throw Error('Servicio temporalmente caído');});env.click('[data-gr-action="reload"]');
  await until(()=>env.ranking.snapshot().state.phase==='error','fallo de consulta');
  assert.ok(doc.querySelector('.gr-error [data-gr-action="reload"]'),'Una consulta fallida permite reintentar');
  assert.equal(doc.querySelectorAll('.gr-podium-card').length,0,'Una consulta fallida no muestra resultados viejos como actuales');
  env.setHandler(()=>({entries}));env.click('.gr-error [data-gr-action="reload"]');
  await until(()=>env.ranking.snapshot().state.phase==='ready','reintento de consulta');
  assert.equal(doc.querySelectorAll('.gr-podium-card').length,3,'Reintentar recupera el podio');
  env.setHandler(()=>({entries:'incomplete'}));env.click('[data-gr-action="reload"]');
  await until(()=>env.ranking.snapshot().state.phase==='error','respuesta incompleta');
  assert.equal(doc.querySelectorAll('.gr-podium-card').length,0,'Una respuesta incompleta se muestra como fallo');
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
}
async function submissions(){
 const pending=deferred(),env=await environment({handler:()=>pending.promise});
 try{
  env.setScreen({game:'camera',sceneId:'night-action',settings:cameraSettings});
  const result=env.ranking.submit('camera','night-action',Object.assign({score:100,passed:true,user_id:'someone-else'},cameraSettings));env.render();
  assert.match(env.window.document.querySelector('.gr-attempt').textContent,/práctica.*Enviando/,'Un resultado local sigue siendo de práctica mientras espera confirmación');
  assert.equal(env.window.document.querySelectorAll('.gr-attempt-saved').length,0);
  await until(()=>env.calls.length===1,'envío del intento');
  assert.deepEqual(env.calls[0].body,{game:'camera',sceneId:'night-action',settings:cameraSettings},'El servidor recibe ajustes, sin puntuación ni identidad elegida por el cliente');
  pending.resolve({accepted:true});await result;
  assert.ok(env.window.document.querySelector('.gr-attempt-saved'),'Solo una confirmación del servidor presenta el intento como compartido');
  env.setHandler(()=>{throw Error('Sin red');});
  env.setScreen({game:'editing',sceneId:'night-detail',settings:editingSettings});
  const failed=env.ranking.submit('editing','night-detail',editingSettings);env.render();await failed;
  assert.ok(env.window.document.querySelector('.gr-attempt-error'),'El fallo se limita al envío de ranking');
  assert.match(env.window.document.querySelector('.gr-attempt-error').textContent,/práctica.*No se pudo confirmar/);
  assert.ok(env.window.document.querySelector('[data-gr-action="resubmit"]'),'El envío fallido puede reintentarse');
  env.setHandler(()=>({accepted:true}));env.click('[data-gr-action="resubmit"]');
  await until(()=>!!env.window.document.querySelector('.gr-attempt-saved'),'reintento confirmado');
  assert.deepEqual(env.calls.at(-1).body,{game:'editing',sceneId:'night-detail',settings:editingSettings});
  const before=env.calls.length;
  await env.ranking.submit('camera','bad',{shutter:NaN,aperture:2.8,iso:100});
  assert.equal(env.calls.length,before,'Ajustes inválidos no generan peticiones');
  assert.equal(env.ranking.attemptMarkup('editing','other-scene',editingSettings),'','La confirmación no se atribuye a otro reto');
  env.setHandler(()=>({accepted:false}));env.setScreen({game:'camera',sceneId:'night-action',settings:cameraSettings});
  const unconfirmed=env.ranking.submit('camera','night-action',cameraSettings);env.render();await unconfirmed;
  assert.ok(env.window.document.querySelector('.gr-attempt-error'),'Una respuesta sin aceptación no se presenta como confirmada');
  env.setUser({id:'another',role:'foto',name:'Otra persona'});env.render();
  assert.equal(env.window.document.querySelectorAll('.gr-attempt').length,0,'Otra cuenta no hereda confirmaciones de la anterior');
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
}
async function staleAndUnauthorized(){
 const old=deferred(),fresh=deferred(),env=await environment({handler:()=>old.promise});
 try{
  env.render();await until(()=>env.calls.length===1,'consulta de la primera cuenta');
  env.setUser({id:'another',role:'editora',name:'Otra persona'});env.setHandler(()=>fresh.promise);env.render();
  await until(()=>env.calls.length===2,'consulta de la cuenta siguiente');
  old.resolve({entries});await pause(10);
  assert.equal(env.window.document.querySelectorAll('.gr-podium-card').length,0,'Una respuesta de la cuenta anterior se descarta');
  fresh.resolve({entries:[]});await until(()=>env.ranking.snapshot().state.phase==='ready','respuesta de la cuenta vigente');
  assert.ok(env.window.document.querySelector('.gr-empty'));
  const late=deferred();env.setHandler(()=>late.promise);
  env.setScreen({game:'camera',sceneId:'night-action',settings:cameraSettings});const submission=env.ranking.submit('camera','night-action',cameraSettings);
  await until(()=>env.calls.length===3,'intento de la segunda cuenta');
  env.setUser(null);env.render();late.resolve({accepted:true});await submission;
  assert.equal(env.window.document.querySelectorAll('.gr-attempt-saved').length,0,'Cerrar sesión descarta una confirmación pendiente');
 }finally{await env.close();}
 const inactive=await environment();
 try{
  const attempt=inactive.ranking.submit('camera','night-action',cameraSettings);
  inactive.setUser(null);await attempt;
  assert.equal(inactive.calls.length,0,'Cerrar sesión antes del envío impide la petición pendiente');
 }finally{await inactive.close();}
 for(const options of [{role:null},{role:'pending'},{role:'viewer'},{role:'foto',server:'https://tantlgswituiwkxfgmsr.supabase.co'}]){
  const denied=await environment(options);
  try{
   denied.render();assert.equal(denied.window.document.querySelectorAll('.gr-shell').length,0,'El ranking requiere rol permitido y staging');
   await denied.ranking.submit('camera','night-action',cameraSettings);
   assert.equal(denied.calls.length,0,'Una cuenta o entorno no permitido no consulta ni envía resultados');
  }finally{await denied.close();}
 }
}
async function gamesKeepWorking(){
 for(const kind of ['camera','editing']){
  const env=await environment({handler:()=>{throw Error('Ranking sin conexión');}});
  try{
   const w=env.window;
   w.eval(fs.readFileSync(path.join(base,'photo-game-model.js'),'utf8'));
   w.eval(fs.readFileSync(path.join(base,'photo-game.js'),'utf8'));
   w.eval(fs.readFileSync(path.join(base,'editing-game-model.js'),'utf8'));
   w.TSIEditingRenderer={create:()=>({draw:async()=>({width:1400,height:788}),destroy:()=>{}})};
   w.eval(fs.readFileSync(path.join(base,'editing-game.js'),'utf8'));
   const game=(kind==='camera'?w.TSIPhotoGame:w.TSIEditingGame).create({me:()=>({id:'mine',role:'foto'}),server:STAGING,render:env.render,ranking:env.ranking});
   env.setGame(game);
   assert.ok(w.document.querySelector('[data-tab="rankingjuegos"]'),kind+': hay acceso al podio');
   if(kind==='editing')await until(()=>game.snapshot().imageReady,'foto del editor lista');
   env.click(kind==='camera'?'[data-pg-action="shoot"]':'[data-eg-action="evaluate"]');
   const image=w.document.querySelector(kind==='camera'?'.pg-photo':'.eg-canvas');
   await until(()=>env.calls.length===1&&!!w.document.querySelector('.gr-attempt-error'),kind+': fallo del ranking informado');
   assert.equal(w.document.querySelector(kind==='camera'?'.pg-photo':'.eg-canvas'),image,kind+': el envío no vuelve a construir la foto ni interrumpe los ajustes');
   const snap=game.snapshot();
   assert.ok(snap.result,kind+': la evaluación local se conserva aunque falle el ranking');
   assert.equal(kind==='camera'?snap.stats.shots:snap.stats.evaluations,1,kind+': el intento de práctica sigue registrado');
   assert.equal(env.calls[0].body.game,kind);
   assert.equal(env.calls[0].body.sceneId,snap.sceneId);
   assert.deepEqual(env.calls[0].body.settings,plain(snap.captured));
   assert.match(w.document.querySelector(kind==='camera'?'.pg-score':'.eg-score').textContent,/PRÁCTICA/,'La puntuación local se identifica como práctica');
   assert.deepEqual(env.errors,[]);
  }finally{await env.close();}
 }
}
(async()=>{await rankings();await submissions();await staleAndUnauthorized();await gamesKeepWorking();console.log('Ranking UI: podio, filtros, empates, nombres escapados, vacío/carga/error/reintento, confirmación remota, cuentas aisladas y práctica sin conexión aprobados.');})().catch(error=>{console.error(error);process.exitCode=1;});
