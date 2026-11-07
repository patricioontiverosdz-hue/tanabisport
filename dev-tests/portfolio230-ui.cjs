const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),IMAGE='data:image/jpeg;base64,/9j/UE9SVEZPTElP',ID='23000000-0000-4000-8000-000000000001';
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<200;i++){if(fn())return;await pause(10);}throw Error('No se completó: '+label);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function main(){
 const {Window}=await import(pathToFileURL(process.env.TSI230_HAPPYDOM_MODULE||require.resolve('happy-dom',{paths:[root,path.join(root,'../tanabisport')]})));
 async function fixture(initialRole='admin'){
  const w=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/',settings:{disableJavaScriptFileLoading:true}});Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.console=console;w.document.body.innerHTML='<div id="app"></div>';
  let role=initialRole,userId='staff-a',api,prepareGate=null;const calls=[],pending=new Map(),publicRows=new Map();let adminRows=[];
  const state={view:initialRole?'dash':'home',tab:'portafolio',photos:['legacy-public-image'],portfolio:[{id:'legacy',title:'LEGACY SHOULD DISAPPEAR',url:'https://example.invalid/legacy.jpg'}]};
  function render(){if(api)w.document.getElementById('app').innerHTML=role?api.tab():state.portfolio.map(p=>'<img data-public-photo src="'+p.url+'" alt="'+p.title+'">').join('');}
  async function edge(body){calls.push({body:JSON.parse(JSON.stringify(body)),userId,role});if(pending.has(body.action)){const d=pending.get(body.action);pending.delete(body.action);return d.promise;}
   if(body.action==='portfolio/list')return {items:[...publicRows.values()].map(p=>({id:p.id,title:p.title,expires_at:p.expires_at}))};
   if(body.action==='portfolio/image'){if(!publicRows.has(body.id))throw Error('Foto retirada');return {...publicRows.get(body.id)};}
   if(body.action==='portfolio/admin-state')return {items:adminRows};
   if(body.action==='portfolio/publish'){const p=body.payload,entry={...p,id:ID,expires_at:new Date(Math.min(Date.now()+56*86400000,Date.parse(p.season_end),Date.parse(p.consent_until))).toISOString()};publicRows.set(ID,entry);adminRows=[entry];return {items:adminRows};}
   if(body.action==='portfolio/revoke'){publicRows.delete(body.id);adminRows=adminRows.filter(p=>p.id!==body.id);return {items:adminRows};}
   throw Error('Ruta inesperada '+body.action);
  }
  w.eval(fs.readFileSync(path.join(root,'staging/tsi-230-portfolio.js'),'utf8'));api=w.TSI230Portfolio.install({state,me:()=>role?{id:userId,role,name:'Equipo sintético'}:null,edge,render,prepareImage:async()=>prepareGate?prepareGate.promise:IMAGE});render();
  function fill(minors=false,confirmed=true){render();const f=w.document.querySelector('[data-p230-form]');assert.ok(f,'Formulario de equipo');for(const [name,value] of Object.entries({title:'Evento deportivo autorizado',season_end:new Date(Date.now()+90*86400000).toISOString().slice(0,16),consent_until:new Date(Date.now()+30*86400000).toISOString().slice(0,16),consent_reference:'AUT-TEST-001',guardian_reference:'TUTOR-TEST-001'})){f.elements[name].value=value;f.elements[name].dispatchEvent(new w.Event('input',{bubbles:true}));}
   f.elements.contains_minors.value=minors?'yes':'no';f.elements.contains_minors.dispatchEvent(new w.Event('change',{bubbles:true}));f.elements.consent_confirmed.checked=confirmed;f.elements.guardian_confirmed.checked=confirmed;Object.defineProperty(w.document.getElementById('p230-file'),'files',{value:[new w.File(['synthetic'],'fixture.jpg',{type:'image/jpeg'})],configurable:true});w.document.getElementById('p230-file').dispatchEvent(new w.Event('change',{bubbles:true}));return f;
  }
  function submit(f){f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
  return {w,state,api,calls,publicRows,render,fill,submit,addPublic(expires=Date.now()+60000){const p={id:ID,title:'Foto con autorización',image:IMAGE,expires_at:new Date(expires).toISOString(),contains_minors:false};publicRows.set(ID,p);adminRows=[p];return p;},setUser(r,id='staff-b'){role=r;userId=id;state.view=r?'dash':'home';render();},defer(action){const d=deferred();pending.set(action,d);return d;},prepareDelay(){prepareGate=deferred();return prepareGate;},close:()=>w.happyDOM.abort()};
 }
 {
  const f=await fixture(null);assert.equal(f.state.photos.length,0);assert.equal(f.state.portfolio.length,0,'Descarta imágenes legacy sin documentación');assert.ok(!f.w.document.body.textContent.includes('LEGACY'));f.addPublic();await f.api.publicLoad(true);assert.equal(f.state.photos[0],IMAGE);assert.equal(f.state.portfolio[0].id,ID);assert.ok(f.state.portfolio[0].expires_at,'Cada imagen conserva vigencia para retirarla');assert.ok(!JSON.stringify(f.state.portfolio).includes('guardian_reference'));
  const d=f.defer('portfolio/list'),pending=f.api.publicLoad(true);d.reject(Error('Red caída'));await pending;assert.equal(f.state.portfolio.length,0,'Un fallo no conserva imágenes públicas de autorización incierta');await f.close();
 }
 {
  const f=await fixture(null);f.addPublic(Date.now()+100);await f.api.publicLoad(true);assert.equal(f.state.portfolio.length,1);await until(()=>f.state.portfolio.length===0,'retiro automático por caducidad');assert.equal(f.state.photos.length,0);await f.close();
 }
 {
  const f=await fixture('foto');assert.ok(!f.w.document.querySelector('[data-p230-form]'));f.setUser('editora');assert.ok(f.w.document.querySelector('[data-p230-form]'),'Editora puede gestionar');f.setUser('pending');assert.ok(!f.w.document.querySelector('[data-p230-form]'));await f.close();
 }
 {
  const f=await fixture(),form=f.fill(true,false);f.submit(form);await until(()=>!f.api.diagnostics().busy,'validación de consentimiento');assert.equal(f.calls.filter(c=>c.body.action==='portfolio/publish').length,0);assert.ok(f.api.diagnostics().error.includes('autorizaciones'));
  const valid=f.fill(true,true);f.submit(valid);await until(()=>f.calls.some(c=>c.body.action==='portfolio/publish'),'publicación con tutor');await until(()=>!f.api.diagnostics().busy,'publicación terminada');const p=f.calls.find(c=>c.body.action==='portfolio/publish').body.payload;assert.equal(p.contains_minors,true);assert.equal(p.guardian_confirmed,true);assert.equal(p.consent_confirmed,true);assert.equal(p.guardian_reference,'TUTOR-TEST-001');assert.equal(p.consent_reference,'AUT-TEST-001');assert.equal(f.state.portfolio.length,1);await f.close();
 }
 {
  const f=await fixture(),d=f.defer('portfolio/admin-state'),pending=f.api.adminLoad();f.setUser('editora');d.resolve({items:[{id:ID,title:'PRIVATE ADMIN A',expires_at:new Date(Date.now()+60000).toISOString()}]});await pending;assert.equal(f.api.diagnostics().adminCount,0,'Estado privado tardío A no entra en B');assert.ok(!f.w.document.body.textContent.includes('PRIVATE ADMIN A'));await f.close();
 }
 {
  const f=await fixture(),d=f.prepareDelay();f.submit(f.fill(false,true));await until(()=>f.api.diagnostics().busy,'preparación pendiente');f.setUser('editora');d.resolve(IMAGE);await pause(30);assert.equal(f.calls.some(c=>c.body.action==='portfolio/publish'),false,'Cambio de cuenta durante preparación impide publicar');assert.equal(f.api.diagnostics().busy,false,'Nueva cuenta puede usar su formulario');assert.ok(!f.w.document.querySelector('fieldset').disabled);await f.close();
 }
 {
  const f=await fixture(),d=f.defer('portfolio/admin-state'),pending=f.api.adminLoad();f.setUser('editora');f.setUser('admin','staff-a');d.resolve({items:[{id:ID,title:'STALE SESSION A',expires_at:new Date(Date.now()+60000).toISOString()}]});await pending;assert.equal(f.api.diagnostics().adminCount,0,'Volver a la misma cuenta no acepta una solicitud de la sesión anterior');await f.close();
 }
 {
  const f=await fixture(),d=f.prepareDelay();f.submit(f.fill(false,true));await until(()=>f.api.diagnostics().busy,'preparación inicial pendiente');f.setUser('editora');f.setUser('admin','staff-a');d.resolve(IMAGE);await pause(30);assert.equal(f.calls.some(c=>c.body.action==='portfolio/publish'),false,'Volver a la misma cuenta no publica el formulario de la sesión anterior');assert.equal(f.api.diagnostics().busy,false);await f.close();
 }
 {
  const f=await fixture(),d=f.defer('portfolio/publish');f.submit(f.fill(false,true));await until(()=>f.calls.some(c=>c.body.action==='portfolio/publish'),'publicación pendiente');f.setUser('editora');d.resolve({items:[{id:ID,title:'PRIVATE RESULT A',expires_at:new Date(Date.now()+60000).toISOString()}]});await pause(30);assert.equal(f.api.diagnostics().adminCount,0);assert.equal(f.api.diagnostics().busy,false);assert.ok(!f.w.document.body.textContent.includes('PRIVATE RESULT A'));await f.close();
 }
 {
  const f=await fixture(),photo=f.addPublic();await f.api.publicLoad(true);await f.api.adminLoad();f.render();const d=f.defer('portfolio/image'),oldRefresh=f.api.publicLoad(true);await until(()=>f.calls.filter(c=>c.body.action==='portfolio/image').length>=2,'imagen pública pendiente');f.w.document.querySelector('[data-p230-revoke]').click();await until(()=>f.calls.some(c=>c.body.action==='portfolio/revoke'),'revocación');await pause(20);d.resolve({...photo});await oldRefresh;await until(()=>!f.api.diagnostics().busy,'retiro terminado');assert.equal(f.state.portfolio.length,0,'Una respuesta pública anterior no repone la foto revocada');assert.equal(f.state.photos.length,0);await f.close();
 }
 console.log('Portfolio230 UI: sin legacy, roles, consentimiento/tutor, caducidad, fallos, carreras de cuenta/estado/publicación y revocación sin reaparición OK');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
