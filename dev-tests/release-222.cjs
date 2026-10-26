const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const PROD='https://tantlgswituiwkxfgmsr.supabase.co',STAGING='nksqpoigywfegcbvfhoa';
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003'};
const legacyId='10000000-0000-4000-8000-000000000001',seasonId='10000000-0000-4000-8000-000000000002';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message){for(let i=0;i<200;i++){if(check())return;await pause(5);}throw Error('No se completó: '+message);}

// Todo el tráfico se responde en memoria; esta prueba nunca consulta servidores reales.
async function environment(role,instant){
 const {Window}=await import('happy-dom'),uid=ids[role],now=Date.parse(instant);
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 const OriginalDate=window.Date;
 window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});
 window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 window.document.body.innerHTML='<div id="app"></div>';
 const calls=[],errors=[],sentinels=new Map([
  ['tsi_staging_'+STAGING+'_auth','staging-session-sentinel'],
  ['tsi_staging_'+STAGING+'_state_v3','staging-state-sentinel'],
  ['tsi210:drafts:'+STAGING+':'+uid+':'+role,'staging-draft-sentinel']
 ]);
 for(const [key,value] of sentinels)window.localStorage.setItem(key,value);
 window.addEventListener('error',event=>errors.push(event.error||event.message));
 const data={teams:[
  {id:legacyId,owner_id:ids.foto,team_name:'Equipo legado de prueba',sport:'Flag',coordinator_name:'Contacto de prueba',whatsapp:'8111111111',notes:'Registro anterior sin temporada',archived:false,version:1},
  {id:seasonId,owner_id:ids.foto,team_name:'Equipo con temporada de prueba',sport:'Flag',season:'juvenil',season_year:2025,coordinator_name:'',whatsapp:'',notes:'',archived:false,version:1}
 ],team_matches:[],rates:[],quotes:[],quote_costs:[],costs:[],deliveries:[],audit:[]};
 const profiles=Object.keys(ids).map(role=>({id:ids[role],email:role+'@test.invalid',name:'Cuenta de prueba '+role,role}));
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 window.fetch=async(input,options={})=>{
  const url=new URL(String(input)),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
  assert.equal(url.origin,PROD,'Las peticiones de producción permanecen en su proyecto');
  calls.push({url:url.href,path:url.pathname,method,body});
  if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}]);
  if(url.pathname==='/rest/v1/profiles')return response(profiles);
  if(url.pathname==='/rest/v1/rpc/tsi11_state')return response({server_now:instant,model:{parameters:{min_completed_jobs:3}},capacity:[],estimates:[],sessions:[],matches:[],events:[],snapshots:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
  if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({photographers:[]});
  if(url.pathname==='/rest/v1/rpc/tsi210_state')return response(data);
  if(url.pathname==='/rest/v1/rpc/tsi210_command'){
   assert.notEqual(role,'editora','Una acción forzada de editora no llega al servidor');
   assert.equal(body.operation,'team.save');
   const p=body.payload,result={...p,owner_id:uid,version:Number(p.version||0)+1};
   const index=data.teams.findIndex(team=>team.id===p.id);
   if(index<0)data.teams.push(result);else data.teams[index]=result;
   return response(result);
  }
  return response([]);
 };
 const token='test.'+Buffer.from(JSON.stringify({iss:PROD+'/auth/v1'})).toString('base64url')+'.test';
 window.localStorage.setItem('tsi_production_tantlgswituiwkxfgmsr_auth',JSON.stringify({access:token,uid,exp:now/1000+3600}));
 for(const file of ['tsi-210-model.js','tsi-210-backup.js','tsi-210.js'])window.eval(fs.readFileSync(path.join(root,'assets',file),'utf8'));
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean);
 const main=scripts.findIndex(source=>source.includes('var SBU='));assert.ok(main>=0,'Se localiza el arranque de producción');
 const end=scripts[main].lastIndexOf('})();');assert.ok(end>0);
 scripts[main]=scripts[main].slice(0,end)+'window.__release222={S:S,ux:UX210,render:function(){render();}};\n'+scripts[main].slice(end);
 for(const script of scripts)window.eval(script);
 await until(()=>window.__release222?.S.meId===uid,'sesión '+role);
 const api=window.__release222;
 api.S.view='dash';api.S.tab='clientes';api.render();
 await until(()=>api.ux.diagnostics().data,'directorio '+role);
 function go(tab){api.S.tab=tab;api.render();}
 function click(action,filter=''){const element=window.document.querySelector('[data-210-action="'+action+'"]'+filter);assert.ok(element,'Control '+action+filter);element.click();}
 function fill(id,value){const element=window.document.getElementById(id);assert.ok(element,'Campo '+id);element.value=String(value);element.dispatchEvent(new window.Event('input',{bubbles:true}));}
 function checkIsolation(){
  assert.ok(calls.length>0);assert.ok(calls.every(call=>new URL(call.url).origin===PROD));
  for(const [key,value] of sentinels)assert.equal(window.localStorage.getItem(key),value,'Se conserva el almacenamiento de staging');
  assert.deepEqual(errors,[],'No hay errores al ejecutar la página');
 }
 return {window,api,data,calls,go,click,fill,checkIsolation,close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}
async function save(env){
 const before=env.calls.filter(call=>call.path==='/rest/v1/rpc/tsi210_command').length;
 env.click('save-team');
 await until(()=>env.calls.filter(call=>call.path==='/rest/v1/rpc/tsi210_command').length===before+1&&!env.api.ux.diagnostics().busy&&!env.api.ux.diagnostics().forms.team,'guardar equipo');
 return env.calls.filter(call=>call.path==='/rest/v1/rpc/tsi210_command').at(-1).body.payload;
}
function renderedSelection(doc,id){
 // happy-dom 21.0.4 can report the wrong select.value after parsing selected.
 // Check the actual emitted selection; user changes are tested through input events.
 const selected=doc.querySelectorAll('#'+id+' option[selected]');assert.equal(selected.length,1,'Una sola opción seleccionada en '+id);
 return selected[0].value;
}
async function main(){
 assert.match(html,/var APP_VERSION="2\.2\.2"/,'La versión pública es 2.2.2');
 assert.match(html,/<title>Tanabi Sports Intelligence 2\.2\.2<\/title>/);
 assert.match(html,/<script src="assets\/tsi-210\.js\?[^"\s]+"/,'El módulo promovido renueva la caché');
 assert.ok(html.includes('var SBU="'+PROD+'"'));
 assert.ok(!html.includes(STAGING)&&!html.includes('tsi_staging_'),'El HTML público conserva la configuración de producción');
 for(const source of [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1])){
  assert.ok(!/^https?:|^staging\/|\.\./i.test(source),'Recurso local de producción: '+source);
  assert.ok(fs.statSync(path.join(root,source.split('?')[0])).isFile(),'Existe el recurso '+source);
 }
 for(const [role,instant,season,year] of [
  ['admin','2027-06-30T18:00:00Z','juvenil','2027'],
  ['foto','2027-07-01T18:00:00Z','infantil','2027']
 ]){
  const env=await environment(role,instant);
  try{
   const doc=env.window.document;
   assert.ok(doc.body.textContent.includes('Temporada sin asignar'),'Un equipo anterior no recibe temporada ficticia');
   assert.ok(doc.body.textContent.includes('Juvenil (enero-junio) 2025'));
   env.click('new-team');
   assert.equal(renderedSelection(doc,'s210-team-season'),season,'Temporada inicial según semestre de Monterrey');
   assert.equal(doc.getElementById('s210-team-season_year').value,year,'Año actual de Monterrey');
   assert.equal(doc.getElementById('s210-team-season_year').min,'2000');assert.equal(doc.getElementById('s210-team-season_year').max,'2100');
   env.fill('s210-team-team_name','Equipo nuevo de prueba');env.fill('s210-team-season',season==='juvenil'?'infantil':'juvenil');env.fill('s210-team-season_year',2028);
   const sent=await save(env);
   assert.equal(sent.season,season==='juvenil'?'infantil':'juvenil');assert.equal(Number(sent.season_year),2028,'El guardado transmite el año elegido');
   env.click('edit-team','[data-id="'+sent.id+'"]');
   assert.equal(renderedSelection(doc,'s210-team-season'),sent.season);assert.equal(doc.getElementById('s210-team-season_year').value,'2028','La recarga conserva temporada y año recibidos del servidor simulado');
   env.click('cancel-form','[data-form="team"]');env.click('edit-team','[data-id="'+legacyId+'"]');
   assert.equal(renderedSelection(doc,'s210-team-season'),'');assert.equal(doc.getElementById('s210-team-season_year').value,'','Abrir un registro legado no lo reclasifica');
   env.fill('s210-team-season','juvenil');env.fill('s210-team-season_year',2024);const legacy=await save(env);
   assert.equal(legacy.season,'juvenil');assert.equal(Number(legacy.season_year),2024,'Se puede asignar explícitamente una temporada anterior');
   env.fill('s210-team-search','2028');const rows=[...doc.querySelectorAll('[data-210-search-row="teams"]')];
   assert.equal(rows.filter(row=>!row.hidden).length,1,'La búsqueda incluye año');
   env.fill('s210-team-search','infantil');assert.ok(rows.filter(row=>!row.hidden).every(row=>row.dataset.search.includes('infantil')),'La búsqueda incluye temporada');
   env.checkIsolation();
  }finally{await env.close();}
 }
 const env=await environment('editora','2027-07-01T18:00:00Z');
 try{
  const doc=env.window.document,forbidden=['new-team','edit-team','save-team','link-team','save-link','quote-team'];
  assert.ok(env.api.ux.tabs('editora').some(tab=>tab[0]==='clientes'),'La editora puede abrir el directorio');
  assert.ok(doc.body.textContent.includes('Directorio en modo consulta'));assert.equal(doc.querySelectorAll('[data-210-search-row="teams"]').length,2);
  assert.ok(!doc.querySelector('[data-210-form="team"]'));assert.ok(!doc.querySelector('a[href^="https://wa.me/"]'));
  assert.ok(doc.body.textContent.includes('WhatsApp: 8111111111'));
  for(const action of forbidden)assert.ok(!doc.querySelector('[data-210-action="'+action+'"]'),'No se ofrece '+action+' a editora');
  const before=env.calls.filter(call=>call.path==='/rest/v1/rpc/tsi210_command').length;
  for(const action of forbidden){
   const injected=doc.createElement('button');injected.dataset['210Action']=action;injected.dataset.id=legacyId;
   doc.body.append(injected);injected.click();injected.remove();await pause(0);
  }
  assert.equal(env.calls.filter(call=>call.path==='/rest/v1/rpc/tsi210_command').length,before,'Los controles forzados no envían mutaciones de equipos');
  assert.equal(env.api.ux.diagnostics().forms.team,undefined,'Los controles forzados tampoco abren un formulario');
  assert.equal(env.api.ux.diagnostics().error,'');env.checkIsolation();
 }finally{await env.close();}
 console.log('TSI 2.2.2: temporadas y años, registros legados, directorio de editora sin mutaciones y aislamiento de producción aprobados (servidor simulado).');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
