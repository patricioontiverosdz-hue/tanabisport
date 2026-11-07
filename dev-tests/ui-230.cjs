const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'staging/tsi-230-ui.js'),'utf8');
const labels={resumen:'Resumen',partidos:'Partidos',calendario:'Calendario',micalendario:'Mi calendario',cobertura:'Cobertura',disponibilidad:'Mi disponibilidad',pagos:'Pagos',mipago:'Mi pago',intelligence:'TSI · Capacidad',proceso:'Proceso',cotizador:'Cotizador',clientes:'Clientes',rentabilidad:'Rentabilidad',tienda:'Tienda',fotojuego:'Reto fotográfico',edicionjuego:'Reto de edición',rankingjuegos:'Podio del equipo',future:'Módulo adicional'};
const allowed={admin:Object.keys(labels).filter(k=>!['micalendario','mipago'].includes(k)),foto:['resumen','partidos','micalendario','cobertura','disponibilidad','mipago','cotizador','clientes','fotojuego','edicionjuego','rankingjuegos','future'],editora:['resumen','intelligence','proceso','mipago','tienda','fotojuego','edicionjuego','rankingjuegos','future']};
let Window;
async function environment(role){
 const window=new Window({url:'https://example.invalid/staging/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 const document=window.document;document.body.innerHTML='<div id="app"></div>';
 let current=role?{id:'owner-'+role,name:'Cuenta '+role,role}:null;
 const S={view:role?'dash':'home',tab:'resumen',booting:false,cfg:{shop:true,reservasPublicas:false},photos:[],matches:[],meId:current?.id};
 const counters={profile:0,support:0,staff:0,guestAdmin:0};let avatar='',availability=null;
 window.TSI230Support={open(){counters.support++;},openStaff(){counters.staff++;},openProfile(){counters.profile++;},getAvatar(){return avatar;}};
 window.TSI230Guest={openAdmin(){counters.guestAdmin++;}};
 window.TSIPrivacy={summaryHTML(){return '<p>Documento vigente</p><button data-privacy="simplified">Privacidad</button>';}};
 window.eval(source);let ui;
 function draw(){document.getElementById('app').innerHTML=S.view==='home'?ui.home():ui.wrapDash(ui.topbar()+'<div class="ti-section-head">'+ui.tabs()+'<h1>Resumen</h1></div>'+(S.tab==='resumen'?ui.summary():'<section class="actual-module"><input id="keep" value="Trabajo vigente"><button data-act="existing-action">Función actual</button></section>')+'<footer>Datos guardados</footer>');ui.afterRender();}
 ui=window.TSI230UI.install({state:S,me:()=>current,logo:'data:image/png;base64,AAAA',version:'2.3.0',tabs:r=>(allowed[r]||[]).map(k=>[k,labels[k]]),active:()=>S.matches,today:()=>'2026-11-06',photoAvailability:()=>availability,editingState:()=>({sessions:[]}),legacySummary:()=>'<div class="legacy-recommendation">Recomendaciones vigentes</div>',render:draw});
 draw();
 return {window,document,S,ui,counters,draw,setUser(value){current=value;},setAvatar(value){avatar=value;},setAvailability(value){availability=value;},click(selector){const b=document.querySelector(selector);assert.ok(b,selector);b.click();},close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}
async function publicSite(){const e=await environment(null);try{
 assert.match(e.document.querySelector('.ui230-hero h1').textContent,/Cada jugada/);
 assert.equal(e.document.querySelectorAll('img[src*="photo-game"]').length,0,'Training assets are never public portfolio assets');
 e.click('[data-ui230-page="proceso"]');assert.equal(e.document.querySelectorAll('.ui230-process li').length,4);assert.equal(e.S.view,'home');
 e.click('[data-ui230-action="support"]');assert.equal(e.counters.support,1);
 e.click('[data-ui230-page="portafolio"]');assert.ok(e.document.querySelector('.ui230-empty-portfolio'));assert.equal(e.document.querySelectorAll('.ui230-gallery img').length,0);
 e.S.photos=['https://example.invalid/real.jpg','javascript:alert(1)'];e.draw();assert.equal(e.document.querySelectorAll('.ui230-gallery img').length,1);assert.match(e.document.querySelector('.ui230-gallery img').alt,/portafolio/);
 e.click('[data-ui230-page="privacidad"]');assert.match(e.document.body.textContent,/Documento vigente/);
 e.click('[data-ui230-action="home"]');assert.ok(e.document.querySelector('[data-x="goShop"]'),'Shop entry uses the existing guarded action');
 assert.equal(e.document.querySelector('[data-x="goReserve"]'),null);e.S.cfg.reservasPublicas=true;e.draw();assert.ok(e.document.querySelector('[data-x="goReserve"]'),'Existing reservation access follows the public feature setting');
 e.S.booting=true;e.ui.afterRender();assert.ok(e.document.querySelector('.ui230-loader img[src="data:image/png;base64,AAAA"]'));assert.equal(e.document.querySelector('.ui230-loader').getAttribute('role'),'status');
 }finally{await e.close();}}
async function roleNavigation(){const titles=[];for(const role of ['admin','foto','editora']){const e=await environment(role);try{
 titles.push(e.document.querySelector('.ui230-title h1').textContent);assert.ok(e.document.querySelector('.legacy-recommendation'),'Original recommendations remain available');
 const before=JSON.stringify(e.S);e.click('.ui230-logo');assert.equal(e.S.view,'home');assert.equal(e.S.meId,'owner-'+role);assert.ok(e.document.querySelector('[data-act="goDash"]'));
 e.S.view='dash';e.draw();e.click('[data-ui230-action="tools"]');const modal=e.document.getElementById('ui230-tools');assert.ok(modal.open);
 const actual=Array.from(modal.querySelectorAll('[data-ui230-module]'),b=>b.getAttribute('data-ui230-module')).sort();assert.deepEqual(actual,[...allowed[role]].sort(),'All authorized modules, including unknown future modules, remain discoverable: '+role);
 for(const key of ['fotojuego','edicionjuego','rankingjuegos'])assert.ok(modal.querySelector('[data-ui230-module="'+key+'"]'));
 assert.ok(modal.querySelector('[data-privacy="simplified"]'));assert.ok(modal.querySelector('[data-privacy="consent"]'));
 const search=modal.querySelector('input');search.value='podio';search.dispatchEvent(new e.window.Event('input',{bubbles:true}));assert.equal(modal.querySelector('[data-ui230-module="rankingjuegos"]').hidden,false);assert.equal(modal.querySelector('[data-ui230-module="resumen"]').hidden,true);
 search.value='';search.dispatchEvent(new e.window.Event('input',{bubbles:true}));e.click('[data-ui230-module="future"]');assert.equal(e.S.tab,'future');assert.equal(modal.open,false);assert.ok(e.document.querySelector('[data-act="existing-action"]'));assert.equal(e.document.getElementById('keep').value,'Trabajo vigente');
 e.setAvatar('data:image/png;base64,BBBB');e.window.dispatchEvent(new e.window.CustomEvent('tsi230:avatar'));assert.equal(e.document.getElementById('keep').value,'Trabajo vigente','Avatar refresh preserves current work');assert.ok(e.document.querySelector('.ui230-avatar img'));
 e.click('[data-ui230-action="profile"]');assert.equal(e.counters.profile,1);e.click('[data-ui230-action="staffSupport"]');assert.equal(e.counters.staff,1);
 e.click('[data-ui230-action="tools"]');if(role==='admin'){e.click('[data-ui230-action="guestAdmin"]');assert.equal(e.counters.guestAdmin,1);}else assert.equal(modal.querySelector('[data-ui230-action="guestAdmin"]'),null);
 assert.equal(e.S.matches.length,JSON.parse(before).matches.length,'Navigation makes no data mutations');
 e.ui.openTools();e.setUser(null);e.ui.afterRender();assert.equal(modal.open,false,'Private tool list closes after logout');
 }finally{await e.close();}}
 assert.equal(new Set(titles).size,3,'Each role receives its own dashboard');}
async function availabilityRules(){const e=await environment('foto');try{
 const match={id:'m1',date:'2026-11-07',time:'18:00',teams:'Equipo real',f1:'',f2:''};e.S.matches=[match];assert.match(e.ui.photoTakeReason(match),/Confirma la disponibilidad/);
 const week={week_start:'2026-11-02',version:1,schedule:Array.from({length:7},()=>({available:true,start:'17:00',end:'21:00'}))};
 const person={id:'owner-foto',history:[week],suspensions:[]};e.setAvailability({photographers:[person]});assert.equal(e.ui.photoTakeReason(match),'');
 assert.match(e.ui.photoTakeReason({...match,date:'2026-11-14'}),/Confirma la disponibilidad/,'Each week requires its own confirmation');
 assert.match(e.ui.photoTakeReason({...match,time:'16:00'}),/fuera del horario/);
 person.suspensions=[{start_date:'2026-11-07',end_date:'2026-11-08'}];assert.match(e.ui.photoTakeReason(match),/suspensión/);
 person.suspensions=[];e.setAvailability(null);e.document.getElementById('app').innerHTML='<div class="match"><button data-act="take" data-id="m1">Tomar partido</button></div>';e.ui.afterRender();assert.equal(e.document.querySelector('[data-act="take"]').disabled,true);assert.ok(e.document.querySelector('[data-tab="disponibilidad"]'),'Blocked selection has a direct confirmation CTA');
 }finally{await e.close();}}
(async()=>{const entry=require.resolve('happy-dom',{paths:[root,path.resolve(root,'../tanabisport')]});({Window}=await import(pathToFileURL(entry).href));await publicSite();await roleNavigation();await availabilityRules();console.log('TSI 2.3.0 UI: public process, real portfolio, preserved session, three dashboards, every authorized module, privacy, avatar, and availability CTA verified.');})().catch(error=>{console.error(error);process.exitCode=1;});
