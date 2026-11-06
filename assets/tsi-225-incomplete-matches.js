/* TSI 2.2.5 · Partidos incompletos, solo ADMIN. */
(function(root){
"use strict";
var FIELDS=["date","time","cat","teams","home","away","team_mode","venue","addr","notes"];
function clean(source){
 var v=source||{},o={}; FIELDS.forEach(function(k){o[k]=String(v[k]==null?"":v[k]).trim();});
 if(o.team_mode!=="text")o.team_mode="split";
 if(o.team_mode==="split")o.teams=o.home&&o.away?o.home+" vs "+o.away:"";
 return o;
}
function missing(d){
 d=clean(d);var a=[];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||isNaN(Date.parse(d.date+"T12:00:00Z"))||new Date(d.date+"T12:00:00Z").toISOString().slice(0,10)!==d.date)a.push("fecha");
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))a.push("hora");
 if(!d.cat)a.push("categoría");
 if(d.team_mode==="split"?(!d.home||!d.away||d.home.toLowerCase()===d.away.toLowerCase()):!d.teams)a.push("equipos");
 if(!d.venue)a.push("campo");
 return a;
}
function candidates(ri){
 if(!ri||!ri.file||!Array.isArray(ri.rows))return [];
 return ri.rows.filter(function(row){
  var d=row.data||{},rol=d.rol||{},reason=String(row.error||"");
  if(/fórmula con error/i.test(reason))return false;
  if(![d.date,d.time,d.cat,d.venue,rol.local,rol.visitor].some(function(v){return String(v||"").trim();}))return false;
  // No confiar en 'duplicado exacto' del importador ordinario:
  // su clave provisional colapsa partidos diferentes cuando faltan datos.
  return missing(fromRow(row,ri.file)).length>0;
 });
}
function fromRow(row,file){
 var d=row.data||{},r=d.rol||{},notes=["Archivo "+file.name+" · fila "+row.row,r.modality?"Modalidad "+r.modality:"",r.group?"Grupo "+r.group:"",r.notes||""].filter(Boolean).join(" · ");
 return clean({date:d.date,time:d.time,cat:d.cat,home:r.local,away:r.visitor,venue:d.venue,addr:d.addr||d.venue,notes:notes.slice(0,2000)});
}
async function stableId(file,row){
 var b=new TextEncoder().encode("tsi225-incomplete:"+file.sha256+":"+row),hash=new Uint8Array(await crypto.subtle.digest("SHA-256",b));
 var h=Array.from(hash).map(function(x){return x.toString(16).padStart(2,"0");}).join("");
 return h.slice(0,8)+"-"+h.slice(8,12)+"-8"+h.slice(13,16)+"-"+h.slice(16,20)+"-"+h.slice(20,32);
}
function install(api){
 if(!["https://nksqpoigywfegcbvfhoa.supabase.co","https://tantlgswituiwkxfgmsr.supabase.co"].includes(api.server))throw Error("Entorno no autorizado.");
 var st={owner:"",rows:[],loaded:false,loading:false,busy:false,error:"",message:"",id:"",version:0,form:null,closed:false,pending:null,batch:null,selected:{}};
 function admin(){var m=api.me();return !!m&&m.role==="admin";}
 function uid(){return admin()?api.me().id:"";}
 function reset(id){st.owner=id;st.rows=[];st.loaded=false;st.loading=false;st.busy=false;st.error="";st.message="";st.id="";st.version=0;st.form=null;st.closed=false;st.pending=null;st.batch=null;st.selected={};}
 function ok(id){return !!id&&admin()&&uid()===id&&st.owner===id;}
 async function request(verb,path,body,id){
  if(!ok(id))throw Error("La sesión cambió.");
  var r=await api.request(verb,path,verb==="GET"?undefined:body,id);
  if(!ok(id))throw Error("La sesión cambió.");
  return r;
 }
 async function load(){
  if(!admin()||st.loading)return;
  var id=uid();st.loading=true;
  try{
   var result=await request("GET","/rest/v1/tsi225_match_drafts?select=id,data,version,updated_at,published_match_id&order=updated_at.desc&limit=500",null,id);
   if(!ok(id))return;
   st.rows=Array.isArray(result)?result:[];st.loaded=true;st.error="";
  }catch(e){if(ok(id)){st.loaded=false;st.error="No se pudieron cargar los pendientes: "+e.message;}}
  finally{if(ok(id)){st.loading=false;api.render();}}
 }
 function beforeRender(tab){var id=uid();if(st.owner!==id)reset(id);if(id&&(tab==="incompletos"||tab==="importarrol")&&!st.loaded&&!st.loading&&!st.error)load();}
 function field(k,label,type){
  if(k==="notes")return '<label>'+label+'<textarea rows="3" maxlength="2000" data-pm-field="'+k+'">'+api.esc(st.form[k]||"")+'</textarea></label>';
  return '<label>'+label+'<input type="'+(type||"text")+'" data-pm-field="'+k+'" value="'+api.esc(st.form[k]||"")+'" maxlength="'+({cat:100,teams:304,home:150,away:150,venue:200,addr:2000}[k]||2000)+'"></label>';
 }
 function formHtml(){
  if(!st.form)return "";
  var d=st.form,needs=missing(d),h='<section class="card" id="pm-form"><h3>'+ (st.id?"Revisar pendiente":"Nuevo juego incompleto")+'</h3><p>Los datos quedarán disponibles únicamente para ADMIN hasta su publicación.</p>';
  h+='<fieldset '+(st.closed?'disabled':'')+'><div class="grid2">'+field("date","Fecha","date")+field("time","Hora","time")+field("cat","Categoría / modalidad")+
  '<label>Equipos<select data-pm-field="team_mode"><option value="split" '+(d.team_mode==="split"?'selected':'')+'>Local y visitante</option><option value="text" '+(d.team_mode==="text"?'selected':'')+'>Nombre libre</option></select></label>'+
  (d.team_mode==="split"?field("home","Local")+field("away","Visitante"):field("teams","Nombre de los equipos"))+
  field("venue","Campo")+field("addr","Dirección")+'</div>'+field("notes","Notas")+'</fieldset>';
  h+='<p class="hint">'+(st.closed?"Este partido ya fue publicado.":needs.length?"Pendiente para publicar: "+api.esc(needs.join(", ")):"Todos los datos obligatorios están completos.")+'</p><div class="row"><button class="btn" data-pm="close">Cerrar</button>';
  if(!st.closed)h+='<button class="btn primary" data-pm="save" '+(st.busy?'disabled':'')+'>'+(st.pending?"Reintentar guardado":"Guardar pendiente")+'</button>';
  if(st.id&&!st.closed)h+='<button class="btn" data-pm="publish" '+(needs.length||st.pending||st.busy?'disabled':'')+'>Publicar partido completo</button>';
  return h+'</div></section>';
 }
 function view(){
  if(!admin())return "";
  var pending=st.rows.filter(function(r){return !r.published_match_id;});
  var html='<section class="ti-intro"><span class="ti-eyebrow">Operaciones · Sólo ADMIN</span><h2>Rol de juegos incompletos</h2><p>Conserva los juegos con campos pendientes sin que aparezcan en el calendario ni en las cuentas del personal. Solo ADMIN podrá publicarlos.</p></section>'+
  '<section class="card"><div class="row"><button class="btn primary" data-pm="new">Nuevo pendiente</button><button class="btn" data-pm="refresh">Actualizar lista</button></div>'+
  (st.error?'<p class="err" role="alert">'+api.esc(st.error)+'</p>':'')+(st.message?'<p class="note" role="status">'+api.esc(st.message)+'</p>':'')+
  (st.loading?'<p>Cargando…</p>':st.loaded?'<p>'+pending.length+' incompletos · '+st.rows.filter(function(r){return r.published_match_id;}).length+' publicados.</p>':'<p>Pendientes por consultar.</p>')+'</section>';
  if(st.rows.length)html+='<section class="card"><h3>Pendientes registrados</h3><div class="ti-table"><table><thead><tr><th>Partido</th><th>Fecha</th><th>Campo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>'+
   st.rows.map(function(r){var d=clean(r.data),needs=missing(d),teams=d.team_mode==="split"?(d.home||"Local ?")+" vs "+(d.away||"Visitante ?"):(d.teams||"Equipos pendientes");return '<tr><td>'+api.esc(teams)+'<small> '+api.esc(d.cat)+'</small></td><td>'+api.esc(d.date||"Sin fecha")+' '+api.esc(d.time)+'</td><td>'+api.esc(d.venue||"Sin campo")+'</td><td>'+(r.published_match_id?"Publicado":needs.length?"Incompleto: "+needs.length:"Listo para publicar")+'</td><td><button class="btn small" data-pm="edit" data-pm-id="'+api.esc(r.id)+'">Revisar</button></td></tr>';}).join("")+'</tbody></table></div></section>';
  return html+formHtml();
 }
 function importer(){
  if(!admin())return "";
  var ri=api.importState(),rows=candidates(ri);if(!ri||!ri.file)return "";
  var selected=rows.filter(function(r){return st.selected[ri.file.sha256+":"+r.row]!==false;}).length;
  var unavailable=st.busy||st.loading||!st.loaded;
  var html='<section class="card" id="pm-importer" aria-label="Importar juegos incompletos">'+
   '<h3>Importar juegos incompletos · Solo ADMIN</h3>'+
   '<p>Desde <strong>Importar rol</strong> puedes guardar filas sin fecha, hora, categoría, campo o equipos. No se publican: quedan como pendientes privados de ADMIN para completar después.</p>'+
   (st.error?'<p class="err" role="alert">'+api.esc(st.error)+'</p>':'')+
   (st.message?'<p class="note" role="status">'+api.esc(st.message)+'</p>':'')+
   (st.loading?'<p role="status">Consultando registros guardados…</p>':'')+
   (!st.loaded&&!st.loading?'<p class="hint">No se pudo consultar la lista de pendientes. Actualiza la consulta antes de guardar.</p>':'')+
   '<div class="row"><button class="btn small" data-pm="refresh" '+(st.loading||st.busy?'disabled':'')+'>Actualizar pendientes</button></div>';
  if(!rows.length)return html+'<p>No hay filas incompletas recuperables en el archivo. Las filas con fórmulas dañadas se excluyen.</p></section>';
  html+='<p><strong>'+rows.length+' filas incompletas</strong> · '+selected+' seleccionadas. Las filas completas se importan por separado con el botón habitual.</p>'+
   '<div class="ti-table"><table><thead><tr><th>Guardar</th><th>Fila</th><th>Equipos</th><th>Falta completar</th></tr></thead><tbody>';
  rows.forEach(function(r){
   var d=fromRow(r,ri.file),key=ri.file.sha256+":"+r.row,duplicate=/duplicado exacto/i.test(String(r.error||""));
   html+='<tr><td><input type="checkbox" aria-label="Guardar fila incompleta '+r.row+'" data-pm-row="'+api.esc(key)+'" '+(st.selected[key]===false?'':'checked')+' '+(st.batch||unavailable?'disabled':'')+'></td>'+
    '<td>'+r.row+'</td><td>'+api.esc((d.home||"Local pendiente")+" vs "+(d.away||"Visitante pendiente"))+'</td>'+
    '<td>'+api.esc(missing(d).join(", "))+(duplicate?'<small> · Posible duplicado, verifica el archivo</small>':'')+'</td></tr>';
  });
  return html+'</tbody></table></div>'+
   '<button class="btn primary" data-pm="import" '+(unavailable||!st.batch&&selected===0?'disabled':'')+'>'+
   (st.batch?'Reintentar el mismo lote de pendientes':'Guardar '+selected+' juegos incompletos (solo ADMIN)')+'</button>'+
   '<p class="hint">No añade partidos al calendario ni asigna fotógrafos. La publicación posterior requiere aprobación de ADMIN.</p></section>';
 }
 function open(row){
  st.error="";st.message="";st.pending=null;
  if(row){st.id=row.id;st.form=clean(row.data);st.version=row.version;st.closed=!!row.published_match_id;}
  else{st.id="";st.form=clean({});st.version=0;st.closed=false;}
  api.render();
 }
 async function save(){
  if(!admin()||st.busy||!st.form||st.closed)return;
  if(!api.syncIdle()){st.error="Hay cambios pendientes en el portal. Espera a que se sincronicen.";api.render();return;}
  var owner=uid(),payload=st.pending||{p_id:st.id||api.uuid(),p_data:clean(st.form),p_expected_version:st.version};
  st.busy=true;st.error="";
  try{
   var r=await request("POST","/rest/v1/rpc/tsi225_match_draft_save",payload,owner);
   if(!ok(owner))return;
   st.id=r.id;st.form=clean(r.data);st.version=r.version;st.pending=null;st.message="Pendiente guardado exclusivamente para ADMIN.";
   await load();
  }catch(e){if(ok(owner)){st.error=e.message;st.pending=!e.status||e.status===408||e.status>=500?payload:null;}}
  finally{if(ok(owner)){st.busy=false;api.render();}}
 }
 async function publish(){
  if(!admin()||st.busy||!st.id||!st.form||st.closed||st.pending||missing(st.form).length)return;
  if(!api.syncIdle()){st.error="Espera a que termine la sincronización.";api.render();return;}
  if(!confirm("¿Publicar este partido? Será visible para el equipo según sus permisos."))return;
  var owner=uid(),payload={p_id:st.id,p_expected_version:st.version};st.busy=true;st.error="";
  try{
   var r=await request("POST","/rest/v1/rpc/tsi225_match_draft_publish",payload,owner);
   if(!ok(owner))return;
   st.closed=true;st.version=r.version;st.message=r.already_published?"El partido ya estaba publicado.":"Partido completo publicado.";
   await api.reloadMatches();await load();
  }catch(e){if(ok(owner))st.error=e.message;}
  finally{if(ok(owner)){st.busy=false;api.render();}}
 }
 async function importAll(){
  if(!admin()||st.busy)return;var ri=api.importState();
  if(!ri||!ri.file)return;
  if(!st.loaded){st.error="Primero carga la lista actualizada de pendientes con el botón Actualizar pendientes.";api.render();return;}
  if(!api.syncIdle()){st.error="Termina primero la sincronización de cambios.";api.render();return;}
  var owner=uid();st.busy=true;st.error="";
  try{
   if(!st.batch){
    var items=[],existing=new Set(st.rows.map(function(x){return x.id;}));
    for(var row of candidates(ri)){
     if(st.selected[ri.file.sha256+":"+row.row]===false)continue;
     var id=await stableId(ri.file,row.row);
     if(existing.has(id))continue;
     items.push({p_id:id,p_data:fromRow(row,ri.file),p_expected_version:0});
    }
    if(!items.length){st.message="Los juegos seleccionados ya estaban guardados o no hay nuevos.";return;}
    if(items.length>100)throw Error("Importa hasta 100 juegos incompletos por lote.");
    st.batch={p_items:items};
   }
   var r=await request("POST","/rest/v1/rpc/tsi225_match_draft_save_many",st.batch,owner);
   if(!ok(owner))return;
   st.batch=null;st.message=(Array.isArray(r)?r.length:0)+" juegos incompletos guardados sin publicarse.";
   await load();
  }catch(e){if(ok(owner)){st.error=e.message;if(e.status>=400&&e.status<500&&e.status!==408)st.batch=null;}}
  finally{if(ok(owner)){st.busy=false;api.render();}}
 }
 document.addEventListener("input",function(e){
  if(!admin()||!st.form||st.closed||st.pending)return;var key=e.target&&e.target.getAttribute&&e.target.getAttribute("data-pm-field");
  if(key&&FIELDS.includes(key))st.form[key]=e.target.value;
 });
 document.addEventListener("change",function(e){
  if(!admin()||!e.target||!e.target.getAttribute)return;
  var key=e.target.getAttribute("data-pm-row");if(key!==null&&!st.batch)st.selected[key]=e.target.checked;
  if(e.target.getAttribute("data-pm-field")==="team_mode"&&st.form&&!st.pending){st.form.team_mode=e.target.value;api.render();}
 });
 document.addEventListener("click",function(e){
  var b=e.target&&e.target.closest&&e.target.closest("[data-pm]");if(!b||!admin()||st.busy)return;
  var act=b.getAttribute("data-pm");
  if(st.pending&&act!=="save"&&act!=="refresh"){st.error="Reintenta el guardado antes de cambiar.";api.render();return;}
  if(st.batch&&act!=="import"&&act!=="refresh"){st.error="Reintenta el lote pendiente antes de cambiar.";api.render();return;}
  if(act==="new")open(null);
  if(act==="edit"){var row=st.rows.find(function(r){return r.id===b.getAttribute("data-pm-id");});if(row)open(row);}
  if(act==="close"){st.form=null;st.id="";api.render();}
  if(act==="refresh"){st.error="";load();}
  if(act==="save")save();
  if(act==="publish")publish();
  if(act==="import")importAll();
 });
 return {beforeRender:beforeRender,view:view,importer:importer,load:load};
}
root.TSIPartialMatches225={install:install,clean:clean,missing:missing,candidates:candidates,fromRow:fromRow,stableId:stableId};
})(window);
