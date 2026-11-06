'use strict';
/* TSI 2.2.6: consulta documental, conservación de formularios y ausencia de consentimiento implícito. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<100;i++){if(check())return;await pause(10);}throw Error('No se completó: '+label);}
const copy=value=>JSON.parse(JSON.stringify(value));
function storageValues(storage){return Object.fromEntries(Array.from({length:storage.length},(_,i)=>storage.key(i)).sort().map(key=>[key,storage.getItem(key)]));}

async function environment(role){
 const {Window}=await import('happy-dom');
 const base='https://tantlgswituiwkxfgmsr.supabase.co';
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});
 window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 const calls=[],errors=[],downloads=[],blobs=[];
 window.alert=message=>errors.push(String(message));
 window.document.body.innerHTML='<main id="app"></main>';
 window.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:https://example.test/privacy-'+blobs.length;};
 window.URL.revokeObjectURL=()=>{};
 window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,href:this.href});};
 const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 // No se consulta ningún servidor real ni se crean datos de personas.
 window.fetch=async(input,options={})=>{
  const url=new URL(String(input));assert.equal(url.origin,base,'Conservar aislamiento de producción');
  calls.push({path:url.pathname,method:options.method||'GET',body:options.body||null});
  if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:false,reservasPublicas:false,loans:false,autoArchive:false,whatsapp:''}}]);
  if(url.pathname==='/rest/v1/profiles')return response(Object.entries(ids).map(([r,id])=>({id,email:r+'@test.invalid',name:'Prueba '+r,role:r})));
  if(url.pathname==='/rest/v1/rpc/tsi210_state')return response({teams:[],quotes:[],rates:[],quote_costs:[],costs:[],deliveries:[],audit:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_state')return response({server_now:new Date().toISOString(),model:{parameters:{min_completed_jobs:3}},capacity:[],estimates:[],sessions:[],matches:[],events:[],snapshots:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({photographers:[]});
  if(url.pathname==='/rest/v1/rpc/tsi225_availability_suspensions_state')return response({suspensions:[]});
  if(url.pathname==='/functions/v1/tsi-push')return response({registered:false,events:[],preferences:{enabled:false,categories:[]}});
  return response([]);
 };
 if(role){
  const access='test.'+Buffer.from(JSON.stringify({iss:base+'/auth/v1'})).toString('base64url')+'.test';
  window.localStorage.setItem('tsi_production_tantlgswituiwkxfgmsr_auth',JSON.stringify({access,uid:ids[role],exp:Date.now()/1000+3600}));
 }
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/<title>Tanabi Sports Intelligence 2\.2\.6<\/title>/);
 assert.match(html,/var APP_VERSION="2\.2\.6"/);
 assert.match(html,/<link[^>]+href="assets\/tsi-226-privacy\.css(?:\?[^\"]*)?"/);
 assert.match(html,/<script[^>]+src="assets\/tsi-226-privacy\.js(?:\?[^\"]*)?"/);
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  const source=match[1].match(/\bsrc="([^\"]+)"/);
  let code=source?fs.readFileSync(path.join(root,source[1].split('?')[0]),'utf8'):match[2];
  if(!code.trim())continue;
  if(!source&&code.includes('var APP_VERSION=')){
   const position=code.lastIndexOf('})();');assert.ok(position>0,'Cierre del cliente');
   code=code.slice(0,position)+'window.__privacyTest={S:S,render:function(){render();}};\n'+code.slice(position);
  }
  window.eval(code);
 }
 await until(()=>window.__privacyTest&&!window.__privacyTest.S.booting,'arranque de la página completa');
 await pause(30);
 const api=window.__privacyTest,doc=window.document;
 assert.equal(api.S.meId||null,role?ids[role]:null);
 function click(selector){const element=doc.querySelector(selector);assert.ok(element,'Control '+selector);element.click();return element;}
 function snapshot(){return {state:copy(api.S),storage:storageValues(window.localStorage),calls:copy(calls)};}
 return {window,doc,api,calls,errors,downloads,blobs,click,snapshot,close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}

function legalTerms(text){
 assert.match(text,/Patricio Ontiveros Díaz/,'Identidad del responsable');
 assert.match(text,/Scouts 681/,'Domicilio confirmado del responsable');
 assert.match(text,/Datrilagency@gmail\.com/,'Canal para solicitudes');
 assert.match(text,/56 días/,'Máximo de ocho semanas');
 assert.match(text,/temporada/,'Límite de temporada');
 assert.match(text,/lo (?:que ocurra )?primero/,'Aplicar el primer límite');
 assert.match(text,/sin plazo fijo/,'Permanencia de redes sociales');
 assert.match(text,/retiro/,'Derecho a solicitar retiro');
 assert.match(text,/obligaciones legales|obligaciones de conservación/,'Conservación legal');
 assert.match(text,/menor|niñas, niños y adolescentes/i,'Protección de menores');
 assert.match(text,/representación|representarla|representarlos|representante/,'Representación válida');
 assert.doesNotMatch(text,/(?:no (?:intervienen|participan)|sin) terceros/i,'No negar participación de terceros');
}

async function homeDocuments(){
 const env=await environment(null);
 try{
  assert.equal(env.api.S.view,'home');
  assert.equal(env.doc.getElementById('u'),null,'Consultar desde inicio sin abrir acceso del equipo');
  const opener=env.doc.querySelector('header [data-privacy="integral"]');
  assert.ok(opener,'Acceso público a Privacidad en el encabezado de inicio');
  assert.equal(opener.textContent,'Privacidad');
  const before=env.snapshot();opener.focus();opener.click();
  const dialog=env.doc.getElementById('tsi-privacy-dialog');assert.ok(dialog.open);
  legalTerms(dialog.textContent);
  env.click('#tsi-privacy-dialog [data-privacy="consent"]');
  assert.match(env.doc.getElementById('tsi-privacy-title').textContent,/Consentimiento independiente/);
  env.click('#tsi-privacy-dialog [data-privacy="close"]');
  assert.equal(dialog.open,false);assert.equal(env.doc.activeElement,opener);
  assert.equal(env.api.S.view,'home');assert.equal(env.api.S.meId,null);
  assert.equal(env.doc.getElementById('u'),null);
  await pause(5);assert.deepEqual(env.snapshot(),before,'Acceso público conserva página, sesión, almacenamiento y red');
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
}

async function loginDocuments(){
 const env=await environment(null);
 try{
  const {api,doc,window}=env;
  assert.equal(window.TSIPrivacy.version,'2.2.6');
  assert.ok(Object.isFrozen(window.TSIPrivacy));
  api.S.view='login';api.render();
  for(const mode of ['in','up','forgot']){
   api.S.loginMode=mode;api.render();
   const summary=doc.querySelector('.tsi-privacy-summary');assert.ok(summary,'Aviso simplificado en modo '+mode);
   legalTerms(summary.textContent);assert.match(summary.textContent,/Supabase/);
   const user=doc.getElementById('u'),password=doc.getElementById('p'),name=doc.getElementById('nm');
   user.value='account.private@test.invalid';if(password)password.value='keep-private-password';if(name)name.value='Nombre privado';
   const stateBefore=env.snapshot();
   const opener=doc.querySelector('.tsi-privacy-summary [data-privacy="integral"]');opener.focus();opener.click();
   const dialog=doc.getElementById('tsi-privacy-dialog');
   assert.ok(dialog.open,'Abrir documento en modo '+mode);
   assert.equal(doc.getElementById('app').contains(dialog),false,'El diálogo conserva el formulario detrás');
   assert.equal(dialog.getAttribute('aria-labelledby'),'tsi-privacy-title');
   assert.equal(doc.activeElement.id,'tsi-privacy-title','Foco en el documento');
   legalTerms(dialog.textContent);
   assert.match(dialog.textContent,/Supabase para autenticación, base de datos y almacenamiento/);
   assert.match(dialog.textContent,/GitHub Pages/);assert.match(dialog.textContent,/Google Fonts/);
   assert.match(dialog.textContent,/20 días hábiles/);assert.match(dialog.textContent,/15 días hábiles/);
   assert.match(dialog.textContent,/no implica que exista un borrado automático/);
   assert.equal(doc.getElementById('u'),user,'No reemplazar el formulario de acceso');
   assert.equal(user.value,'account.private@test.invalid');if(password)assert.equal(password.value,'keep-private-password');if(name)assert.equal(name.value,'Nombre privado');
   assert.equal(dialog.querySelector('input,textarea,select,form'),null,'Consultar no recoge ni concede autorización');
   await pause(5);assert.deepEqual(env.snapshot(),stateBefore,'Consultar no cambia sesión, estado, almacenamiento ni red');
   env.click('#tsi-privacy-dialog [data-privacy="close"]');
   assert.equal(dialog.open,false);assert.equal(doc.activeElement,opener,'Restaurar foco al cerrar');
   opener.click();
   dialog.dispatchEvent(new window.Event('cancel',{cancelable:true}));
   assert.equal(dialog.open,false,'Escape/cancel cierra documento');assert.equal(doc.activeElement,opener);
  }
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
}

async function independentConsent(){
 const env=await environment(null);
 try{
  env.api.S.view='login';env.api.render();
  const before=env.snapshot();
  env.click('.tsi-privacy-summary [data-privacy="consent"]');
  const dialog=env.doc.getElementById('tsi-privacy-dialog');
  assert.match(env.doc.getElementById('tsi-privacy-title').textContent,/Consentimiento independiente/);
  assert.equal(dialog.querySelector('input,textarea,select,form,[data-privacy="save"]'),null,'No presentar un consentimiento digital no persistido');
  env.click('#tsi-privacy-dialog [data-privacy="download"]');
  assert.equal(env.downloads.length,1);assert.equal(env.downloads[0].name,'Tanabi-Sports-consentimiento-fotografias-2.2.6.txt');
  assert.match(env.downloads[0].href,/^blob:/);assert.equal(env.blobs.length,1);
  const blob=env.blobs[0];assert.match(blob.type,/text\/plain/);
  const text=await blob.text();legalTerms(text);
  assert.equal((text.match(/\[ \] AUTORIZO  \[ \] NO AUTORIZO/g)||[]).length,2,'Decisiones independientes sin selección previa');
  assert.match(text,/Una opción en blanco no autoriza ese uso/);
  assert.match(text,/Cuentas, plataformas o portafolios autorizados: _+/);
  assert.match(text,/Plazo de la campaña o uso publicitario autorizado: _+/);
  assert.match(text,/Nombre y firma de titular o representante facultado: _+/);
  assert.match(text,/No publicar mientras falte una autorización válida/);
  assert.match(text,/Su descarga o consulta no registra una autorización/);
  assert.match(text,/debe recibir y conservar/);
  assert.match(text,/Negarme no impide recibir el servicio/);
  assert.match(text,/independiente.*galerías públicas/);
  assert.match(text,/plataformas externas/i);
  assert.match(text,/sin garantizar la eliminación de copias/);
  await pause(5);assert.deepEqual(env.snapshot(),before,'Descargar no autoriza, persiste, contrata ni llama al servidor');
  env.click('#tsi-privacy-dialog [data-privacy="integral"]');
  assert.match(env.doc.getElementById('tsi-privacy-title').textContent,/Aviso de privacidad integral/);
  assert.equal(env.doc.querySelectorAll('#tsi-privacy-dialog').length,1,'Reutilizar un solo diálogo');
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
}

async function menuForEveryRole(){
 for(const role of Object.keys(ids)){
  const env=await environment(role);
  try{
   env.api.S.view='dash';env.api.S.tab='resumen';env.api.render();await pause(20);
   const menu=env.doc.querySelector('nav[aria-label="Menú del equipo"]');assert.ok(menu,'Menú '+role);
   for(const kind of ['integral','consent']){
    const button=menu.querySelector('[data-privacy="'+kind+'"]');assert.ok(button,'Documento '+kind+' para '+role);
    const before=env.snapshot();button.focus();button.click();
    const dialog=env.doc.getElementById('tsi-privacy-dialog');assert.ok(dialog.open);
    assert.equal(env.doc.querySelector('nav[aria-label="Menú del equipo"]'),menu);
    env.click('#tsi-privacy-dialog [data-privacy="close"]');
    assert.equal(env.doc.activeElement,button);assert.deepEqual(env.snapshot(),before,'Consultar desde menú no cambia módulo ni datos: '+role);
   }
   assert.deepEqual(env.errors,[]);
  }finally{await env.close();}
 }
}

(async()=>{
 await homeDocuments();await loginDocuments();await independentConsent();await menuForEveryRole();
 console.log('TSI 2.2.6: privacidad desde inicio público, acceso y tres roles; formulario, sesión y datos intactos; formato independiente descargable sin autorización implícita.');
})().catch(error=>{console.error(error);process.exitCode=1;});
