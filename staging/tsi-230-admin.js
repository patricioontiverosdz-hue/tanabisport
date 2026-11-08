/* Tanabi Sports 2.3.0 · Staging administration and isolated, read-only previews. */
(function (global) {
  'use strict';
  var ROLES={foto:'Fotografía',editora:'Edición'}, PUBLIC=[['inicio','Inicio'],['portafolio','Portafolio'],['proceso','Cómo trabajamos'],['privacidad','Privacidad']];
  var GROUPS=[['Operaciones',['resumen','partidos','calendario','micalendario','cobertura','proceso','ubicaciones']],['Negocio',['cotizador','clientes','entregas','pendientes','borradores']],['Finanzas',['mipago','gastos','prestamos']],['Página pública',['tienda','portafolio']],['Equipo',['disponibilidad','disponibilidadedicion','comentarios','avisos','notif','atencion']],['Entrenamiento',['fotojuego','edicionjuego','rankingjuegos']],['TSI y configuración',['intelligence']]];
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function keyOf(user){return user&&user.id?String(user.id)+'|'+String(user.role):'';}
  function install(ctx){
    var owner=null,epoch=0,loaded=false,loading=false,error='',roles={},drafts={},pending={},conflicts={},requiresReload={},notice='',dialog=null,opener=null,mode='tools',selected='foto',previewRole='cliente',previewTab='inicio',loadPromise=null;
    function me(){return ctx.me&&ctx.me();}
    function admin(){return !!(me()&&me().role==='admin');}
    function catalog(role){
      var source=ctx.getCatalog?ctx.getCatalog():typeof ctx.catalog==='function'?ctx.catalog(role):ctx.catalog;
      if(source&&!Array.isArray(source))source=source[role];
      var seen={};return (source||[]).map(function(row){return Array.isArray(row)?{id:row[0],label:row[1]}:row;}).filter(function(row){if(!row||!row.id||seen[row.id]||(row.roles&&!row.roles.includes(role)))return false;seen[row.id]=true;return true;}).map(function(row){return {id:String(row.id),label:String(row.label||row.id),group:row.group||((GROUPS.find(function(g){return g[1].includes(row.id);})||['Otras herramientas'])[0])};});
    }
    function permitted(role){return catalog(role).map(function(row){return row.id;});}
    function enabled(role){return roles[role]?roles[role].enabled.slice():['resumen'];}
    function normalize(role,value){
      if(!value||!Array.isArray(value.enabled)||!Number.isSafeInteger(value.version)||value.version<0)throw Error('La configuración recibida está incompleta.');
      var allowed=permitted(role),list=value.enabled.filter(function(id){return allowed.includes(id);});
      if(allowed.includes('resumen')&&!list.includes('resumen'))list.unshift('resumen');
      return {version:value.version,enabled:Array.from(new Set(list))};
    }
    function notify(){if(ctx.onChanged)ctx.onChanged(api.status());global.dispatchEvent(new CustomEvent('tsi230:role-tools'));}
    function close(restore){if(dialog&&dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}if(restore!==false&&opener&&opener.isConnected)opener.focus({preventScroll:true});}
    function syncOwner(){
      var next=keyOf(me());if(next===owner)return false;
      owner=next;epoch++;loaded=false;loading=false;error='';roles={};drafts={};pending={};conflicts={};requiresReload={};notice='';loadPromise=null;close(false);return true;
    }
    function stale(token,who){return token!==epoch||who!==keyOf(me());}
    function receive(result,replace){
      if(!result||!result.roles||result.actor_role!==(me()&&me().role)||result.catalog_version!==1)throw Error('La configuración recibida no corresponde a esta sesión.');
      var incoming={},names=Object.keys(result.roles);names.forEach(function(role){if(!ROLES[role]||(!admin()&&role!==me().role))throw Error('La configuración recibida está fuera de tu rol.');incoming[role]=normalize(role,result.roles[role]);});
      if(admin()&&replace&&(!incoming.foto||!incoming.editora))throw Error('Falta la configuración de un rol.');
      if(!admin()&&ROLES[me().role]&&!incoming[me().role])throw Error('Falta la configuración de tu rol.');
      names.forEach(function(role){roles[role]=incoming[role];if(replace||!drafts[role])drafts[role]=incoming[role].enabled.slice();});
    }
    function message(err,fallback){return err&&err.message?String(err.message):fallback;}
    function paint(){if(dialog&&dialog.open&&admin())draw();}
    async function load(force,discardDrafts){
      syncOwner();if(!me()||!['admin','foto','editora'].includes(me().role))return false;
      if(Object.keys(pending).some(function(role){return pending[role].busy;}))return false;
      if(loading)return loadPromise;if(loaded&&!force)return true;
      var token=epoch,who=owner,retained={},oldPending=pending,oldConflicts=conflicts;
      if(!discardDrafts)Object.keys(roles).forEach(function(role){if(changed(role)||pending[role]||conflicts[role])retained[role]={enabled:(drafts[role]||enabled(role)).slice(),version:roles[role].version};});
      loading=true;error='';paint();
      loadPromise=(async function(){try{if(!ctx.loadConfig)throw Error('No se pudo conectar con la configuración.');var result=await ctx.loadConfig();if(stale(token,who))return false;Object.keys(requiresReload).forEach(function(role){if(!result||!result.roles||!result.roles[role]||result.roles[role].version<requiresReload[role])throw Error('La configuración vigente todavía no está disponible.');});receive(result,true);loaded=true;notice='';conflicts={};pending={};requiresReload={};Object.keys(retained).forEach(function(role){if(!roles[role])return;drafts[role]=retained[role].enabled;if(oldPending[role])pending[role]=oldPending[role];else if(oldConflicts[role]||retained[role].version!==roles[role].version)conflicts[role]=true;});if(Object.keys(conflicts).length)error='La configuración cambió. Tu selección sigue visible; recarga la configuración antes de volver a guardar.';notify();return true;}catch(err){if(stale(token,who))return false;error=message(err,'No se pudo cargar la configuración.');if(!admin()){loaded=false;roles={};drafts={};notify();}return false;}finally{if(!stale(token,who)){loading=false;loadPromise=null;paint();}}})();return loadPromise;
    }
    function changed(role){return JSON.stringify((drafts[role]||enabled(role)).slice().sort())!==JSON.stringify(enabled(role).sort());}
    function uuid(){if(global.crypto&&global.crypto.randomUUID)return global.crypto.randomUUID();throw Error('Este navegador necesita una conexión segura para guardar.');}
    async function save(role){
      syncOwner();if(!admin()||!ROLES[role]||!loaded||loading||Object.keys(requiresReload).length||Object.keys(pending).some(function(key){return pending[key].busy;})||conflicts[role])return false;
      var token=epoch,who=owner,request=pending[role];error='';notice='';
      try{if(!request)request={role:role,enabled:(drafts[role]||enabled(role)).slice(),expected_version:roles[role].version,request_id:uuid(),busy:false};}catch(err){error=message(err,'No se pudo preparar el cambio.');paint();return false;}
      request.busy=true;pending[role]=request;paint();
      try{
        if(!ctx.saveConfig)throw Error('No se pudo conectar con la configuración.');
        var result=await ctx.saveConfig({role:request.role,enabled:request.enabled.slice(),expected_version:request.expected_version,request_id:request.request_id});
        if(stale(token,who)||!admin())return false;
        if(!result||!result.roles||!result.roles[role])throw Error('No se recibió la confirmación del cambio.');
        receive(result,false);drafts[role]=roles[role].enabled.slice();delete pending[role];requiresReload[role]=roles[role].version;
        var fresh=await load(true);if(stale(token,who)||!admin())return false;
        notice='Herramientas de '+ROLES[role]+' guardadas.';if(!fresh)error='El guardado está confirmado. Recarga la configuración vigente antes de volver a guardar.';notify();return true;
      }catch(err){
        if(stale(token,who)||!admin())return false;
        var code=err&&(err.code||err.error_code),status=err&&err.status;
        if(code==='ROLE_TOOLS_CONFLICT'||status===409){conflicts[role]=true;delete pending[role];error='Otra persona guardó cambios. Recarga la configuración antes de volver a guardar. Tu selección sigue visible.';}
        else if(code==='ROLE_TOOLS_FORBIDDEN'||status===403){delete pending[role];error='Tu cuenta ya no tiene permiso para cambiar las herramientas.';}
        else if(code==='ROLE_TOOLS_INVALID'||status===400){delete pending[role];error=message(err,'Revisa las herramientas seleccionadas.');}
        else{request.busy=false;error='No se pudo confirmar el guardado. Reintenta para comprobar el mismo cambio.';}
        return false;
      }finally{if(!stale(token,who)){if(pending[role])pending[role].busy=false;paint();}}
    }
    function button(text,action,extra){return '<button type="button" data-tsi230-admin="'+action+'" '+(extra||'')+'>'+esc(text)+'</button>';}
    function buttons(){return admin()?button('Herramientas por rol','tools')+button('Ver como…','preview'):'';}
    function createDialog(){
      if(dialog)return;dialog=document.createElement('dialog');dialog.className='admin230-dialog';dialog.id='tsi230-admin';dialog.setAttribute('aria-labelledby','admin230-title');document.body.appendChild(dialog);
      dialog.addEventListener('cancel',function(event){event.preventDefault();close();});
      dialog.addEventListener('keydown',function(event){if(event.key!=='Tab')return;var nodes=Array.from(dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(function(node){return !node.closest('[hidden]');}),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
    }
    function open(which,role,source){
      syncOwner();if(!admin())return false;createDialog();if(!dialog.open)opener=source||document.activeElement;mode=which;
      if(which==='preview'){previewRole=role==='foto'||role==='editora'?role:'cliente';previewTab=previewRole==='cliente'?'inicio':'resumen';}
      draw();if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}dialog.querySelector('h2').focus();load(false);return true;
    }
    function toolSettings(){
      var role=selected,rows=catalog(role),selection=drafts[role]||enabled(role),work=pending[role],mustReload=!!Object.keys(requiresReload).length,otherBusy=Object.keys(pending).some(function(key){return pending[key].busy;}),locked=!loaded||loading||!!work||!!conflicts[role]||mustReload;
      var groups=Array.from(new Set(rows.map(function(row){return row.group;})));
      return '<div class="admin230-role-tabs" role="group" aria-label="Rol a configurar">'+Object.keys(ROLES).map(function(r){return button(ROLES[r],'role','data-role="'+r+'" aria-pressed="'+(role===r)+'"');}).join('')+'</div><p class="admin230-copy">Elige las herramientas disponibles para '+esc(ROLES[role])+'. Resumen siempre queda disponible.</p>'+(loaded?'<p class="admin230-meta">Versión guardada '+roles[role].version+(changed(role)?' · Cambios sin guardar':' · Configuración guardada')+'</p>':'')+'<div class="admin230-tool-groups">'+groups.map(function(group){return '<fieldset '+(locked?'disabled':'')+'><legend>'+esc(group)+'</legend>'+rows.filter(function(row){return row.group===group;}).map(function(row){return '<label class="admin230-toggle"><input type="checkbox" data-admin230-tool="'+esc(row.id)+'" data-role="'+role+'" '+(selection.includes(row.id)?'checked ':'')+(row.id==='resumen'?'disabled ':'')+'><span>'+esc(row.label)+(row.id==='resumen'?'<small>Siempre disponible</small>':'')+'</span></label>';}).join('')+'</fieldset>';}).join('')+'</div><footer class="admin230-save">'+button(work&&work.busy?'Guardando…':work?'Reintentar guardado':'Guardar herramientas','save','data-role="'+role+'" class="admin230-primary" '+(!loaded||loading||otherBusy||mustReload||conflicts[role]||!work&&!changed(role)?'disabled':''))+button('Ver como '+ROLES[role],'preview-role','data-role="'+role+'" '+(!loaded||loading?'disabled':''))+(conflicts[role]||mustReload?button('Recargar configuración','reload'):'')+'<span>La vista previa usa la última configuración guardada.</span></footer>';
    }
    function table(headings,rows){return '<div class="admin230-table-wrap"><table><thead><tr>'+headings.map(function(label){return '<th scope="col">'+esc(label)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(value){return '<td>'+esc(value)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
    function metric(label,value){return '<article class="admin230-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>';}
    function sampleModule(role,id,label){
      var photo=role==='foto',matches=[['Muestra A vs. Muestra B','Sábado · 10:00','Cancha de muestra','Asignado'],['Muestra C vs. Muestra D','Domingo · 12:00','Cancha de muestra','Por confirmar']];
      var h='<p class="admin230-eyebrow">'+esc(ROLES[role])+' · DATOS DE MUESTRA</p><h3>'+esc(label)+'</h3>';
      if(id==='resumen')return h+'<p>'+esc(photo?'Tu siguiente cobertura, en orden.':'Tu trabajo, con tiempo registrado.')+'</p><div class="admin230-metrics">'+metric(photo?'Tus próximos partidos':'En tu cola de edición','2')+metric('Horario de la semana','Confirmado')+metric(photo?'Coberturas por completar':'Entregas listas','1')+'</div>'+table(['Partido','Fecha','Lugar','Estado'],matches);
      if(['partidos','calendario','micalendario','ubicaciones'].includes(id))return h+table(['Partido','Fecha','Lugar','Estado'],matches)+'<p class="admin230-readonly">Consulta de muestra. Las asignaciones y coberturas no se modifican desde aquí.</p>';
      if(['cobertura','proceso','intelligence','entregas','pendientes','borradores'].includes(id))return h+table(['Trabajo','Avance','Siguiente paso'],[['Partido de muestra A','Selección en curso','Revisar fotografías'],['Partido de muestra B','Material recibido','Preparar entrega']])+'<div class="admin230-metrics">'+metric(photo?'Trabajos propios':'Tu cola','2')+metric('Entrega de muestra','En revisión')+'</div><button type="button" disabled>'+esc(id==='intelligence'?'Iniciar sesión de edición':'Actualizar avance')+'</button>';
      if(id==='disponibilidad'||id==='disponibilidadedicion')return h+'<p>Horario semanal de muestra. Cada semana se confirma de forma independiente.</p>'+table(['Día','Disponibilidad','Horario'],[['Lunes','Disponible','17:00–21:00'],['Martes','Disponible','17:00–21:00'],['Miércoles','Sin disponibilidad','—'],['Jueves','Disponible','17:00–21:00'],['Viernes','Disponible','17:00–21:00'],['Sábado','Disponible','09:00–18:00'],['Domingo','Disponible','09:00–18:00']])+'<button type="button" disabled>Confirmar disponibilidad</button>';
      if(id==='mipago')return h+'<p>Pago personal ilustrativo. Los importes de muestra no corresponden a una persona.</p><div class="admin230-metrics">'+metric('Trabajo registrado','$600.00')+metric('Pendiente de revisión','$200.00')+'</div>'+table(['Concepto','Estado','Importe'],[['Trabajo de muestra','Registrado','$600.00'],['Trabajo de muestra B','Por revisar','$200.00']]);
      if(id==='cotizador')return h+'<p>Cotización personal de muestra y tarifa aprobada para el servicio.</p>'+table(['Servicio','Cantidad','Precio al cliente'],[['Fotografía de partido','1','$1,500.00']])+'<p>Total ilustrativo: $1,500.00</p><button type="button" disabled>Guardar cotización</button>';
      if(id==='clientes')return h+table(['Cliente de muestra','Estado'],[['Equipo de muestra A','Seguimiento pendiente'],['Equipo de muestra B','Entrega preparada']]);
      if(id==='gastos'||id==='prestamos')return h+table(['Concepto de muestra','Estado','Importe'],[[id==='gastos'?'Traslado de muestra':'Solicitud de muestra','Por revisar','$100.00']])+'<button type="button" disabled>Registrar solicitud</button>';
      if(['comentarios','avisos','notif','atencion'].includes(id))return h+'<article class="admin230-sample-card"><h4>'+esc(id==='atencion'?'Conversación de muestra':'Mensaje de muestra')+'</h4><p>'+esc(id==='atencion'?'Equipo de muestra: ¿cuándo estará lista la entrega?':'Revisa la información de tu próximo trabajo y confirma el horario de la semana.')+'</p><span>Ejemplo ilustrativo · Sin mensajes reales</span></article><button type="button" disabled>Enviar respuesta</button>';
      if(id==='tienda'||id==='portafolio')return h+'<div class="admin230-sample-card"><div class="admin230-photo-art" aria-label="Imagen de muestra">TANABI<br><span>FOTOGRAFÍA · VIDEO · DEPORTE</span></div><h4>'+esc(id==='tienda'?'Carpeta de muestra':'Imagen de página de muestra')+'</h4><p>'+esc(id==='tienda'?'Material preparado para una entrega de ejemplo.':'Selección y publicación de imágenes de página, según las herramientas habilitadas para el rol.')+'</p><button type="button" disabled>'+esc(id==='tienda'?'Crear entrega':'Publicar imagen')+'</button></div>';
      if(['fotojuego','edicionjuego','rankingjuegos'].includes(id))return h+'<div class="admin230-sample-card"><p>'+esc(id==='fotojuego'?'Practica composición, enfoque y exposición con escenas deportivas.':id==='edicionjuego'?'Practica las decisiones de selección y edición de una fotografía.':'Consulta el avance del entrenamiento y el podio del equipo.')+'</p>'+table(['Entrenamiento','Avance de muestra'],[[id==='edicionjuego'?'Reto de edición':'Reto fotográfico','3 de 5 ejercicios']])+'<button type="button" disabled>'+esc(id==='rankingjuegos'?'Ver resultado de muestra':'Iniciar entrenamiento')+'</button></div>';
      return h+'<article class="admin230-sample-card"><p>Herramienta disponible para este rol según la configuración guardada.</p><p>Contenido ilustrativo, sin información de cuentas reales.</p></article>';
    }
    function safePublicHTML(html){
      var template=document.createElement('template');template.innerHTML=String(html||'');
      template.content.querySelectorAll('script,style,link,meta,base,iframe,object,embed,form,input,select,textarea,audio,video,source,svg,math,picture').forEach(function(node){node.remove();});
      template.content.querySelectorAll('*').forEach(function(node){
        if(!['DIV','SPAN','MAIN','HEADER','SECTION','FIGURE','FIGCAPTION','FOOTER','BUTTON','IMG','NAV','P','H1','H2','H3','H4','H5','H6','EM','STRONG','SMALL','UL','OL','LI','A','BR','I','B','ARTICLE'].includes(node.tagName)){node.remove();return;}
        var page=node.getAttribute('data-ui230-page');if(node.getAttribute('data-ui230-action')==='home')page='inicio';
        Array.from(node.attributes).forEach(function(attribute){var name=attribute.name.toLowerCase();if(!['class','role','title','alt','src','width','height','loading','decoding'].includes(name)&&!name.startsWith('aria-'))node.removeAttribute(attribute.name);});
        if(node.tagName==='IMG'){var source=node.getAttribute('src')||'',safe=/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source);try{var url=new URL(source,global.location.href);safe=safe||(url.origin===global.location.origin&&/^https?:$/.test(url.protocol));}catch(ignored){}if(!safe)node.removeAttribute('src');}
        else node.removeAttribute('src');
        if(node.tagName==='BUTTON'){node.setAttribute('type','button');if(PUBLIC.some(function(row){return row[0]===page;})){node.setAttribute('data-tsi230-admin','preview-tab');node.setAttribute('data-module',page);}else{node.disabled=true;node.setAttribute('aria-disabled','true');}}
        if(node.tagName==='A'){node.setAttribute('aria-disabled','true');node.setAttribute('tabindex','-1');}
      });return template.innerHTML;
    }
    function publicContent(id){
      if(ctx.publicPreviewHTML){try{var rendered=safePublicHTML(ctx.publicPreviewHTML(id));if(rendered)return '<div class="admin230-public-render tsi230-app">'+rendered+'</div>';}catch(ignored){}}
      if(id==='proceso')return '<p class="admin230-eyebrow">CÓMO TRABAJAMOS</p><h3>Tú vives el partido.<br>Nosotros lo capturamos.</h3><ol class="admin230-process"><li>Cuéntanos tu partido</li><li>Confirmamos contigo</li><li>Capturamos y editamos</li><li>Recibes tu material</li></ol>';
      if(id==='privacidad')return '<p class="admin230-eyebrow">PRIVACIDAD</p><h3>Tu información, con cuidado.</h3><p>El sitio ofrece el aviso de privacidad y el consentimiento de fotografías. Esta vista previa no abre formularios ni descarga documentos.</p>';
      if(id==='portafolio')return '<p class="admin230-eyebrow">PORTAFOLIO</p><h3>Acción, emoción y equipo.</h3><div class="admin230-photo-art">TANABI<br><span>PORTAFOLIO DE MUESTRA</span></div><p>Representación de la galería pública. Sin archivos privados de clientes.</p>';
      return '<div class="admin230-public-hero"><div><p class="admin230-eyebrow">FOTOGRAFÍA Y VIDEO DEPORTIVO</p><h3>Cada jugada,<br><em>un cuadro.</em></h3><p>El esfuerzo de tu equipo merece quedarse en una gran imagen.</p><button type="button" disabled>Hablar con Tanabi</button> '+button('Ver portafolio','preview-tab','data-module="portafolio"')+'</div><div class="admin230-photo-art">TANABI<br><span>FOTOGRAFÍA · VIDEO · DEPORTE</span></div></div>';
    }
    function preview(){
      var client=previewRole==='cliente',available=client?PUBLIC.map(function(row){return {id:row[0],label:row[1]};}):catalog(previewRole).filter(function(row){return enabled(previewRole).includes(row.id);});
      if(!available.some(function(row){return row.id===previewTab;}))previewTab=client?'inicio':'resumen';
      var entry=available.find(function(row){return row.id===previewTab;})||available[0];
      return '<div class="admin230-preview-switch" role="group" aria-label="Ver como">'+[['cliente','Cliente'],['foto','Fotografía'],['editora','Edición']].map(function(row){return button(row[1],'preview-role','data-role="'+row[0]+'" aria-pressed="'+(previewRole===row[0])+'" '+(row[0]!=='cliente'&&!loaded?'disabled':''));}).join('')+'</div><p class="admin230-preview-note">Vista previa · datos de ejemplo. '+esc(client?'Vista pública.':'Herramientas de '+ROLES[previewRole]+' según la última configuración guardada.')+' Solo lectura.</p>'+(!client&&!loaded?'<p role="status">Carga la configuración para revisar las herramientas de este rol.</p>':'<div class="admin230-preview-layout '+(client?'admin230-preview-public':'')+'"><nav aria-label="Módulos de vista previa">'+available.map(function(row){return button(row.label,'preview-tab','data-module="'+esc(row.id)+'" '+(row.id===previewTab?'aria-current="page"':''));}).join('')+'</nav><section class="admin230-preview-content" aria-live="polite">'+(client?publicContent(previewTab):sampleModule(previewRole,previewTab,entry?entry.label:'Resumen'))+'</section></div>');
    }
    function draw(){
      if(!dialog||!admin())return;
      var active=document.activeElement,focus=dialog.contains(active)?{id:active.id,action:active.getAttribute('data-tsi230-admin'),role:active.getAttribute('data-role'),module:active.getAttribute('data-module'),tool:active.getAttribute('data-admin230-tool')}:null;
      dialog.innerHTML='<header class="admin230-header"><div><p class="admin230-eyebrow">ADMINISTRACIÓN · STAGING 2.3.0</p><h2 id="admin230-title" tabindex="-1">'+(mode==='preview'?'Vista previa':'Herramientas por rol')+'</h2><p>'+esc(mode==='preview'?'Revisa la experiencia sin cambiar tu sesión de Administración.':'Administra las herramientas de Fotografía y Edición.')+'</p></div>'+button(mode==='preview'?'Volver a Administración':'Cerrar','close','class="admin230-back"')+'</header><div class="admin230-body">'+(loading?'<p class="admin230-status" role="status">Cargando configuración…</p>':'')+(error?'<div class="admin230-error" role="alert"><p>'+esc(error)+'</p>'+(!loaded&&!loading?button('Reintentar carga','reload'):'')+'</div>':'')+(notice?'<p class="admin230-success" role="status">'+esc(notice)+'</p>':'')+(mode==='preview'?preview():toolSettings())+'</div>';
      if(focus){var next=Array.from(dialog.querySelectorAll('button,input,[tabindex="-1"]')).find(function(node){if(focus.tool)return node.getAttribute('data-admin230-tool')===focus.tool&&node.getAttribute('data-role')===focus.role;if(focus.action)return node.getAttribute('data-tsi230-admin')===focus.action&&node.getAttribute('data-role')===focus.role&&node.getAttribute('data-module')===focus.module;return focus.id&&node.id===focus.id;});if(!next||next.disabled)next=dialog.querySelector('h2');if(next)next.focus({preventScroll:true});}
    }
    function filterTabs(role,entries){syncOwner();if(role==='admin'||!ROLES[role])return entries;var list=enabled(role);return entries.filter(function(row){return row[0]==='resumen'||list.includes(row[0]);});}
    function afterRender(){var reset=syncOwner();if(!admin())close(false);if(me()&&['admin','foto','editora'].includes(me().role)&&!loaded&&!loading&&(reset||!error))load(false);}
    function status(){syncOwner();return {loaded:loaded,loading:loading,error:error,roles:copy(roles),owner:owner,requiresReload:!!Object.keys(requiresReload).length};}
    document.addEventListener('click',function(event){
      var b=event.target.closest('[data-tsi230-admin]');if(!b)return;var action=b.getAttribute('data-tsi230-admin');
      if(!admin())return;if(b.closest('.admin230-dialog')!==dialog&&['tools','preview'].indexOf(action)<0)return;
      event.preventDefault();event.stopPropagation();
      if(action==='tools')open('tools',null,b);if(action==='preview')open('preview','cliente',b);if(action==='close')close();
      if(action==='role'&&ROLES[b.getAttribute('data-role')]){selected=b.getAttribute('data-role');draw();}
      if(action==='reload'){if(Object.keys(pending).some(function(role){return pending[role].busy;}))return;load(true,!Object.keys(requiresReload).length);}
      if(action==='save')save(b.getAttribute('data-role'));
      if(action==='preview-role'){var role=b.getAttribute('data-role');if(role!=='cliente'&&!ROLES[role])return;mode='preview';previewRole=role;previewTab=role==='cliente'?'inicio':'resumen';draw();}
      if(action==='preview-tab'){var id=b.getAttribute('data-module'),allowed=previewRole==='cliente'?PUBLIC.map(function(row){return row[0];}):enabled(previewRole);if(!allowed.includes(id))return;previewTab=id;draw();}
    });
    document.addEventListener('change',function(event){var input=event.target;if(!dialog||!dialog.contains(input)||!input.hasAttribute('data-admin230-tool')||!admin())return;var role=input.getAttribute('data-role'),id=input.getAttribute('data-admin230-tool');if(!ROLES[role]||!loaded||loading||pending[role]||conflicts[role]||Object.keys(requiresReload).length||id==='resumen'||!permitted(role).includes(id))return;var selection=drafts[role]||enabled(role);drafts[role]=selection.filter(function(key){return key!==id;});if(input.checked)drafts[role].push(id);notice='';draw();var next=dialog.querySelector('[data-admin230-tool="'+id+'"]');if(next)next.focus();});
    global.addEventListener('tsi230:role-tools-refresh',function(){load(true);});
    var api=Object.freeze({buttons:buttons,openTools:function(source){return open('tools',null,source);},openPreview:function(role,source){return open('preview',role,source);},close:close,load:load,refresh:function(){return load(true);},save:save,allowedModules:function(role){syncOwner();return role==='admin'?permitted(role):enabled(role);},filterTabs:filterTabs,afterRender:afterRender,status:status});
    return api;
  }
  global.TSI230Admin=Object.freeze({install:install,version:'2.3.0'});
})(window);
