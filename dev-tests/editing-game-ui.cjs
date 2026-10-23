const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');

// Prueba el portal completo con cuentas y RPC de lectura simulados. El editor
// visual se sustituye aquí: su procesamiento de píxeles tiene su propia prueba.
const root=path.join(__dirname,'..'),htmlPath=path.join(root,'staging/index.html');
const html=fs.readFileSync(htmlPath,'utf8'),serverUrl=html.match(/var SBU="([^"]+)"/)[1];
const authKey=html.match(/localStorage\.setItem\(["']([^"']+_auth)["']/)[1];
const project=new URL(serverUrl).hostname.split('.')[0],tab='edicionjuego';
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003',pending:'00000000-0000-4000-8000-000000000004',otherFoto:'00000000-0000-4000-8000-000000000005'};
const profiles=Object.keys(ids).map(key=>({id:ids[key],email:key+'@test.invalid',name:'Usuario '+key,role:key==='otherFoto'?'foto':key}));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const plain=value=>JSON.parse(JSON.stringify(value));
const progressKey=/editing.?game|edici[oó]n.?juego/i;
async function until(check,message){for(let i=0;i<200;i++){if(check())return;await delay(10);}throw Error('No se completó: '+message);}

async function environment(role,options={}){
 const {Window}=await import('happy-dom'),uid=role?options.uid||ids[role]:null;
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/'+(options.query||''),settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});
 window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 window.document.body.innerHTML='<div id="app"></div>';
 const calls=[],errors=[],draws=[],pendingDraws=[],faults={storage:false,image:false,holdImage:false};
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
 const originalStorage=window.localStorage;
 Object.defineProperty(window,'localStorage',{configurable:true,value:{
  get length(){return originalStorage.length;},key:index=>originalStorage.key(index),getItem:key=>originalStorage.getItem(key),
  removeItem:key=>originalStorage.removeItem(key),clear:()=>originalStorage.clear(),
  setItem:(key,value)=>{if(faults.storage&&progressKey.test(key))throw new Error('Almacenamiento local no disponible');originalStorage.setItem(key,value);}
 }});
 const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
 const main=scripts.map((match,index)=>({index,text:match[2]})).filter(script=>script.text.includes('var SBU=')).pop();
 assert.ok(main,'Existe el script principal del portal');
 let stubbed=false;
 for(let i=0;i<scripts.length;i++){
  const [,attributes,inline]=scripts[i],src=attributes.match(/\bsrc="([^"]+)"/);
  if(src){
   assert.ok(!/^https?:/i.test(src[1]),'El juego y sus módulos se sirven localmente');
   window.eval(fs.readFileSync(path.resolve(path.dirname(htmlPath),src[1].split('?')[0]),'utf8'));
   if(window.TSIEditingRenderer&&!stubbed){
    window.TSIEditingRenderer=Object.assign({},window.TSIEditingRenderer,{create:()=>({
     draw:async(canvas,scene,settings,mode)=>{draws.push({sceneId:scene.id,settings:plain(settings),mode});if(faults.image)throw Error('Imagen de prueba no disponible');if(faults.holdImage)await new Promise(resolve=>pendingDraws.push(resolve));return {width:1400,height:788};},
     destroy:()=>{}
    })});stubbed=true;
   }
   continue;
  }
  let source=inline;
  if(i===main.index){
   const end=source.lastIndexOf('})();');assert.ok(end>0);
   source=source.slice(0,end)+'window.__editingGameTest={S:S,EG:typeof EG!=="undefined"?EG:null,render:function(){render();},tabsFor:tabsFor};\n'+source.slice(end);
  }
  if(source.trim())window.eval(source);
 }
 await until(()=>window.__editingGameTest&&!window.__editingGameTest.S.booting&&(!uid||window.__editingGameTest.S.meId===uid),'arranque '+(role||'sin sesión'));
 const api=window.__editingGameTest;
 if(!options.keepInitial){api.S.view='dash';api.S.tab='resumen';api.render();}
 await delay(25);
 function click(selector){const el=window.document.querySelector(selector);assert.ok(el,'Control '+selector);el.click();return el;}
 function go(target){api.S.view='dash';api.S.tab=target;api.render();}
 function snapshot(){assert.ok(api.EG,'El juego de edición está instalado en staging');return plain(api.EG.snapshot());}
 function storage(){return Array.from({length:window.localStorage.length},(_,i)=>{const key=window.localStorage.key(i);return [key,window.localStorage.getItem(key)];});}
 function set(key,value,type='input'){
  const control=window.document.getElementById('eg-'+key);assert.ok(control,'Control '+key);control.value=String(value);
  control.dispatchEvent(new window.Event(type,{bubbles:true}));return control;
 }
 function commit(key,value){set(key,value,'input');set(key,value,'change');}
 async function ready(){await until(()=>snapshot().imageReady===true,'fotografía disponible para evaluar');}
 function releaseImages(){for(const resolve of pendingDraws.splice(0))resolve();}
 return {window,api,uid,calls,errors,draws,faults,click,go,snapshot,storage,set,commit,ready,releaseImages,close:async()=>{if(api.EG&&api.EG.destroy)api.EG.destroy();releaseImages();await window.happyDOM.cancelAsync();window.close();}};
}

function noWrites(env){
 assert.ok(env.calls.every(call=>call.method==='GET'||call.method==='POST'&&/\/rpc\/(tsi11_state|tsi11_photographer_risks|tsi11_photo_availability_state|tsi210_state)$/.test(call.path)),'El entrenamiento no modifica datos del equipo');
 assert.deepEqual(env.errors,[],'Sin errores de ejecución en el navegador');
}
function evaluationBlocked(env,message){
 const {window}=env,button=window.document.querySelector('[data-eg-action="evaluate"]'),before=env.snapshot();
 assert.equal(before.imageReady,false,message+': la foto no está lista');
 assert.equal(button.disabled,true,message+': evaluar aparece deshabilitado');
 button.click();
 button.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
 // La protección depende también del estado, aunque se fuerce un botón activo.
 button.disabled=false;button.click();button.disabled=true;
 assert.deepEqual(env.snapshot().stats,before.stats,message+': los clics no registran intentos ni puntuaciones');
 assert.deepEqual(env.snapshot().result,before.result,message+': los clics no producen una evaluación');
}
const recipe=/\bISO\b|\bapertura\b|\bf\s*\/\s*\d|\b1\s*\/\s*\d|\bEV\b|(?:exposici[oó]n|temperatura|luces|sombras|contraste|saturaci[oó]n)\s*(?:a|en|:|=)\s*[+−-]?\d|[+−-]\d+\s*(?:EV|K|%)/i;
function noHints(doc){
 assert.equal(doc.querySelectorAll('[data-eg-action="hint"],[data-eg-action="solution"],[data-eg-action="apply-solution"],.eg-hint-text,.eg-solution').length,0,'El reto no ofrece pistas ni soluciones');
 const goal=doc.querySelector('.eg-goal');assert.ok(goal,'El reto muestra un objetivo visual');
 assert.ok(!recipe.test(goal.textContent),'El objetivo no indica una receta de ajustes');
 const feedback=doc.querySelector('.eg-feedback');
 if(feedback)assert.ok(!recipe.test(feedback.textContent),'La evaluación describe el resultado sin dar valores recomendados');
}
function alternative(control,current){
 const min=Number(control.min),max=Number(control.max),step=Number(control.step)||1;
 return current+step<=max?current+step:Math.max(min,current-step);
}
function successfulSettings(model,scene){
 const settings=plain(model.DEFAULTS);
 for(const control of model.CONTROLS)settings[control.key]=-Number(scene.base[control.key]||0);
 if(scene.cropGoal){settings.crop=Array.isArray(scene.cropGoal)?scene.cropGoal[0]:scene.cropGoal;settings.panX=5;settings.panY=0;}
 const result=model.evaluate(scene,settings);
 assert.ok(result.passed,'El reto '+scene.id+' admite una edición satisfactoria');
 return settings;
}
async function main(){
 assert.equal(project,'nksqpoigywfegcbvfhoa','Esta prueba es exclusiva de staging');
 const production=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(!production.includes('editing-game')&&!production.includes('edicionjuego'),'Producción no incluye recursos ni rutas del juego de edición');
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
   assert.ok(doc.querySelector('.eg-shell'),role+': vista del juego');
   click('.ti-navigation [data-tab="resumen"]');click('.ti-navigation [data-tab="'+tab+'"]');
   assert.equal(api.S.tab,tab,role+': navegación desde el menú');
   const model=window.TSIEditingGameModel,initial=env.snapshot(),sceneId=initial.sceneId;
   assert.equal(doc.querySelector('.eg-shell').getAttribute('data-scene-id'),sceneId);
   assert.ok(model.SCENES.some(scene=>scene.id===sceneId),'Escenario existente en el modelo');
   assert.ok(model.SCENES.length>=8,'Hay al menos ocho retos de edición');
   assert.equal(new Set(model.SCENES.map(scene=>scene.id)).size,model.SCENES.length,'Cada reto tiene identificador único');
   for(const scene of model.SCENES){
    assert.ok(!recipe.test(scene.goal),scene.id+': objetivo sin receta de ajustes');
    assert.ok(!Object.hasOwn(scene,'recommended')&&!Object.hasOwn(scene,'tip'),scene.id+': sin recomendaciones ni pistas');
    successfulSettings(model,scene);
    const asset=scene.asset.split('?')[0];
    assert.ok(!path.isAbsolute(asset)&&!asset.includes('..'),'Recurso de escena local '+asset);
    assert.ok(fs.statSync(path.join(root,'staging/photo-game-scenes',asset)).isFile(),'Existe la imagen '+asset);
   }
   noHints(doc);
   for(const key of ['exposure','temperature','highlights','shadows','contrast','saturation']){
    const control=doc.getElementById('eg-'+key);assert.ok(control,'Control '+key);
    assert.equal(control.type,'range','Ajuste deslizante '+key);
    assert.ok(control.hasAttribute('data-eg-setting'),'Control con evento de juego');
    assert.ok(control.getAttribute('aria-label')||control.closest('label')||doc.querySelector('label[for="'+control.id+'"]'),'Nombre accesible '+key);
    const next=alternative(control,Number(env.snapshot().settings[key]));env.set(key,next);
    assert.equal(Number(env.snapshot().settings[key]),next,'El deslizador actualiza en vivo '+key);
    env.set(key,next,'change');
    assert.equal(Number(env.snapshot().settings[key]),next,'Confirmar el deslizador conserva '+key);
   }
   const beforeUndo=env.snapshot(),exposureControl=doc.getElementById('eg-exposure');
   const alteredExposure=alternative(exposureControl,Number(beforeUndo.settings.exposure));
   env.commit('exposure',alteredExposure);assert.equal(env.snapshot().settings.exposure,alteredExposure);
   click('[data-eg-action="undo"]');assert.deepEqual(env.snapshot().settings,beforeUndo.settings,'Deshacer revierte un gesto completo del deslizador');
   click('[data-eg-action="reset"]');assert.deepEqual(env.snapshot().settings,plain(model.DEFAULTS),'Restablecer recupera los ajustes iniciales');
   assert.equal(env.snapshot().stats.evaluations,initial.stats.evaluations,'Ajustar, deshacer y restablecer no registran evaluaciones');
   const crop=doc.getElementById('eg-crop');assert.ok(crop,'Selector de encuadre');
   const cropped=Array.from(crop.options).find(option=>option.value!=='original');assert.ok(cropped,'Existe un encuadre alternativo');
   env.set('crop',cropped.value,'change');assert.equal(env.snapshot().settings.crop,cropped.value,'El selector aplica el encuadre');
   for(const key of ['panX','panY']){
    const pan=doc.getElementById('eg-'+key);assert.ok(pan,'Posición del encuadre '+key);
    const next=alternative(pan,Number(env.snapshot().settings[key]));env.commit(key,next);
    assert.equal(Number(env.snapshot().settings[key]),next,'Se puede mover el encuadre '+key);
   }
   await env.ready();
   click('[data-eg-action="evaluate"]');
   const evaluated=env.snapshot();assert.ok(evaluated.result,'La evaluación muestra un resultado');
   assert.equal(evaluated.stats.evaluations,initial.stats.evaluations+1,'Un intento cuenta una evaluación');noHints(doc);
   const solution=successfulSettings(model,model.SCENES.find(scene=>scene.id===sceneId));
   for(const key of ['exposure','temperature','highlights','shadows','contrast','saturation'])env.commit(key,solution[key]);
   env.set('crop',solution.crop,'change');
   if(solution.crop!=='original'){env.commit('panX',solution.panX);env.commit('panY',solution.panY);}
   await env.ready();
   click('[data-eg-action="evaluate"]');
   const success=env.snapshot();
   assert.ok(success.result&&success.result.passed,'La edición satisfactoria supera el objetivo');
   assert.equal(success.stats.evaluations,initial.stats.evaluations+2,'Dos intentos cuentan dos evaluaciones');
   assert.ok(success.stats.solved.includes(sceneId),'El objetivo superado queda en el progreso');noHints(doc);
   click('[data-eg-action="original"]');assert.equal(env.snapshot().view,'original','Se puede comparar con el original');
   assert.equal(doc.querySelector('[data-eg-action="original"]').getAttribute('aria-pressed'),'true','El original informa su estado');
   await env.ready();
   click('[data-eg-action="edited"]');assert.equal(env.snapshot().view,'edited','Se puede volver a la edición');
   assert.equal(doc.querySelector('[data-eg-action="edited"]').getAttribute('aria-pressed'),'true','La edición informa su estado');
   assert.deepEqual(env.snapshot().result,success.result,'Comparar conserva la evaluación');
   api.render();
   const rendered=env.snapshot();
   assert.equal(rendered.sceneId,sceneId,'Un render periódico conserva el reto');
   assert.deepEqual(rendered.settings,success.settings,'Un render periódico conserva los ajustes');
   assert.deepEqual(rendered.result,success.result,'Un render periódico conserva la evaluación');
   assert.deepEqual(rendered.stats,success.stats,'Renderizar no altera el progreso');
   await env.ready();
   assert.equal(doc.querySelector('.eg-canvas').dataset.ready,'true','La foto disponible marca su canvas');
   assert.equal(doc.querySelector('.eg-loading').hidden,true,'Al cargar se oculta el estado de espera');
   assert.equal(doc.querySelector('.eg-frame').getAttribute('aria-busy'),'false','La imagen cargada deja de estar ocupada');
   assert.ok(env.draws.length>0,'La interfaz solicita la imagen al renderer');
   assert.ok(env.draws.some(draw=>draw.mode==='original'),'La comparación solicita la vista original');
   assert.ok(env.draws.some(draw=>draw.mode==='edited'),'La comparación solicita la vista editada');
   env.faults.holdImage=true;
   const priorDraws=env.draws.length;
   env.set('exposure',alternative(doc.getElementById('eg-exposure'),Number(env.snapshot().settings.exposure)));
   await until(()=>env.draws.length>priorDraws,'render pendiente de la fotografía');
   assert.equal(doc.querySelector('.eg-frame').getAttribute('aria-busy'),'true','Una fotografía pendiente indica que está ocupada');
   evaluationBlocked(env,'Fotografía pendiente');
   env.faults.holdImage=false;env.releaseImages();await env.ready();
   assert.equal(doc.querySelector('[data-eg-action="evaluate"]').disabled,false,'El render terminado habilita evaluar');
   env.faults.image=true;
   env.set('exposure',alternative(doc.getElementById('eg-exposure'),Number(env.snapshot().settings.exposure)));
   await until(()=>doc.querySelector('.eg-image-error')&&!doc.querySelector('.eg-image-error').hidden,'error de fotografía');
   assert.equal(doc.querySelector('.eg-loading').hidden,true,'Un fallo de imagen termina el estado de espera');
   assert.equal(env.snapshot().stats.evaluations,success.stats.evaluations,'Un fallo de imagen no crea evaluaciones');
   evaluationBlocked(env,'Fotografía fallida');
   env.faults.image=false;click('[data-eg-action="retry"]');
   await until(()=>doc.querySelector('.eg-image-error').hidden&&doc.querySelector('.eg-frame').getAttribute('aria-busy')==='false','recuperación de fotografía');
   await env.ready();assert.equal(doc.querySelector('[data-eg-action="evaluate"]').disabled,false,'Reintentar una foto recuperada habilita evaluar');
   const round=new Set([sceneId]);
   for(let i=1;i<model.SCENES.length;i++){
    click('[data-eg-action="next"]');const nextId=env.snapshot().sceneId;
    assert.ok(!round.has(nextId),'La ronda no repite retos antes de mostrarlos todos');round.add(nextId);noHints(doc);
   }
   assert.deepEqual([...round].sort(),plain(model.SCENES.map(scene=>scene.id)).sort(),'La ronda permite jugar todos los retos');
   const lastScene=env.snapshot().sceneId;
   click('[data-eg-action="next"]');assert.notEqual(env.snapshot().sceneId,lastScene,'La nueva ronda no repite inmediatamente el último reto');
   assert.equal(env.snapshot().stats.evaluations,success.stats.evaluations,'Cambiar de reto conserva el progreso');
   noWrites(env);
   if(role==='foto'){
    saved=env.storage();firstScene=sceneId;firstStats=success.stats;
    assert.ok(saved.some(([key])=>progressKey.test(key)&&key.includes(project)&&key.includes(env.uid)),'El progreso local identifica proyecto y usuario');
   }
  }finally{await env.close();}
 }
 const reopened=await environment('foto',{saved,query:'?tsi_tab=edicionjuego',keepInitial:true});
 try{
  assert.equal(reopened.api.S.tab,tab,'El enlace directo abre edición tras arrancar');
  assert.ok(reopened.window.document.querySelector('.eg-shell'));
  const snap=reopened.snapshot();assert.equal(snap.stats.evaluations,firstStats.evaluations,'Otra sesión recupera evaluaciones');
  assert.ok(snap.stats.solved.includes(firstScene),'Otra sesión recupera los retos superados');
  assert.deepEqual(snap.stats,firstStats,'Otra sesión recupera también las mejores puntuaciones');
  reopened.api.S.meId=ids.otherFoto;reopened.api.render();
  assert.equal(reopened.snapshot().stats.evaluations,0,'Cambiar de cuenta limpia el progreso visible en memoria');
  reopened.api.S.meId=ids.foto;reopened.api.render();
  assert.equal(reopened.snapshot().stats.evaluations,firstStats.evaluations,'Volver a la cuenta recupera su progreso');noWrites(reopened);
 }finally{await reopened.close();}
 const other=await environment('foto',{saved,uid:ids.otherFoto});
 try{
  other.go(tab);const snap=other.snapshot();assert.equal(snap.stats.evaluations,0,'Otra cuenta empieza sin evaluaciones ajenas');
  assert.deepEqual(snap.stats.solved,[],'Otra cuenta no ve retos superados ajenos');noWrites(other);
 }finally{await other.close();}
 const broken=await environment('foto',{saved:saved.map(([key,value])=>[key,progressKey.test(key)?'{':value])});
 try{
  broken.go(tab);assert.equal(broken.snapshot().stats.evaluations,0,'Un progreso ilegible permite empezar');
  assert.match(broken.window.document.querySelector('.eg-shell').textContent,/no se pudo recuperar|puedes seguir jugando/i,'Se explica el fallo de recuperación local');
  await broken.ready();
  broken.click('[data-eg-action="evaluate"]');assert.equal(broken.snapshot().stats.evaluations,1,'Se puede evaluar tras un error de recuperación');noWrites(broken);
 }finally{await broken.close();}
 const unavailable=await environment('foto');
 try{
  unavailable.go(tab);unavailable.faults.storage=true;
  await unavailable.ready();
  unavailable.click('[data-eg-action="evaluate"]');
  assert.equal(unavailable.snapshot().stats.evaluations,1,'Se puede jugar cuando no se permite guardar localmente');
  assert.match(unavailable.window.document.querySelector('.eg-shell').textContent,/guardar|almacenamiento|puedes seguir jugando/i,'Se explica el fallo al guardar progreso');
  noWrites(unavailable);
 }finally{await unavailable.close();}
 for(const role of [null,'pending']){
  const env=await environment(role);
  try{
   assert.ok(!env.api.tabsFor(role||'').some(entry=>entry[0]===tab),(role||'Anónimo')+': sin ruta de entrenamiento');
   env.go(tab);assert.equal(env.window.document.querySelectorAll('.eg-shell').length,0,(role||'Anónimo')+': una ruta forzada no abre el juego');
   assert.equal(env.window.document.querySelectorAll('[data-tab="'+tab+'"]').length,0);noWrites(env);
  }finally{await env.close();}
 }
 console.log('Edición staging: ocho retos sin recetas, roles, navegación, controles en vivo, encuadre, evaluación, comparación, deshacer/restablecer, rondas, progreso por cuenta y aislamiento operativo aprobados.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
