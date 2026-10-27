const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const appVersion=require('../package.json').version;
const root=path.join(__dirname,'..'),htmlPath=path.join(root,'index.html'),html=fs.readFileSync(htmlPath,'utf8');
const PROD='https://tantlgswituiwkxfgmsr.supabase.co',STAGING='https://nksqpoigywfegcbvfhoa.supabase.co';
const authKey='tsi_production_tantlgswituiwkxfgmsr_auth',gameTabs=['fotojuego','edicionjuego','rankingjuegos'];
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003',pending:'00000000-0000-4000-8000-000000000004',otherFoto:'00000000-0000-4000-8000-000000000005'};
const profiles=Object.keys(ids).map(key=>({id:ids[key],email:key+'@test.invalid',name:'Cuenta '+key,role:key==='otherFoto'?'foto':key}));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),plain=value=>JSON.parse(JSON.stringify(value));
async function until(check,message){for(let i=0;i<240;i++){if(check())return;await pause(5);}throw Error('No se completó: '+message);}
function testEntries(uid){return [
 {user_id:'first',name:'Primera <img src=x onerror=alert(1)>',rank:1,total_score:1800,challenges:20},
 {user_id:'second',name:'Segunda',rank:2,total_score:1500,challenges:18},
 {user_id:'third',name:'Tercera',rank:3,total_score:1200,challenges:15},
 {user_id:uid,name:'Mi cuenta',rank:4,total_score:800,challenges:10}
];}
async function environment(role,options={}){
 const {Window}=await import('happy-dom'),uid=role?(options.uid||ids[role]):null;
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/'+(options.query||''),settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 window.HTMLCanvasElement.prototype.getContext=()=>null;window.document.body.innerHTML='<div id="app"></div>';
 const calls=[],errors=[],faults={ranking:false,submission:false},sentinels=new Map([
  ['tsi_staging_nksqpoigywfegcbvfhoa_auth','staging-auth-sentinel'],
  ['tsi_staging_nksqpoigywfegcbvfhoa_photo_game_v1:'+ids.foto,'staging-camera-sentinel'],
  ['tsi_staging_nksqpoigywfegcbvfhoa_editing_game_v1:'+ids.foto,'staging-editing-sentinel']
 ]);
 let entries=testEntries(uid);
 window.addEventListener('error',event=>errors.push(event.error||event.message));
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 const state=()=>({server_now:'2026-10-23T05:00:00Z',model:{parameters:{min_completed_jobs:3}},capacity:[],estimates:[],sessions:[],matches:[],events:[],snapshots:[]});
 const readRPCs=new Set(['/rest/v1/rpc/tsi11_state','/rest/v1/rpc/tsi11_photographer_risks','/rest/v1/rpc/tsi11_photo_availability_state','/rest/v1/rpc/tsi210_state','/rest/v1/rpc/tsi_game_rankings']);
 window.fetch=async(input,request={})=>{
  const url=new URL(String(input)),method=request.method||'GET',body=request.body?JSON.parse(request.body):{};
  assert.equal(url.origin,PROD,'Producción nunca llama al servidor de staging');
  assert.ok(method==='GET'||method==='POST'&&(readRPCs.has(url.pathname)||url.pathname==='/functions/v1/training-game'),'El entrenamiento solo permite lecturas o enviar sus propios intentos: '+url.pathname);
  calls.push({path:url.pathname,method,body,headers:request.headers});
  if(url.pathname==='/functions/v1/training-game'){
   assert.deepEqual(Object.keys(body).sort(),['game','sceneId','settings'],'El cliente no envía puntuación ni identidad de otro participante');
   assert.ok(['camera','editing'].includes(body.game));
   return faults.submission?response({message:'Fallo de prueba'},503):response({accepted:true,score:75,passed:false,best_score:75});
  }
  if(url.pathname==='/rest/v1/rpc/tsi_game_rankings')return faults.ranking?response({message:'Fallo de prueba'},503):response({entries,server_now:state().server_now});
  if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}]);
  if(url.pathname==='/rest/v1/profiles')return response(profiles);
  if(url.pathname==='/rest/v1/rpc/tsi11_state')return response(state());
  if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({server_now:state().server_now,photographers:[]});
  if(url.pathname==='/rest/v1/rpc/tsi210_state')return response({version:'2.2.0',teams:[],team_matches:[],rates:[],quotes:[],quote_costs:[],costs:[],deliveries:[],audit:[]});
  return response([]);
 };
 for(const [key,value] of options.saved||[])window.localStorage.setItem(key,value);
 for(const [key,value] of sentinels)window.localStorage.setItem(key,value);
 if(uid){
  const token='test.'+Buffer.from(JSON.stringify({iss:PROD+'/auth/v1'})).toString('base64url')+'.test';
  window.localStorage.setItem(authKey,JSON.stringify({access:token,uid,exp:Date.now()/1000+3600}));
 }else window.localStorage.removeItem(authKey);
 const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
 const main=scripts.map((match,index)=>({index,text:match[2]})).filter(script=>script.text.includes('var SBU=')).pop();assert.ok(main);
 let stubbed=false;
 for(let i=0;i<scripts.length;i++){
  const [,attributes,inline]=scripts[i],sourceURL=attributes.match(/\bsrc="([^"]+)"/);
  if(sourceURL){
   const src=sourceURL[1].split('?')[0];assert.ok(!/^https?:|^staging\//i.test(src),'Los módulos de producción se sirven desde el mismo entorno');
   window.eval(fs.readFileSync(path.resolve(root,src),'utf8'));
   if(window.TSIEditingRenderer&&!stubbed){window.TSIEditingRenderer=Object.assign({},window.TSIEditingRenderer,{create:()=>({draw:async()=>({width:1400,height:788}),destroy:()=>{}})});stubbed=true;}
   continue;
  }
  let source=inline;
  if(i===main.index){const end=source.lastIndexOf('})();');assert.ok(end>0);source=source.slice(0,end)+'window.__productionTraining={S:S,PG:typeof PG!=="undefined"?PG:null,EG:typeof EG!=="undefined"?EG:null,GR:typeof GR!=="undefined"?GR:null,render:function(){render();},tabsFor:tabsFor};\n'+source.slice(end);}
  if(source.trim())window.eval(source);
 }
 await until(()=>window.__productionTraining&&!window.__productionTraining.S.booting&&(!uid||window.__productionTraining.S.meId===uid),'arranque de '+(role||'anónimo'));
 const api=window.__productionTraining;await pause(10);
 function go(tab){api.S.view='dash';api.S.tab=tab;api.render();}
 function click(selector){const element=window.document.querySelector(selector);assert.ok(element,'Control '+selector);element.click();return element;}
 function storage(){return Array.from({length:window.localStorage.length},(_,i)=>{const key=window.localStorage.key(i);return [key,window.localStorage.getItem(key)];});}
 function checkIsolation(){for(const [key,value] of sentinels)assert.equal(window.localStorage.getItem(key),value,'Producción conserva intacto el almacenamiento de staging');assert.deepEqual(errors,[],'Sin errores de ejecución en el portal');}
 return {window,api,uid,calls,errors,faults,go,click,storage,checkIsolation,setEntries:value=>entries=value,close:async()=>{for(const key of ['PG','EG','GR'])if(api[key]&&api[key].destroy)api[key].destroy();await window.happyDOM.cancelAsync();window.close();}};
}
function checkAssets(window){
 assert.equal(window.TSIPhotoGameModel.SCENES.length,20,'Producción incluye veinte retos de cámara');
 assert.equal(window.TSIEditingGameModel.SCENES.length,16,'Producción incluye dieciséis retos de edición');
 const assets=new Set([...window.TSIPhotoGameModel.SCENES,...window.TSIEditingGameModel.SCENES].map(scene=>scene.asset));
 assert.ok(assets.size>=16,'Producción incluye al menos dieciséis imágenes');
 for(const asset of assets){assert.ok(!asset.includes('..')&&!path.isAbsolute(asset));assert.ok(fs.statSync(path.join(root,'training/photo-game-scenes',asset.split('?')[0])).isFile(),'La imagen se publica dentro de training/: '+asset);}
 for(const name of ['photo-game.js','editing-game.js','game-ranking.js']){
  const source=fs.readFileSync(path.join(root,'training',name),'utf8');
  assert.ok(source.includes('tantlgswituiwkxfgmsr'),'El módulo '+name+' reconoce producción');
  assert.ok(!source.includes('nksqpoigywfegcbvfhoa')&&!source.includes('tsi_staging_'),'El módulo '+name+' no accede a staging');
 }
}
async function main(){
 assert.equal(html.match(/\bvar APP_VERSION="([^"]+)"/)?.[1],appVersion,'La versión pública coincide con package.json');
 assert.ok(html.includes('var SBU="'+PROD+'"'));
 assert.ok(!html.includes('nksqpoigywfegcbvfhoa')&&!html.includes('tsi_staging_'),'La página de producción no contiene configuración de staging');
 assert.match(html,/src="training\/game-ranking\.js/);assert.match(html,/src="training\/photo-game\.js/);assert.match(html,/src="training\/editing-game\.js/);
 let saved;
 for(const role of ['admin','foto','editora']){
  const env=await environment(role,{query:'?tsi_tab=fotojuego'});
  try{
   const {window,api,click}=env,doc=window.document;
   assert.ok(api.PG&&api.EG&&api.GR,'Los dos juegos y el podio están instalados');
   assert.equal(api.S.tab,'fotojuego','Un enlace directo abre el juego con la sesión de producción');checkAssets(window);
   for(const tab of gameTabs){assert.ok(api.tabsFor(role).some(entry=>entry[0]===tab),role+': ruta '+tab);assert.ok(doc.querySelector('.ti-navigation [data-tab="'+tab+'"]'),role+': entrada de menú '+tab);}
   env.go('resumen');for(const tab of gameTabs)assert.ok(doc.querySelector('.d29-actions [data-tab="'+tab+'"]'),role+': acceso rápido '+tab);
   click('.d29-actions [data-tab="fotojuego"]');
   const camera=plain(api.PG.snapshot());assert.ok(doc.querySelector('.pg-photo').getAttribute('src').startsWith('training/photo-game-scenes/'),'La cámara usa recursos de producción');
   click('[data-pg-action="shoot"]');
   await until(()=>env.calls.some(call=>call.path==='/functions/v1/training-game'&&call.body.game==='camera'),'intento de cámara');
   await until(()=>!!doc.querySelector('.gr-attempt-saved'),'confirmación de cámara');
   assert.equal(api.PG.snapshot().stats.shots,1);assert.ok(api.PG.snapshot().result);assert.equal(api.PG.snapshot().sceneId,camera.sceneId);
   click('.pg-shell [data-tab="rankingjuegos"]');
   await until(()=>api.GR.snapshot().state.phase==='ready','podio desde cámara');
   assert.equal(api.S.tab,'rankingjuegos');assert.equal(doc.querySelectorAll('.gr-podium-card').length,3);assert.ok(doc.querySelector('.gr-row.gr-self'));assert.equal(doc.querySelectorAll('.gr-shell img').length,0,'El nombre del participante está escapado');
   for(const filter of ['camera','editing','all']){click('[data-gr-filter="'+filter+'"]');await until(()=>api.GR.snapshot().state.phase==='ready','filtro '+filter);assert.equal(env.calls.filter(call=>call.path==='/rest/v1/rpc/tsi_game_rankings').at(-1).body.p_game,filter);}
   env.go('edicionjuego');await until(()=>api.EG.snapshot().imageReady,'fotografía para editar');
   const control=doc.getElementById('eg-exposure');control.value='0.1';control.dispatchEvent(new window.Event('input',{bubbles:true}));doc.getElementById('eg-exposure').dispatchEvent(new window.Event('change',{bubbles:true}));
   await until(()=>api.EG.snapshot().imageReady,'imagen con los ajustes aplicados');click('[data-eg-action="evaluate"]');
   await until(()=>!!doc.querySelector('.gr-attempt-saved'),'confirmación de edición');
   assert.equal(api.EG.snapshot().stats.evaluations,1);assert.ok(api.EG.snapshot().result);
   assert.equal(env.calls.filter(call=>call.path==='/functions/v1/training-game').length,2,'Dos evaluaciones envían exactamente dos intentos');
   const keys=env.storage().map(([key])=>key);
   for(const game of ['photo','editing'])assert.ok(keys.includes('tsi_production_tantlgswituiwkxfgmsr_'+game+'_game_v1:'+env.uid),'El progreso de '+game+' usa proyecto de producción y cuenta');
   if(role==='foto')saved=env.storage();
   env.go('rankingjuegos');await until(()=>api.GR.snapshot().state.phase==='ready','podio actualizado');
   env.setEntries([]);click('[data-gr-action="reload"]');await until(()=>api.GR.snapshot().state.phase==='ready','ranking vacío');assert.ok(doc.querySelector('.gr-empty'));assert.equal(doc.querySelectorAll('.gr-podium-card,.gr-row').length,0);
   env.faults.ranking=true;click('[data-gr-action="reload"]');await until(()=>api.GR.snapshot().state.phase==='error','fallo de ranking');assert.ok(doc.querySelector('.gr-error'));
   env.faults.ranking=false;env.setEntries(testEntries(env.uid));click('.gr-error [data-gr-action="reload"]');await until(()=>api.GR.snapshot().state.phase==='ready','reintento de ranking');assert.equal(doc.querySelectorAll('.gr-podium-card').length,3);
   const denied=window.TSIGameRanking.create({me:()=>({id:env.uid,role}),server:STAGING,render:()=>{},request:()=>{throw Error('No debe llamarse');}});assert.equal(denied.render(),'');assert.equal(await denied.submit('camera',camera.sceneId,camera.settings),null);denied.destroy();
   for(const module of [window.TSIPhotoGame,window.TSIEditingGame]){const wrong=module.create({me:()=>({id:env.uid,role}),server:STAGING,render:()=>{throw Error('No debe renderizar');}});assert.equal(wrong.render(),'','Un módulo de producción rechaza el servidor de staging');wrong.destroy();}
   env.checkIsolation();
  }finally{await env.close();}
 }
 const reopened=await environment('foto',{saved,query:'?tsi_tab=edicionjuego'});
 try{
  assert.equal(reopened.api.S.tab,'edicionjuego');assert.equal(reopened.api.PG.snapshot().stats.shots,1);assert.equal(reopened.api.EG.snapshot().stats.evaluations,1,'La sesión de producción recupera su propio progreso');
  reopened.api.S.meId=ids.otherFoto;reopened.api.render();assert.equal(reopened.api.PG.snapshot().stats.shots,0);assert.equal(reopened.api.EG.snapshot().stats.evaluations,0,'Cambiar de cuenta no hereda el progreso de producción');
  reopened.api.S.meId=ids.foto;reopened.api.render();assert.equal(reopened.api.EG.snapshot().stats.evaluations,1);reopened.checkIsolation();
 }finally{await reopened.close();}
 const offline=await environment('foto');
 try{
  offline.faults.submission=true;offline.go('fotojuego');offline.click('[data-pg-action="shoot"]');await until(()=>!!offline.window.document.querySelector('.gr-attempt-error'),'fallo al enviar el resultado');
  assert.equal(offline.api.PG.snapshot().stats.shots,1);assert.ok(offline.api.PG.snapshot().result,'Fallar el ranking conserva la práctica local');
  offline.faults.submission=false;offline.click('[data-gr-action="resubmit"]');await until(()=>!!offline.window.document.querySelector('.gr-attempt-saved'),'reintento de resultado');
  assert.equal(offline.api.PG.snapshot().stats.shots,1,'Reintentar el envío no añade disparos locales');offline.checkIsolation();
 }finally{await offline.close();}
 for(const role of [null,'pending']){
  const env=await environment(role);
  try{for(const tab of gameTabs){assert.ok(!env.api.tabsFor(role||'').some(entry=>entry[0]===tab));env.go(tab);assert.equal(env.window.document.querySelectorAll('.pg-shell,.eg-shell,.gr-shell').length,0,'Una ruta forzada no abre el entrenamiento sin rol permitido');}assert.equal(env.calls.filter(call=>/training-game|tsi_game_rankings/.test(call.path)).length,0);env.checkIsolation();}
  finally{await env.close();}
 }
 console.log('Producción '+appVersion+': veinte retos de cámara, dieciséis de edición, podio, roles, progreso por cuenta, reintentos y separación completa de staging aprobados.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
