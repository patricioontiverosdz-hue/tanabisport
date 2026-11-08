const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),IMAGE='data:image/jpeg;base64,/9j/UE9SVEZPTElP',ID='23000000-0000-4000-8000-000000000001';
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<200;i++){if(fn())return;await pause(10);}throw Error('No se completó: '+label);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function main(){
 const {Window}=await import(pathToFileURL(process.env.TSI230_HAPPYDOM_MODULE||require.resolve('happy-dom',{paths:[root,path.join(root,'../tanabisport')]})));
 async function fixture(initialRole='admin',seed=null){
  const w=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/',settings:{disableJavaScriptFileLoading:true}});Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.console=console;w.document.body.innerHTML='<div id="app"></div>';
  let role=initialRole,userId='staff-a',api,prepareGate=null;const calls=[],pending=new Map(),publicRows=new Map(seed?seed.rows:[]);let adminRows=seed?seed.rows.map(row=>row[1]):[],homepageId=seed?seed.homepage:null;
  const state={view:initialRole?'dash':'home',tab:'portafolio',photos:['legacy-public-image'],portfolio:[{id:'legacy',title:'LEGACY SHOULD DISAPPEAR',url:'https://example.invalid/legacy.jpg'}]};
  function render(){if(api)w.document.getElementById('app').innerHTML=role?api.tab():state.portfolio.map(p=>'<img data-public-photo src="'+p.url+'" alt="'+p.title+'">').join('');}
  async function edge(body){calls.push({body:JSON.parse(JSON.stringify(body)),userId,role});if(pending.has(body.action)){const d=pending.get(body.action);pending.delete(body.action);return d.promise;}
   if(body.action==='portfolio/list')return {items:[...publicRows.values()].slice(0,12).map(p=>({id:p.id,title:p.title,expires_at:p.expires_at})),homepage:homepageId&&publicRows.has(homepageId)?{id:homepageId,title:publicRows.get(homepageId).title,expires_at:publicRows.get(homepageId).expires_at}:null};
   if(body.action==='portfolio/image'){if(!publicRows.has(body.id))throw Error('Foto retirada');return {...publicRows.get(body.id)};}
   if(body.action==='portfolio/admin-state')return {items:adminRows,homepage_id:homepageId};
   if(body.action==='portfolio/update'){const old=publicRows.get(body.id);assert.ok(old);const entry={...old,...body.payload,id:old.id,expires_at:null};publicRows.set(body.id,entry);adminRows=adminRows.map(p=>p.id===body.id?entry:p);return {items:adminRows,homepage_id:homepageId};}
   if(body.action==='portfolio/homepage'){assert.equal(role,'admin');assert.ok(body.request_id);homepageId=body.id;return {items:adminRows,homepage_id:homepageId};}
   if(body.action==='portfolio/publish'){const p=body.payload,entry={...p,id:ID,expires_at:null};publicRows.set(ID,entry);adminRows=[entry];return {items:adminRows,homepage_id:homepageId};}
   if(body.action==='portfolio/revoke'){publicRows.delete(body.id);if(homepageId===body.id)homepageId=null;adminRows=adminRows.filter(p=>p.id!==body.id);return {items:adminRows};}
   throw Error('Ruta inesperada '+body.action);
  }
  w.eval(fs.readFileSync(path.join(root,'staging/tsi-230-portfolio.js'),'utf8'));api=w.TSI230Portfolio.install({state,me:()=>role?{id:userId,role,name:'Equipo sintético'}:null,edge,render,prepareImage:async()=>prepareGate?prepareGate.promise:IMAGE});render();
  function fill(){render();const f=w.document.querySelector('[data-p230-form]');assert.ok(f,'Formulario de equipo');f.elements.title.value='Evento deportivo';f.elements.title.dispatchEvent(new w.Event('input',{bubbles:true}));Object.defineProperty(w.document.getElementById('p230-file'),'files',{value:[new w.File(['synthetic'],'fixture.jpg',{type:'image/jpeg'})],configurable:true});w.document.getElementById('p230-file').dispatchEvent(new w.Event('change',{bubbles:true}));return f;}
  function submit(f){f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
  return {w,state,api,calls,publicRows,render,fill,submit,addPublic(expires=Date.now()+60000){const p={id:ID,title:'Foto con autorización',image:IMAGE,expires_at:new Date(expires).toISOString(),contains_minors:false,season_end:new Date(Date.now()+30*86400000).toISOString(),consent_until:new Date(Date.now()+30*86400000).toISOString(),consent_reference:'AUT-EXISTING-001'};publicRows.set(ID,p);adminRows=[p];return p;},seed(){return {rows:[...publicRows.entries()].map(([id,p])=>[id,{...p}]),homepage:homepageId};},selectHome(id){homepageId=id;},setUser(r,id='staff-b'){role=r;userId=id;state.view=r?'dash':'home';render();},defer(action){const d=deferred();pending.set(action,d);return d;},prepareDelay(){prepareGate=deferred();return prepareGate;},close:()=>w.happyDOM.abort()};
 }
 {
  const f=await fixture(null);assert.equal(f.state.photos.length,0);assert.equal(f.state.portfolio.length,0,'Descarta imágenes legacy sin documentación');assert.ok(!f.w.document.body.textContent.includes('LEGACY'));f.addPublic();await f.api.publicLoad(true);assert.equal(f.state.photos[0],IMAGE);assert.equal(f.state.portfolio[0].id,ID);assert.equal(f.state.portfolio[0].expires_at,null,'No hay vencimiento automático');assert.ok(!JSON.stringify(f.state.portfolio).includes('guardian_reference'));
  const d=f.defer('portfolio/list'),pending=f.api.publicLoad(true);d.reject(Error('Red caída'));await pending;assert.equal(f.state.portfolio.length,0,'Un fallo no conserva imágenes públicas de autorización incierta');await f.close();
 }
 {
  const f=await fixture(null);f.addPublic(Date.now()-90*86400000);await f.api.publicLoad(true);assert.equal(f.state.portfolio.length,1,'Una fecha anterior heredada no retira la imagen');await pause(150);await f.api.publicLoad(true);assert.equal(f.state.photos.length,1,'Permanece hasta retiro manual');await f.close();
 }
 {
  const f=await fixture('foto');assert.ok(!f.w.document.querySelector('[data-p230-form]'));f.setUser('editora');assert.ok(f.w.document.querySelector('[data-p230-form]'),'Editora puede gestionar');f.setUser('pending');assert.ok(!f.w.document.querySelector('[data-p230-form]'));await f.close();
 }
 {
  const f=await fixture(),form=f.fill();for(const name of ['season_end','consent_until','consent_reference','contains_minors','guardian_reference','consent_confirmed','guardian_confirmed'])assert.equal(form.elements[name],undefined,'El formulario no solicita '+name);f.submit(form);await until(()=>!f.api.diagnostics().busy,'publicación directa');const p=f.calls.find(c=>c.body.action==='portfolio/publish').body.payload;assert.deepEqual(Object.keys(p).sort(),['image','request_id','title']);assert.equal(f.state.portfolio.length,1);assert.equal(f.state.portfolio[0].expires_at,null);await f.close();
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

 {
  const f=await fixture(),photo=f.addPublic();await f.api.publicLoad(true);await f.api.adminLoad();f.render();assert.ok(f.w.document.querySelector('[data-p230-edit]'),'Edición visible');
  f.w.document.querySelector('[data-p230-edit]').click();assert.equal(f.api.diagnostics().editId,ID);assert.equal(f.w.document.getElementById('p230-title').value,photo.title);assert.ok(!f.w.document.getElementById('p230-file').required,'Cambiar datos conserva la imagen si no se selecciona otra');
  const form=f.fill(false,true);Object.defineProperty(f.w.document.getElementById('p230-file'),'files',{value:[],configurable:true});f.w.document.getElementById('p230-file').dispatchEvent(new f.w.Event('change',{bubbles:true}));form.elements.title.value='Título actualizado';f.submit(form);await until(()=>!f.api.diagnostics().busy,'edición de datos');
  const update=f.calls.find(c=>c.body.action==='portfolio/update');assert.equal(update.body.id,ID);assert.equal(update.body.payload.title,'Título actualizado');assert.equal(update.body.payload.image,undefined,'La edición de datos no retransmite ni sustituye el JPEG');assert.equal(f.state.portfolio[0].title,'Título actualizado');assert.equal(f.state.portfolio[0].expires_at,null,'Editar conserva publicación sin vencimiento');
  f.w.document.querySelector('[data-p230-edit]').click();const replacement=f.fill(false,true);f.submit(replacement);await until(()=>!f.api.diagnostics().busy,'reemplazo de imagen');assert.equal(f.calls.filter(c=>c.body.action==='portfolio/update').at(-1).body.payload.image,IMAGE);assert.equal(f.api.diagnostics().editId,'');await f.close();
 }
 {
  const f=await fixture();f.addPublic();await f.api.publicLoad(true);await f.api.adminLoad();f.render();assert.equal(f.state.homepageImage,null,'Sin selección no toma automáticamente la primera foto');
  f.w.document.querySelector('[data-p230-home="'+ID+'"]').click();await until(()=>!f.api.diagnostics().busy,'selección de imagen de inicio');assert.equal(f.state.homepageImage.id,ID);assert.equal(f.state.homepageImage.image,IMAGE);assert.ok(f.w.document.body.textContent.includes('Imagen principal de Inicio'));
  f.w.document.querySelector('[data-p230-home=""]').click();await until(()=>!f.api.diagnostics().busy,'quitar imagen de inicio');assert.equal(f.state.homepageImage,null);assert.equal(f.calls.filter(c=>c.body.action==='portfolio/homepage').at(-1).body.id,null);
  f.setUser('editora');await f.api.adminLoad();f.render();assert.ok(!f.w.document.querySelector('[data-p230-home]'),'Solo administración elige imagen principal');const fake=f.w.document.createElement('button');fake.dataset.p230Home=ID;f.w.document.body.appendChild(fake);const before=f.calls.filter(c=>c.body.action==='portfolio/homepage').length;fake.click();await pause(10);assert.equal(f.calls.filter(c=>c.body.action==='portfolio/homepage').length,before);await f.close();
 }
 {
  const f=await fixture(null);for(let i=0;i<12;i++)f.publicRows.set('public-'+i,{id:'public-'+i,title:'Público '+i,image:IMAGE,expires_at:new Date(Date.now()+60000).toISOString()});const home={id:ID,title:'Portada fuera de los doce',image:IMAGE,expires_at:new Date(Date.now()+100).toISOString()};f.publicRows.set(ID,home);f.selectHome(ID);await f.api.publicLoad(true);assert.equal(f.state.portfolio.length,12);assert.equal(f.state.homepageImage.id,ID,'Carga portada aunque no esté en primeros doce');assert.ok(f.calls.some(c=>c.body.action==='portfolio/image'&&c.body.id===ID));await pause(150);assert.equal(f.state.homepageImage.id,ID,'La portada no vence automáticamente');assert.equal(f.state.homepageImage.expires_at,null);assert.equal(f.state.portfolio.length,12);await f.close();
 }
 {
  const f=await fixture(),photo=f.addPublic();f.selectHome(ID);await f.api.publicLoad(true);await f.api.adminLoad();f.render();const pending=f.defer('portfolio/update');f.w.document.querySelector('[data-p230-edit]').click();f.submit(f.fill());await until(()=>f.calls.some(c=>c.body.action==='portfolio/update'),'edición pendiente');f.setUser('editora');pending.resolve({items:[{...photo,title:'PRIVATE UPDATE A'}],homepage_id:ID});await pause(20);assert.equal(f.api.diagnostics().adminCount,0);assert.equal(f.api.diagnostics().busy,false);assert.ok(!f.w.document.body.textContent.includes('PRIVATE UPDATE A'));await f.close();
 }

 {
  const first=await fixture(),photo=first.addPublic();await first.api.publicLoad(true);await first.api.adminLoad();first.render();first.w.document.querySelector('[data-p230-home="'+ID+'"]').click();await until(()=>!first.api.diagnostics().busy,'guardar portada antes de recarga');const saved=first.seed();await first.close();
  const visitor=await fixture(null,saved);assert.equal(visitor.state.homepageImage,null,'A fresh page has no browser-persisted image');await visitor.api.publicLoad(true);assert.equal(visitor.state.homepageImage.id,ID);assert.equal(visitor.state.homepageImage.image,photo.image,'Rehydrates chosen JPEG from backend');await visitor.close();
  const admin=await fixture('admin',saved);await admin.api.publicLoad(true);await admin.api.adminLoad();admin.render();assert.ok(admin.w.document.querySelector('.p230-thumbnail[src="'+IMAGE+'"]'));assert.ok(admin.w.document.querySelector('.p230-home-preview[src="'+IMAGE+'"]'));admin.w.document.querySelector('[data-p230-edit]').click();assert.equal(admin.w.document.getElementById('p230-title').value,photo.title,'El título se recupera del servidor');assert.equal(admin.w.document.getElementById('p230-consent_reference'),null);await admin.close();
 }

 {
  const f=await fixture(),photo=f.addPublic();await f.api.publicLoad(true);await f.api.adminLoad();f.render();f.w.document.querySelector('[data-p230-edit]').click();const form=f.fill(),old=f.defer('portfolio/admin-state'),read=f.api.adminLoad();form.elements.title.value='Actualización más reciente';f.submit(form);await until(()=>!f.api.diagnostics().busy,'actualizar con lectura anterior en vuelo');old.resolve({items:[{...photo,title:'Estado viejo'}],homepage_id:null});await read;f.render();assert.ok(f.w.document.body.textContent.includes('Actualización más reciente'),'A previous administration read cannot overwrite saved changes');assert.ok(!f.w.document.body.textContent.includes('Estado viejo'));await f.close();
 }
 console.log('Portfolio230 UI: sin legacy, roles, publicación directa sin vigencia ni campos de autorización, fallos, carreras de cuenta/estado/publicación, edición/reemplazo, portada persistente, roles y revocación sin reaparición OK');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
