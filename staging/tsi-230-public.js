/* Public entry point: no employee session, payroll, training or Excel code. */
(function(root){'use strict';
 var SERVER='https://nksqpoigywfegcbvfhoa.supabase.co',PUBLIC_KEY='sb_publishable_MJmF_vGzwS43RRDFtSpHGw_K106L1NE';
 var S={view:'home',tab:'',booting:true,cfg:{shop:false,reservasPublicas:false},photos:[],portfolio:[],homepageImage:null,liveUrl:''};
 var GUEST_STATE={shop:{items:[]}},UI,PORTFOLIO,SUPPORT,GUEST=null,STORE=null,shopLoading=null,shopEpoch=0,error='',previewMotion=false;
 var modules=Object.create(null),links=Object.create(null),app=document.getElementById('app');
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function noAccount(){return null;}
 function failure(message,status){var e=new Error(message);if(status)e.status=status;return e;}
 function timeout(){return root.AbortSignal&&root.AbortSignal.timeout?root.AbortSignal.timeout(20000):undefined;}
 function guestToken(){return GUEST?GUEST.token():'';}
 function themeControl(){return '<button type="button" class="btn small public-theme" data-public-theme aria-label="Cambiar tema de la página">Tema</button>';}
 function loadStyle(href){if(links[href])return;var link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link);links[href]=true;}
 function loadScript(src){if(modules[src])return modules[src];modules[src]=new Promise(function(resolve,reject){var script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;script.onerror=function(){script.remove();delete modules[src];reject(failure('No se pudo abrir la tienda. Revisa tu conexión y vuelve a intentar.'));};document.head.appendChild(script);});return modules[src];}
 async function jsonRequest(path,method,body,token){
  var headers={apikey:PUBLIC_KEY};if(body!==undefined)headers['Content-Type']='application/json';if(token)headers['x-tsi-guest-token']=token;
  var response=await root.fetch(SERVER+path,{method:method,headers:headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',referrerPolicy:'no-referrer',signal:timeout()});
  var result;try{result=await response.json();}catch(e){throw failure('No se pudo confirmar la respuesta. Intenta nuevamente.',response.status);}
  if(!response.ok){var err=failure(result&&(result.message||result.error)||'No se pudo completar la solicitud.',response.status);err.body=result;throw err;}return result;
 }
 async function guestRequest(body,token){
  var action=body&&body.action,held=guestToken(),publicRead=action==='portfolio/list'||action==='portfolio/image',logout=action==='logout';
  if(!publicRead&&!['config','request','verify','status','list','preview','original','validate','logout'].includes(action))throw failure('Esta opción pertenece al equipo.',403);
  if(token&&(!/^[a-f0-9]{64}$/.test(token)||!logout&&token!==held))throw failure('El permiso cambió. Abre de nuevo la tienda.',403);
  var result=await jsonRequest('/functions/v1/tsi-guest-access','POST',body,token);
  if(!publicRead&&!logout&&held!==guestToken())throw failure('El permiso cambió. Abre de nuevo la tienda.',403);return result;
 }
 async function storeRequest(method,path,payload){
  var held=guestToken();if(!held)throw failure('Solicita acceso a tu carpeta para continuar.',403);
  if(!['catalog','config','quote','create-session','status','lookup','manual-order','download-photo'].includes(path))throw failure('Solicitud no disponible.',403);
  try{var result=await jsonRequest('/functions/v1/tsi-store-checkout/'+path,method,payload,held);if(held!==guestToken())throw failure('El permiso cambió. Abre de nuevo la tienda.',403);return result;}
  catch(e){if(e.status===401||e.status===403){if(held===guestToken())GUEST.clear();}throw e;}
 }
 function preview(item){
  var reduced=root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var img=item.img?'<img loading="lazy" draggable="false" class="s224-image'+(previewMotion?' s224-scan':'')+'" src="'+esc(item.img)+'" alt="Vista previa de '+esc(item.title)+'">':'';
  var blur=previewMotion&&item.img?'<img loading="lazy" draggable="false" class="s224-blurred" src="'+esc(item.img)+'" alt="" aria-hidden="true">':'';
  return '<div class="s224-photo"><div class="tile shop-preview s224-preview'+(previewMotion?' s224-motion':'')+(reduced?' s224-paused':' s224-user-motion')+(!item.img?' t1':'')+'">'+blur+img+'<span class="shop-title">'+esc(item.title)+'</span></div></div>';
 }
 async function loadPreviewOptions(){var held=guestToken();try{var rows=await jsonRequest('/rest/v1/tsi224_shop_preview?id=eq.shop&select=motion','GET');if(held&&held===guestToken())previewMotion=!!(rows&&rows[0]&&rows[0].motion);}catch(ignore){previewMotion=false;}}
 async function loadShop(){if(!GUEST||!GUEST.authorized())return [];var held=guestToken(),items=await GUEST.loadShop();await loadPreviewOptions();if(held!==guestToken())throw failure('El permiso cambió.',403);return items;}
 async function ensureShop(){
  if(STORE&&GUEST)return;if(shopLoading)return shopLoading;
  loadStyle('../assets/tsi-store.css?v=230-public');loadStyle('../assets/tsi-shop-preview.css?v=230-public');loadStyle('tsi-230-guest.css?v=230-public');
  shopLoading=Promise.all([loadScript('tsi-230-guest.js?v=230-public'),loadScript('tsi-230-store.js?v=230-public')]).then(function(){
   GUEST=root.TSI230Guest.install({state:GUEST_STATE,me:noAccount,server:SERVER,publicKey:PUBLIC_KEY,edge:guestRequest,render:render,onAuthorized:async function(destination){
    await loadShop();if(destination&&destination.next==='shop')S.view='shop';await STORE.publicLoad(true);render();
   },onCleared:function(){shopEpoch++;GUEST_STATE.shop.items=[];previewMotion=false;if(STORE)STORE.clearGuest();render();}});
   STORE=root.TSIStore224Install({state:S,me:noAccount,esc:esc,server:SERVER,topbar:function(){return UI.topbar();},render:render,photoItems:function(){return GUEST_STATE.shop.items;},photoPreview:preview,loadShop:loadShop,edge:storeRequest,manualPhotoOrder:function(payload){return storeRequest('POST','manual-order',payload);},sb:function(){return Promise.reject(failure('Esta opción pertenece al equipo.',403));}});
  }).catch(function(e){shopLoading=null;throw e;});return shopLoading;
 }
 function shopGate(){return UI.topbar()+'<section class="card ui230-guest-gate"><h1>Tu carpeta, con acceso autorizado.</h1><p>Ingresa con la invitación individual y el correo que Administración aprobó para consultar tus fotografías.</p><button type="button" class="btn primary" data-public-enter-shop>Entrar como invitado</button><button type="button" class="btn" data-act="goHome">Volver a Inicio</button></section>';}
 function render(){
  if(!UI)return;if(STORE)STORE.beforeRender();
  app.innerHTML=S.booting?UI.loader():(error?'<p class="err public-error" role="alert">'+esc(error)+' <button type="button" class="btn small" data-public-retry>Reintentar</button></p>':'')+(S.view==='shop'?(STORE&&GUEST&&GUEST.authorized()?STORE.viewShop():shopGate()):UI.home());
  app.setAttribute('aria-busy',String(S.booting));UI.afterRender();SUPPORT.afterRender();PORTFOLIO.afterRender();if(GUEST)GUEST.afterRender();if(STORE)STORE.afterRender();
 }
 async function goShop(){
  if(!S.cfg.shop)return;var epoch=++shopEpoch;S.view='shop';error='';render();
  try{await ensureShop();if(epoch!==shopEpoch||S.view!=='shop')return;render();if(!await GUEST.ensureAccess({next:'shop'}))return;await loadShop();await STORE.publicLoad(true);render();}
  catch(e){if(epoch===shopEpoch){error=e.message;render();}}
 }
 function goHome(){shopEpoch++;S.view='home';error='';render();}
 function team(){var url=new URL('equipo.html',root.location.href);root.location.assign(url.href);}
 async function boot(){
  error='';try{var rows=await jsonRequest('/rest/v1/settings?id=in.(cfg,live)&select=id,data','GET'),row=Array.isArray(rows)&&rows.find(function(r){return r.id==='cfg';});if(!row||!row.data)throw failure('La página está disponible; no pudimos confirmar si la tienda está abierta.');S.cfg={shop:row.data.shop===true,reservasPublicas:row.data.reservasPublicas===true};S.liveUrl='';var live=rows.find(function(r){return r.id==='live';});try{var address=new URL(live&&live.data&&live.data.url||'');if(address.protocol==='https:'&&!address.username&&!address.password)S.liveUrl=address.href;}catch(ignore){}}
  catch(e){S.cfg={shop:false,reservasPublicas:false};S.liveUrl='';error='No se pudieron actualizar las opciones de la página. Puedes escribirnos en TABI.';}
  S.booting=false;render();if(new URL(root.location.href).searchParams.has('store_return'))goShop();
 }
 document.addEventListener('click',function(e){var button=e.target.closest('[data-act],[data-x],[data-public-enter-shop],[data-public-theme],[data-public-retry]');if(!button)return;
  var action=button.getAttribute('data-act')||button.getAttribute('data-x');if(action==='goLogin'||action==='goDash'){e.preventDefault();team();}if(action==='goHome'){e.preventDefault();goHome();}if(action==='goShop'||button.hasAttribute('data-public-enter-shop')){e.preventDefault();goShop();}if(action==='goReserve'){e.preventDefault();SUPPORT.open();}
  if(button.hasAttribute('data-public-theme')){var current=document.documentElement.getAttribute('data-theme'),dark=current?current==='dark':root.matchMedia&&root.matchMedia('(prefers-color-scheme:dark)').matches;var next=dark?'light':'dark';document.documentElement.setAttribute('data-theme',next);try{root.localStorage.setItem('tsi-ui-theme-v1',next);}catch(ignore){}}
  if(button.hasAttribute('data-public-retry'))boot();
 });
 UI=root.TSI230UI.install({state:S,me:noAccount,esc:esc,logo:'brand/tanabi-logo.png',version:'2.3.0',tabs:function(){return [];},themeControl:themeControl,render:render});
 SUPPORT=root.TSI230Support.install({state:S,me:noAccount,backendURL:SERVER,publicKey:PUBLIC_KEY,sb:function(){return Promise.reject(failure('Esta opción pertenece al equipo.',403));}});
 PORTFOLIO=root.TSI230Portfolio.install({state:S,me:noAccount,edge:guestRequest,render:render});
 root.TSI230Public=Object.freeze({goShop:goShop,goHome:goHome,ready:boot(),diagnostics:function(){return {view:S.view,booting:S.booting,shopEnabled:S.cfg.shop,storeLoaded:!!STORE,guestLoaded:!!GUEST,authorized:!!GUEST&&GUEST.authorized(),publicPhotos:S.photos.length,homepageSelected:!!S.homepageImage,error:error};}});
 render();
})(window);
