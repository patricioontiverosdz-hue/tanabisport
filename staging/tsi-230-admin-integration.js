/* Installed inside the employee closure through TSI230AdminBridge. */
(function(root){'use strict';
 root.TSI230AdminBridge={install:function(ctx){
  var pending=null,lastOwner='',admin;
  function me(){return ctx.me();}
  function identity(){var u=me();return u?String(u.id)+'|'+u.role:'';}
  function controlTool(el){var action=el.getAttribute('data-ti'),x=el.getAttribute('data-x'),request=ctx.editingRequest&&ctx.editingRequest();return el.getAttribute('data-tab')||el.getAttribute('data-ui230-module')||(el.hasAttribute('data-ti')?(action==='capacity'||action==='retry'&&request&&request.operation==='capacity'||action==='reload'&&ctx.state.tab==='disponibilidadedicion'?'disponibilidadedicion':'intelligence'):el.getAttribute('data-ui230-action')==='staffSupport'?'atencion':x==='goNotif'?'notif':x==='d29ViewMatch'?'partidos':['av29ToggleImages','av29ReloadImages'].includes(x)?'avisos':null);}
  function canAccess(key){var u=me();return !!u&&(u.role==='admin'||key==='resumen'||admin.allowedModules(u.role).includes(key));}
  function ensureTab(){var u=me(),who=identity();if(who!==lastOwner){pending=null;lastOwner=who;}
   if(!u||u.role==='admin'||ctx.state.view!=='dash')return;
   var status=admin.status(),tab=ctx.state.tab||'resumen';
   if(status.loaded&&pending&&pending.owner===who){if(canAccess(pending.tab))ctx.state.tab=pending.tab;pending=null;tab=ctx.state.tab;}
   if(!canAccess(tab)){
    if(!status.loaded&&!status.error)pending={owner:who,tab:tab};
    else ctx.state.banner=status.error&&!status.loaded?'No se pudieron confirmar tus herramientas. Vuelve a cargar la página para intentar de nuevo.':'Esta herramienta fue desactivada por Administración.';
    ctx.state.tab='resumen';
   }
  }
  async function request(route,payload){
   var u=me(),who=identity(),uid=ctx.getAuth().uid||'';
   function current(){return identity()===who&&(ctx.getAuth().uid||'')===uid&&u&&String(u.id)===uid;}
   if(!current())throw Error('Entra con tu cuenta del equipo.');
   await ctx.ensureToken();if(!current())throw Error('La cuenta cambió. Abre de nuevo esta opción.');
   var response=await root.fetch(ctx.server+'/functions/v1/tsi-role-tools/'+route,{method:'POST',headers:{apikey:ctx.publicKey,Authorization:'Bearer '+ctx.getAuth().access,'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',referrerPolicy:'no-referrer',signal:root.AbortSignal&&root.AbortSignal.timeout?root.AbortSignal.timeout(15000):undefined});
   var result=await response.json();if(!current())throw Error('La cuenta cambió. Abre de nuevo esta opción.');
   if(!response.ok){var error=new Error(result.error||'No se pudo confirmar la configuración.');error.status=response.status;error.code=result.code;throw error;}return result;
  }
  function preview(page){
   var S=ctx.state,logo=ctx.logo,home=S.homepageImage,photos=(S.photos||[]).filter(function(p){return /^data:image\/(jpeg|png|webp);base64,/.test(p)||/^brand\//.test(p);}),esc=ctx.esc;
   var nav='<nav class="ui230-public-nav">'+[['inicio','Inicio'],['portafolio','Portafolio'],['proceso','Cómo trabajamos'],['privacidad','Privacidad']].map(function(row){return '<button type="button" data-ui230-page="'+row[0]+'"'+(page===row[0]?' aria-current="page"':'')+'>'+row[1]+'</button>';}).join('')+'</nav>';
   var content='';
   if(page==='proceso')content='<h1>Cómo trabajamos</h1><ol class="ui230-process">'+[['Cuéntanos tu partido','Equipo, fecha, lugar y lo que necesitas.'],['Confirmamos contigo','Revisamos disponibilidad y acordamos el alcance.'],['Capturamos y editamos','Realizamos la cobertura y preparamos el material.'],['Recibes tu material','Te compartimos la entrega acordada.']].map(function(row,i){return '<li><span>0'+(i+1)+'</span><div><h2>'+row[0]+'</h2><p>'+row[1]+'</p></div></li>';}).join('')+'</ol>';
   else if(page==='privacidad')content=root.TSIPrivacy?root.TSIPrivacy.summaryHTML():'<h1>Privacidad</h1><p>Datrilagency@gmail.com</p>';
   else if(page==='portafolio')content='<h1>Portafolio</h1><div class="ui230-gallery">'+photos.map(function(p){return '<figure><img src="'+esc(p)+'" alt="Fotografía del portafolio público"></figure>';}).join('')+'</div>'+(photos.length?'':'<p>Estamos preparando nuestra selección de fotografías.</p>');
   else content='<section class="ui230-hero"><div><p class="ui230-eyebrow">FOTOGRAFÍA Y VIDEO DEPORTIVO</p><h1>Cada jugada,<br>un cuadro.</h1><p>Cobertura de partidos y recuerdos para tu equipo.</p><button type="button">Hablemos de tu partido</button></div><div class="ui230-hero-image"><img src="'+esc(home&&home.image||logo)+'" alt="'+esc(home&&home.title||'Tanabi Sports')+'"></div></section>';
   return '<div class="ui230-public"><header class="ui230-header"><button class="ui230-logo" data-ui230-action="home"><img src="'+esc(logo)+'" alt="Tanabi Sports"></button>'+nav+'</header><main class="ui230-public-main">'+content+'</main><footer class="ui230-public-footer">Tanabi Sports · Datrilagency@gmail.com</footer></div>';
  }
  admin=root.TSI230Admin.install({me:me,getCatalog:function(){return root.TSI230RoleCatalog;},loadConfig:function(){return request('config',{});},saveConfig:function(payload){return request('save',payload);},onChanged:function(){ensureTab();ctx.render();},publicPreviewHTML:preview});
  var originalTabs=ctx.tabs;
  function tabs(role){var entries=originalTabs(role).slice();if(role==='editora'&&!entries.some(function(row){return row[0]==='portafolio';}))entries.push(['portafolio','Imágenes de la página']);return admin.filterTabs(role,entries);}
  document.addEventListener('click',function(event){
   var el=event.target.closest&&event.target.closest('[data-tab],[data-ui230-module],[data-ti],[data-ui230-action="staffSupport"],[data-x="goNotif"],[data-x="d29ViewMatch"],[data-x="av29ToggleImages"],[data-x="av29ReloadImages"],[data-tsi230-admin]');if(!el)return;
   if(el.hasAttribute('data-tsi230-admin')){if(ctx.closeTools)ctx.closeTools();return;}
   var key=controlTool(el);
   if(me()&&key&&!canAccess(key)){event.preventDefault();event.stopImmediatePropagation();ctx.state.banner='Esta herramienta fue desactivada por Administración.';ctx.render();}
  },true);
  return {api:admin,tabs:tabs,canAccess:canAccess,controlTool:controlTool,ensureTab:ensureTab,afterRender:function(){ensureTab();admin.afterRender();},refreshStaff:function(){var u=me();return u&&['foto','editora'].includes(u.role)?admin.refresh():Promise.resolve();},request:request};
 }};
})(window);
