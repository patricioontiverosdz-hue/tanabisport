/* Prepare the reviewed 2.3.0 staging frontend for the production branch only.
 * This command writes local files. It never commits, pushes or deploys. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),stage=path.join(root,'staging'),bundle='assets/tsi230/';
const stageProject='nksqpoigywfegcbvfhoa',productionProject='tantlgswituiwkxfgmsr';
const productionServer='https://'+productionProject+'.supabase.co';
const existing=[path.join(root,'equipo.html'),path.join(root,'index.html')].filter(fs.existsSync).map(file=>fs.readFileSync(file,'utf8')).find(text=>text.includes('var SBU="'+productionServer+'"'));
const key=existing&&existing.match(/var SBK="(sb_publishable_[A-Za-z0-9_-]+)"/)[1];
assert.ok(key,'The existing production employee public key is required.');
const stageKey=fs.readFileSync(path.join(stage,'equipo.html'),'utf8').match(/var SBK="([^"]+)"/)[1];
function output(file,data){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
function transform(text,name){
 text=text.replace(/\r\n/g,'\n');
 if(name==='tsi-230-store.js')text=text.replace("||project==='"+stageProject+"'",'').replace("project==='"+stageProject+"'||",'');
 text=text.replaceAll(stageProject,productionProject).replaceAll(stageKey,key).replaceAll('tsi_staging_','tsi_production_');
 text=text.replaceAll('../assets/','assets/').replaceAll('photo-game-scenes/',bundle+'photo-game-scenes/').replaceAll('vendor/xlsx-embedded.js',bundle+'vendor/xlsx-embedded.js').replaceAll('brand/',bundle+'brand/');
 if(name==='tsi-230-admin-integration.js')text=text.replace('/^brand\\//','/^assets\\/tsi230\\/brand\\//');
 if(name==='tsi-230-public.js')text=text.replaceAll("loadStyle('tsi-", "loadStyle('"+bundle+"tsi-").replaceAll("loadScript('tsi-", "loadScript('"+bundle+"tsi-");
 if(name==='tsi-230-ui.js')text=text.replace(/function stage\(\)\{[^\n]*\}/,"function stage(){return '';}").replace("inside the staging application's closure","inside the production application's closure");
 if(name==='tsi-230-guest.js'){
  text=text.replace(/<details><summary>Acceso de PRUEBA facilitado por administración<\/summary>[^\n]*?codeForm\(true\) \+ '<\/details>/,'');
  text=text.replaceAll('data.test_mode','data.manual_codes').replaceAll('test_mode','manual_code').replaceAll('admin-test-code','admin-access-code').replaceAll('test-code','access-code');
  text=text.replaceAll('Solo se pueden crear invitaciones marcadas PRUEBA; los códigos se obtienen aquí, exclusivamente como administrador.','Puedes crear accesos por código y entregarlos únicamente al contacto aprobado.').replaceAll('Las invitaciones están cerradas hasta configurar el correo.','Los accesos están cerrados hasta habilitar el correo o los códigos de acceso.');
  text=text.replaceAll('Invitación de PRUEBA, sin envío de correo','Código de acceso facilitado por Tanabi').replaceAll(' · PRUEBA',' · Código de acceso').replaceAll('Obtener código de PRUEBA','Obtener código de acceso').replaceAll('Identificador de prueba','Clave de acceso').replaceAll('Código de prueba','Código de acceso');
  text=text.replaceAll('PRUEBA: no se envió correo. Comparte estos datos únicamente con el contacto aprobado. Caducan en cinco minutos.','Acceso autorizado: entrega estos datos únicamente al contacto aprobado. Caducan en cinco minutos.');
  text=text.replace("function open(options) { nextView = options && options.next || 'shop'; entry(); return new Promise(function (resolve) { pending.push(resolve); }); }",`function open(options) {
    nextView = options && options.next || 'shop'; var epoch=++modalEpoch,originalFocus=document.activeElement; returnFocus=originalFocus;
    panel().innerHTML=shell('Acceso a fotografías','<p role="status">Comprobando disponibilidad…</p>');
    var waiting=new Promise(function(resolve){pending.push(resolve);});
    function unavailable(){if(epoch!==modalEpoch||!modal)return;panel().innerHTML=shell('Acceso a fotografías','<p>El acceso por correo todavía no está disponible. Habla con TABI para recibir ayuda con tus fotografías.</p><button type="button" data-g230="contact">Hablar con TABI</button>');settle(false);}
    request({action:'config'}).then(function(config){if(epoch!==modalEpoch||!modal)return;if(config.email_ready===true){entry();returnFocus=originalFocus;return;}if(config.manual_codes===true){panel().innerHTML=shell('Código de acceso facilitado por Tanabi','<p>Ingresa los dos datos que Tanabi te entregó para consultar únicamente tu carpeta autorizada.</p>'+codeForm(true));document.getElementById('g230-challenge').focus();return;}unavailable();}).catch(unavailable);return waiting;
  }`);
  text=text.replace("if (action === 'open') { open(); return; }", "if (action === 'contact') { close(); if(root.TSI230Support&&root.TSI230Support.open)root.TSI230Support.open(); return; } if (action === 'open') { open(); return; }");
  text=text.replace('Galerías privadas de STAGING.','Galerías privadas.').replace('El acceso invitado solo está habilitado en pruebas.','La conexión de acceso a fotografías no está configurada.');
 }
 if(name==='tsi-230-portfolio.js')text=text.replace('Portafolio disponible solo en staging.','La conexión del portafolio no está configurada.');
 text=text.replaceAll('ADMINISTRACIÓN · STAGING 2.3.0','ADMINISTRACIÓN · 2.3.0').replaceAll('EN PRUEBA','ENTRENAMIENTO');
 if(name==='game-ranking.js')text=text.replaceAll('STAGING','PRODUCTION');
 return text;
}
const files=fs.readdirSync(stage).filter(name=>/\.(?:js|css)$/.test(name)&&name!=='tsi-push-sw.js');
for(const name of files)output(bundle+name,transform(fs.readFileSync(path.join(stage,name),'utf8'),name));
for(const directory of ['brand','photo-game-scenes','vendor'])for(const name of fs.readdirSync(path.join(stage,directory))){const file=path.join(stage,directory,name);if(fs.statSync(file).isFile()&&!/\.md$/i.test(name))output(bundle+directory+'/'+name,/\.(js|css|json)$/.test(name)?fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(file));}
function html(name){
 let text=transform(fs.readFileSync(path.join(stage,name),'utf8'),name);
 text=text.replace(/\b(src|href)="([^"?#]+)([^\"]*)"/g,(match,attribute,resource,suffix)=>files.includes(resource)?attribute+'="'+bundle+resource+suffix+'"':match);
 text=text.replace('Tanabi Sports 2.3.0 · STAGING','Tanabi Sports 2.3.0').replace('Tanabi Sports Intelligence 2.3.0 · STAGING','Tanabi Sports Intelligence 2.3.0');
 if(name==='equipo.html'){
  text=text.replace('var APP_VERSION="2.3.0-staging"','var APP_VERSION="2.3.0"').replace(/^var tsiStage210Top=topbar;[^\n]*\n/m,'');
  text=text.replaceAll('staging','production').replaceAll('STAGING','PRODUCCIÓN').replaceAll('Pruebas','Tanabi Sports');
  text=text.replace('Tanabi Sports Intelligence 2.3.0 · PRODUCCIÓN','Tanabi Sports Intelligence 2.3.0').replace('TSI PRODUCCIÓN','TSI');
 }else{
  const roles=fs.readFileSync(path.join(stage,'tsi-230-role-catalog.js'),'utf8').match(/window\.TSI230RoleCatalog=(.*);/)[1],catalog=JSON.parse(roles),allowed=[...new Set(Object.values(catalog).flat().map(row=>row.id))];
  text=text.replace(/allowed=\[[^\]]+\]/,'allowed='+JSON.stringify(allowed));
 }
 return text;
}
output('index.html',html('index.html'));output('equipo.html',html('equipo.html'));
console.log('Prepared production 2.3.0 locally: index.html, equipo.html and '+bundle+'; no deployment performed.');
