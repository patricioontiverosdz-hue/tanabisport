const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');

// Ejecuta el portal completo con perfiles y RPC de lectura simulados. El juego
// debe poder usarse sin escribir ningún dato operativo en Supabase.
const root=path.join(__dirname,'..'),htmlPath=path.join(root,'staging/index.html');
const html=fs.readFileSync(htmlPath,'utf8'),serverUrl=html.match(/var SBU="([^"]+)"/)[1];
const authKey=html.match(/localStorage\.setItem\(["']([^"']+_auth)["']/)[1];
const project=new URL(serverUrl).hostname.split('.')[0],tab='fotojuego';
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003',pending:'00000000-0000-4000-8000-000000000004',otherFoto:'00000000-0000-4000-8000-000000000005'};
const profiles=Object.keys(ids).map(key=>({id:ids[key],email:key+'@test.invalid',name:'Usuario '+key,role:key==='otherFoto'?'foto':key}));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const plain=value=>JSON.parse(JSON.stringify(value));
async function until(check,message){for(let i=0;i<200;i++){if(check())return;await delay(10);}throw Error('No se completó: '+message);}

async function environment(role,options={}){
 const {Window}=await import('happy-dom'),uid=role?options.uid||ids[role]:null;
 const url='https://patricioontiverosdz-hue.github.io/tanabisport/staging/'+(options.query||'');
 const window=new Window({url,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});
 window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 // Esta prueba verifica el flujo DOM; la textura visual se revisa en navegador.
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 window.document.body.innerHTML='<div id="app"></div>';
 const calls=[],errors=[];
 window.addEventListener('error',event=>errors.push(event.error||event.message));
 const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 const state=()=>({server_now:'2026-10-22T18:00:00.000Z',model:{parameters:{min_completed_jobs:3}},capacity:[],estimates:[],sessions:[],matches:[],events:[],snapshots:[]});
 const readRPCs=new Set(['/rest/v1/rpc/tsi11_state','/rest/v1/rpc/tsi11_photographer_risks','/rest/v1/rpc/tsi11_photo_availability_state','/rest/v1/rpc/tsi210_state']);
 window.fetch=async(input,request={})=>{
  const url=new URL(String(input)),method=request.method||'GET',body=request.body?JSON.parse(request.body):{};
  assert.equal(url.origin,serverUrl,'El portal probado solo consulta el proyecto staging');
  calls.push({path:url.pathname,method,body});
  assert.ok(method==='GET'||method==='POST'&&readRPCs.has(url.pathname),'El juego no debe generar escrituras: '+method+' '+url.pathname);
  if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}]);
  if(url.pathname==='/rest/v1/profiles')return response(profiles);
  if(url.pathname==='/rest/v1/rpc/tsi11_state')return response(state());
  if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({server_now:state().server_now,photographers:[]});
  if(url.pathname==='/rest/v1/rpc/tsi210_state')return response({version:'2.1.0',teams:[],team_matches:[],rates:[],quotes:[],quote_costs:[],costs:[],deliveries:[],audit:[]});
  return response([]);
 };
 for(const [key,value] of options.saved||[])window.localStorage.setItem(key,value);
 if(uid){
  const token='test.'+Buffer.from(JSON.stringify({iss:serverUrl+'/auth/v1'})).toString('base64url')+'.test';
  window.localStorage.setItem(authKey,JSON.stringify({access:token,uid,exp:Date.now()/1000+3600}));
 }else window.localStorage.removeItem(authKey);
 const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
 const main=scripts.map((match,index)=>({index,text:match[2]})).filter(script=>script.text.includes('var SBU=')).pop();
 assert.ok(main,'Existe el script principal del portal');
 for(let i=0;i<scripts.length;i++){
  const [,attributes,inline]=scripts[i],src=attributes.match(/\bsrc="([^"]+)"/);
  if(src){
   assert.ok(!/^https?:/i.test(src[1]),'El juego y sus módulos se sirven localmente');
   window.eval(fs.readFileSync(path.resolve(path.dirname(htmlPath),src[1].split('?')[0]),'utf8'));continue;
  }
  let source=inline;
  if(i===main.index){
   const end=source.lastIndexOf('})();');assert.ok(end>0);
   source=source.slice(0,end)+'window.__photoGameTest={S:S,PG:typeof PG!=="undefined"?PG:null,render:function(){render();},tabsFor:tabsFor};\n'+source.slice(end);
  }
  if(source.trim())window.eval(source);
 }
 await until(()=>window.__photoGameTest&&!window.__photoGameTest.S.booting&&(!uid||window.__photoGameTest.S.meId===uid),'arranque '+(role||'sin sesión'));
 const api=window.__photoGameTest;
 if(!options.keepInitial){api.S.view='dash';api.S.tab='resumen';api.render();}
 await delay(25);
 function click(selector){const el=window.document.querySelector(selector);assert.ok(el,'Control '+selector);el.click();return el;}
 function go(target){api.S.view='dash';api.S.tab=target;api.render();}
 function snapshot(){assert.ok(api.PG,'El juego está instalado en staging');return plain(api.PG.snapshot());}
 function storage(){return Array.from({length:window.localStorage.length},(_,i)=>{const key=window.localStorage.key(i);return [key,window.localStorage.getItem(key)];});}
 return {window,api,uid,calls,errors,click,go,snapshot,storage,close:async()=>{if(api.PG&&api.PG.destroy)api.PG.destroy();await window.happyDOM.cancelAsync();window.close();}};
}

function noWrites(env){
 assert.ok(env.calls.every(call=>call.method==='GET'||call.method==='POST'&&/\/rpc\/(tsi11_state|tsi11_photographer_risks|tsi11_photo_availability_state|tsi210_state)$/.test(call.path)),'El entrenamiento no modifica datos del equipo');
 assert.deepEqual(env.errors,[],'Sin errores de ejecución en el navegador');
}

const configurationClue=/\bISO\b|\bapertura\b|\bf\s*\/\s*\d|\b1\s*\/\s*\d|\bEV\b/i;
function noHints(doc){
 assert.equal(doc.querySelectorAll('[data-pg-action="hint"],[data-pg-action="solution"],[data-pg-action="apply-solution"],.pg-hint-text,.pg-solution').length,0,'El juego no ofrece pistas ni combinaciones de cámara');
 assert.equal(doc.querySelectorAll('.pg-setting small').length,0,'Los controles no revelan recomendaciones de uso');
 assert.ok(!configurationClue.test(doc.querySelector('.pg-goal').textContent),'El objetivo describe la foto sin indicar configuraciones');
 const sceneLabels=Array.from(doc.querySelectorAll('.pg-camera-top,.pg-camera-bottom>span')).map(el=>el.textContent).join(' ');
 assert.ok(!/\bEV\b|\bf\s*\/\s*\d/i.test(sceneLabels),'La escena no adelanta exposición ni apertura de referencia');
}

function findSuccessfulSettings(model,scene){
 // El test busca una solución en el modelo para poder recorrer el flujo de
 // éxito; ninguna combinación se ofrece en la interfaz del juego.
 for(const shutter of model.SHUTTERS)for(const aperture of model.APERTURES)for(const iso of model.ISOS){
  const settings={shutter,aperture,iso},result=model.evaluate(scene,settings);
  if(result.passed&&result.score===100)return settings;
 }
 assert.fail('El reto '+scene.id+' debe admitir una foto con puntuación 100');
}

async function main(){
 assert.equal(project,'nksqpoigywfegcbvfhoa','Esta prueba es exclusiva de staging');
 const production=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(!production.includes('photo-game')&&!production.includes('fotojuego'),'Producción no incluye recursos ni rutas del juego');
 let saved,firstScene,firstStats;
 for(const role of ['admin','foto','editora']){
  const env=await environment(role);
  try{
   const {window,api,click}=env,doc=window.document;
   assert.ok(api.tabsFor(role).some(entry=>entry[0]===tab),role+': pestaña permitida');
   const menu=doc.querySelector('.ti-navigation [data-tab="'+tab+'"]');assert.ok(menu,role+': entrada del menú');
   assert.match(menu.parentElement.textContent,/Entrenamiento/,'El menú tiene un grupo de entrenamiento');
   click('.d29-actions [data-tab="'+tab+'"]');
   assert.equal(api.S.tab,tab,role+': navegación desde el inicio');
   assert.ok(doc.querySelector('.pg-shell'),role+': vista del juego');
   click('.ti-navigation [data-tab="resumen"]');click('.ti-navigation [data-tab="'+tab+'"]');
   assert.equal(api.S.tab,tab,role+': navegación desde el menú');
   const model=window.TSIPhotoGameModel,initial=env.snapshot(),sceneId=initial.sceneId;
   assert.equal(doc.querySelector('.pg-shell').getAttribute('data-scene-id'),sceneId);
   assert.ok(model.SCENES.some(scene=>scene.id===sceneId),'Escenario existente en el modelo');
   assert.ok(model.SCENES.length>=12,'El entrenamiento incluye al menos doce retos');
   assert.equal(new Set(model.SCENES.map(scene=>scene.id)).size,model.SCENES.length,'Cada reto tiene un identificador único');
   for(const scene of model.SCENES){
    assert.ok(!configurationClue.test(scene.goal),scene.id+': objetivo sin pistas de configuración');
    assert.ok(!Object.hasOwn(scene,'recommended')&&!Object.hasOwn(scene,'tip'),scene.id+': sin recetas ni pistas en el escenario');
    findSuccessfulSettings(model,scene);
   }
   const assets=new Set(model.SCENES.map(scene=>scene.asset.split('?')[0]));
   assert.ok(assets.size>=8,'Los retos cuentan con al menos ocho imágenes distintas');
   for(const asset of assets){
    assert.ok(!path.isAbsolute(asset)&&!asset.includes('..'),'Recurso de escena local '+asset);
    assert.ok(fs.statSync(path.join(root,'staging/photo-game-scenes',asset)).isFile(),'Existe la imagen '+asset);
   }
   noHints(doc);
   for(const key of ['shutter','aperture','iso']){
    const control=doc.getElementById('pg-'+key);assert.ok(control,'Control '+key);
    assert.ok(control.hasAttribute('data-pg-setting'),'Control con evento de juego');
    assert.ok(control.getAttribute('aria-label')||control.closest('label')||doc.querySelector('label[for="'+control.id+'"]'),'Nombre accesible '+key);
    const alternative=Array.from(control.options).find(option=>Number(option.value)!==Number(initial.settings[key]));
    assert.ok(alternative,'Ajustes alternativos '+key);control.value=alternative.value;
    control.dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(Number(env.snapshot().settings[key]),Number(alternative.value),'El selector actualiza '+key);
   }
   click('[data-pg-action="shoot"]');
   assert.equal(env.snapshot().stats.shots,initial.stats.shots+1,'El primer intento cuenta un disparo');
   noHints(doc);
   assert.ok(!configurationClue.test(doc.querySelector('.pg-feedback').textContent),'El resultado describe la imagen sin recomendar ajustes');
   const solution=findSuccessfulSettings(model,model.SCENES.find(scene=>scene.id===sceneId));
   for(const key of ['shutter','aperture','iso']){
    const control=doc.getElementById('pg-'+key);control.value=String(solution[key]);
    control.dispatchEvent(new window.Event('change',{bubbles:true}));
   }
   const good=env.snapshot();
   assert.deepEqual(good.settings,solution,'Los selectores aplican los ajustes elegidos');
   // happy-dom 21 deja .value en la segunda opción al parsear un select con
   // selected posterior. Una reproducción mínima devuelve 60 con 1000 marcado.
   // Comprobar el atributo que recibe el navegador, además del estado del juego.
   for(const key of ['shutter','aperture','iso'])assert.equal(Number(doc.getElementById('pg-'+key).querySelector('option[selected]').value),Number(good.settings[key]),'Ajuste elegido marcado '+key);
   click('[data-pg-action="shoot"]');
   const shot=env.snapshot();
   assert.ok(shot.result&&shot.result.passed&&shot.result.score===100,'Los ajustes correctos producen una foto satisfactoria');
   assert.equal(shot.stats.shots,initial.stats.shots+2,'Dos intentos registran exactamente dos disparos');
   assert.ok(shot.stats.solved.includes(sceneId),'El escenario resuelto queda en el progreso');
   noHints(doc);
   assert.ok(!configurationClue.test(doc.querySelector('.pg-feedback').textContent),'El éxito no revela recetas de configuración');
   click('[data-pg-action="reference"]');assert.ok(doc.querySelector('.pg-shell img[src]'),'Comparación muestra una imagen');
   assert.equal(doc.querySelector('[data-pg-action="reference"]').getAttribute('aria-pressed'),'true','La vista de referencia indica su estado');
   click('[data-pg-action="result"]');assert.deepEqual(env.snapshot().result,shot.result,'Comparar no altera la evaluación');
   assert.equal(doc.querySelector('[data-pg-action="result"]').getAttribute('aria-pressed'),'true','La vista de resultado indica su estado');
   api.render();
   assert.equal(env.snapshot().sceneId,sceneId,'Un render periódico conserva el escenario');
   assert.deepEqual(env.snapshot().settings,shot.settings,'Un render periódico conserva ajustes');
   assert.deepEqual(env.snapshot().result,shot.result,'Un render periódico conserva resultado');
   assert.equal(env.snapshot().stats.shots,shot.stats.shots,'Renderizar no añade disparos');
   doc.querySelector('.pg-photo').dispatchEvent(new window.Event('error'));
   assert.equal(doc.querySelector('.pg-image-error').hidden,false,'Una imagen fallida muestra una explicación');
   const round=new Set([sceneId]);
   for(let i=1;i<model.SCENES.length;i++){
    click('[data-pg-action="next"]');const nextId=env.snapshot().sceneId;
    assert.ok(!round.has(nextId),'La ronda no repite retos antes de mostrarlos todos');
    round.add(nextId);noHints(doc);
   }
   assert.deepEqual([...round].sort(),plain(model.SCENES.map(scene=>scene.id)).sort(),'Una ronda permite jugar todos los retos');
   const lastScene=env.snapshot().sceneId;
   click('[data-pg-action="next"]');assert.notEqual(env.snapshot().sceneId,lastScene,'La siguiente ronda empieza con otra escena');
   assert.equal(env.snapshot().stats.shots,shot.stats.shots,'Cambiar escenario conserva progreso');
   noWrites(env);
   if(role==='foto'){
    saved=env.storage();firstScene=sceneId;firstStats=shot.stats;
    assert.ok(saved.some(([key])=>/photo.?game|fot[oó].?juego/i.test(key)&&key.includes(project)&&key.includes(env.uid)),'El progreso local identifica proyecto y usuario');
   }
  }finally{await env.close();}
 }
 const reopened=await environment('foto',{saved,query:'?tsi_tab=fotojuego',keepInitial:true});
 try{
  assert.equal(reopened.api.S.tab,tab,'El enlace directo abre entrenamiento tras arrancar');
  assert.ok(reopened.window.document.querySelector('.pg-shell'));
  const snap=reopened.snapshot();assert.equal(snap.stats.shots,firstStats.shots,'Nueva sesión recupera disparos');
  assert.ok(snap.stats.solved.includes(firstScene),'Nueva sesión recupera escenarios resueltos');
  reopened.api.S.meId=ids.otherFoto;reopened.api.render();
  assert.equal(reopened.snapshot().stats.shots,0,'Cambiar de cuenta limpia el progreso visible en memoria');
  reopened.api.S.meId=ids.foto;reopened.api.render();
  assert.equal(reopened.snapshot().stats.shots,firstStats.shots,'Volver a la cuenta recupera su progreso');
  noWrites(reopened);
 }finally{await reopened.close();}
 const other=await environment('foto',{saved,uid:ids.otherFoto});
 try{
  other.go(tab);const snap=other.snapshot();assert.equal(snap.stats.shots,0,'Otra cuenta empieza sin disparos ajenos');
  assert.deepEqual(snap.stats.solved,[],'Otra cuenta no ve escenarios resueltos ajenos');noWrites(other);
 }finally{await other.close();}
 const broken=await environment('foto',{saved:saved.map(([key,value])=>[key,/photo.?game|fot[oó].?juego/i.test(key)?'{':value])});
 try{
  broken.go(tab);assert.equal(broken.snapshot().stats.shots,0,'Progreso ilegible no impide empezar');
  assert.match(broken.window.document.querySelector('.pg-shell').textContent,/no se pudo recuperar|puedes seguir jugando/i,'Se explica el fallo de recuperación local');
  broken.click('[data-pg-action="shoot"]');assert.equal(broken.snapshot().stats.shots,1,'Se puede jugar tras un error de progreso local');noWrites(broken);
 }finally{await broken.close();}
 for(const role of [null,'pending']){
  const env=await environment(role);
  try{
   assert.ok(!env.api.tabsFor(role||'').some(entry=>entry[0]===tab),(role||'Anónimo')+': sin ruta de entrenamiento');
   env.go(tab);assert.equal(env.window.document.querySelectorAll('.pg-shell').length,0,(role||'Anónimo')+': una ruta forzada no abre el juego');
   assert.equal(env.window.document.querySelectorAll('[data-tab="'+tab+'"]').length,0);noWrites(env);
  }finally{await env.close();}
 }
 console.log('Fotojuego staging: doce retos sin pistas, ocho imágenes, rondas sin repeticiones, roles, navegación, ajustes, evaluación, comparación, render persistente, progreso por usuario y aislamiento operativo aprobados.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
