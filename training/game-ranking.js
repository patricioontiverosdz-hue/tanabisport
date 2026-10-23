(function(root){
 'use strict';
 var PRODUCTION='https://tantlgswituiwkxfgmsr.supabase.co',FILTERS=[['all','General'],['camera','Cámara'],['editing','Edición']];
 function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function clone(value){return JSON.parse(JSON.stringify(value));}
 function create(options){
  var owner=null,revision=0,destroyed=false,submissions={},state={filter:'all',phase:'idle',entries:[],updatedAt:null};
  function user(){var u=options.me();return !destroyed&&options.server===PRODUCTION&&u&&u.id&&['admin','foto','editora'].includes(u.role)?u:null;}
  function syncOwner(){var u=user(),id=u?u.id+'|'+u.role:null;if(id===owner)return;owner=id;revision++;state={filter:'all',phase:'idle',entries:[],updatedAt:null};submissions={};}
  function redraw(){if(!destroyed&&typeof options.render==='function')options.render();}
  function request(method,path,body){var u=user();if(!u||typeof options.request!=='function')return Promise.reject(Error('No disponible'));var expected=u.id;return Promise.resolve().then(function(){var current=user();if(!current||current.id!==expected)throw Error('La cuenta cambió');return options.request(method,path,body,{expectedUserId:expected});});}
  function validEntries(value){
   if(!Array.isArray(value))throw Error('Respuesta incompleta');
   return value.map(function(entry){
    if(!entry||!entry.user_id||!Number.isFinite(Number(entry.rank))||Number(entry.rank)<1||!Number.isFinite(Number(entry.total_score))||Number(entry.total_score)<0)throw Error('Clasificación incompleta');
    return {user_id:String(entry.user_id),name:String(entry.name||'Participante'),rank:Math.floor(Number(entry.rank)),total_score:Number(entry.total_score),challenges:Math.max(0,Math.floor(Number(entry.challenges)||0))};
   }).sort(function(a,b){return a.rank-b.rank||a.name.localeCompare(b.name,'es');});
  }
  async function load(){
   syncOwner();if(!user()||state.phase==='loading')return;var token=++revision,currentOwner=owner,filter=state.filter;state.phase='loading';state.entries=[];
   try{
    var response=await request('POST','/rest/v1/rpc/tsi_game_rankings',{p_game:filter});
    syncOwner();
    if(destroyed||token!==revision||currentOwner!==owner)return;
    state.entries=validEntries(response.entries);state.phase='ready';state.updatedAt=response.server_now||null;
   }catch(error){if(destroyed||token!==revision||currentOwner!==owner)return;state.entries=[];state.phase='error';}
   redraw();
  }
  function settingsFor(game,settings){
   var keys=game==='camera'?['shutter','aperture','iso']:['exposure','temperature','highlights','shadows','contrast','saturation','crop','panX','panY'],result={};
   for(var key of keys){if(game==='editing'&&key==='crop'){if(!['original','landscape','square','portrait'].includes(settings[key]))throw Error('Encuadre inválido');result[key]=settings[key];}else{if(!Number.isFinite(settings[key]))throw Error('Ajustes inválidos');result[key]=settings[key];}}
   return result;
  }
  function identity(sceneId,settings){return JSON.stringify([sceneId,settings]);}
  function notifyAttempt(){
   if(root.document.querySelector('.gr-shell')){redraw();return;}
   for(var game of ['camera','editing']){var record=submissions[game],element=root.document.querySelector('.gr-attempt[data-gr-game="'+game+'"]');if(record&&element)element.outerHTML=attemptMarkup(game,record.sceneId,record.settings);}
  }
  async function submit(game,sceneId,settings){
   syncOwner();if(!user()||!['camera','editing'].includes(game))return null;
   var clean;try{clean=settingsFor(game,settings);}catch(error){return null;}
   if(typeof sceneId!=='string'||!sceneId)return null;
   var currentOwner=owner,record={status:'sending',sceneId:sceneId,settings:clean,key:identity(sceneId,clean)};submissions[game]=record;
   try{
    var response=await request('POST','/functions/v1/training-game',{game:game,sceneId:sceneId,settings:clean});
    syncOwner();if(destroyed||owner!==currentOwner||submissions[game]!==record)return null;
    if(!response||response.accepted!==true)throw Error('Intento sin confirmar');
    record.status='saved';revision++;state.phase='idle';state.entries=[];
    notifyAttempt();return response;
   }catch(error){syncOwner();if(destroyed||owner!==currentOwner||submissions[game]!==record)return null;record.status='error';notifyAttempt();return null;}
  }
  function attemptMarkup(game,sceneId,settings){
   syncOwner();if(!user()||!settings)return '';var record=submissions[game],key;
   try{key=identity(sceneId,settingsFor(game,settings));}catch(error){return '';}
   if(!record||record.key!==key)return '';
   var message=record.status==='saved'?'Intento confirmado en el ranking. Solo cuenta tu mejor resultado por reto.':record.status==='sending'?'Tu puntuación es de práctica. Enviando el intento al ranking…':'Tu puntuación de práctica está lista. No se pudo confirmar el intento en el ranking.';
   return '<div class="gr-attempt gr-attempt-'+record.status+'" data-gr-game="'+game+'" role="status"><span>'+message+'</span>'+(record.status==='error'?'<button type="button" data-gr-action="resubmit" data-gr-game="'+game+'">Reintentar envío</button>':'')+'</div>';
  }
  function avatar(entry){var letters=entry.name.trim().split(/\s+/).slice(0,2).map(function(part){return part.charAt(0);}).join('').toUpperCase();return '<span class="gr-avatar" aria-hidden="true">'+esc(letters||'T')+'</span>';}
  function card(entry,meId){return '<article class="gr-podium-card gr-place-'+entry.rank+(entry.user_id===meId?' gr-self':'')+'" data-gr-user="'+esc(entry.user_id)+'"><span class="gr-medal" aria-label="Puesto '+entry.rank+'">'+entry.rank+'</span>'+avatar(entry)+'<h3>'+esc(entry.name)+(entry.user_id===meId?' <small>Tú</small>':'')+'</h3><strong>'+entry.total_score.toLocaleString('es-MX')+'<small>puntos</small></strong><p>'+entry.challenges+' retos con resultado</p></article>';}
  function row(entry,meId){return '<li class="gr-row'+(entry.user_id===meId?' gr-self':'')+'" data-gr-user="'+esc(entry.user_id)+'"><span class="gr-row-rank">'+entry.rank+'</span>'+avatar(entry)+'<div class="gr-row-name"><strong>'+esc(entry.name)+(entry.user_id===meId?' <small>Tú</small>':'')+'</strong><span>'+entry.challenges+' retos con resultado</span></div><strong class="gr-row-score">'+entry.total_score.toLocaleString('es-MX')+'<small>pts</small></strong></li>';}
  function render(){
   syncOwner();var u=user();if(!u)return '';var podium=state.entries.filter(function(entry){return entry.rank<=3;}),rest=state.entries.filter(function(entry){return entry.rank>3;}),mine=state.entries.find(function(entry){return entry.user_id===u.id;});
   var body=state.phase==='error'?'<div class="gr-message gr-error" role="alert"><h3>No pudimos cargar el podio.</h3><p>Tu práctica sigue disponible. Inténtalo de nuevo en un momento.</p><button type="button" data-gr-action="reload">Reintentar</button></div>':state.phase==='idle'||state.phase==='loading'?'<div class="gr-message gr-loading" role="status"><span class="gr-spinner" aria-hidden="true"></span><h3>Cargando resultados…</h3><p>Consultando las mejores marcas del equipo.</p></div>':!state.entries.length?'<div class="gr-message gr-empty"><span aria-hidden="true">◎</span><h3>El podio espera la primera marca.</h3><p>Completa un reto de cámara o edición para empezar a participar.</p><div class="gr-game-links"><button type="button" data-tab="fotojuego">Ir a cámara</button><button type="button" data-tab="edicionjuego">Ir a edición</button></div></div>':'<section class="gr-podium" aria-label="Podio de los tres primeros puestos">'+podium.map(function(entry){return card(entry,u.id);}).join('')+'</section>'+(rest.length?'<section class="gr-standings" aria-labelledby="gr-standing-title"><h3 id="gr-standing-title">La clasificación</h3><ol aria-label="Participantes después del podio">'+rest.map(function(entry){return row(entry,u.id);}).join('')+'</ol></section>':'');
   return '<div class="gr-shell"><header class="gr-intro"><div><span class="gr-kicker">TANABI LAB · EQUIPO</span><h2>El ojo se entrena.<br>La marca se comparte.</h2><p>Un podio para cada avance en cámara y edición.</p></div><span class="gr-trophy" aria-hidden="true"><svg viewBox="0 0 100 100" width="104" height="104" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M31 17h38v23c0 14-8 23-19 23S31 54 31 40V17Z" fill="currentColor" fill-opacity=".12"/><path d="M31 25H18v12c0 11 9 18 18 18m33-30h13v12c0 11-9 18-18 18M50 63v18M35 84h30M30 90h40"/><path d="m50 29 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-7Z" fill="currentColor" stroke-width="2"/></svg></span></header><div class="gr-toolbar"><nav class="gr-filters" aria-label="Clasificación por juego">'+FILTERS.map(function(filter){return '<button type="button" data-gr-action="filter" data-gr-filter="'+filter[0]+'" aria-pressed="'+(state.filter===filter[0])+'">'+filter[1]+'</button>';}).join('')+'</nav><button type="button" class="gr-refresh" data-gr-action="reload"'+(state.phase==='loading'?' disabled':'')+'>Actualizar</button></div>'+(state.phase==='ready'&&mine?'<p class="gr-your-place">Tu puesto <strong>'+mine.rank+'</strong> · <strong>'+mine.total_score.toLocaleString('es-MX')+' puntos</strong></p>':'')+body+'<footer class="gr-rules"><strong>Cada reto cuenta una vez.</strong><p>Se suma tu mejor puntuación de cada reto. Repetir puede mejorar tu marca; acumular intentos no añade puntos. Las puntuaciones iguales comparten puesto.</p><p>El podio muestra resultados confirmados. Tu progreso de práctica guardado en el navegador se mantiene por separado.</p></footer></div>';
  }
  function afterRender(){syncOwner();if(user()&&state.phase==='idle')load();}
  function onClick(event){
   var button=event.target.closest('[data-gr-action]');if(!button||button.disabled)return;syncOwner();if(!user())return;
   var action=button.getAttribute('data-gr-action');
   if(action==='resubmit'){var game=button.getAttribute('data-gr-game'),record=submissions[game];if(record&&record.status==='error'){submit(game,record.sceneId,record.settings);notifyAttempt();}return;}
   if(!button.closest('.gr-shell'))return;
   if(action==='filter'){var filter=button.getAttribute('data-gr-filter');if(!FILTERS.some(function(item){return item[0]===filter;})||filter===state.filter)return;revision++;state.filter=filter;state.phase='idle';state.entries=[];redraw();}
   else if(action==='reload'){revision++;state.phase='idle';state.entries=[];redraw();}
  }
  root.document.addEventListener('click',onClick);
  return {render:render,afterRender:afterRender,submit:submit,attemptMarkup:attemptMarkup,snapshot:function(){syncOwner();return clone({owner:owner,state:state,submissions:submissions});},destroy:function(){destroyed=true;revision++;submissions={};state.entries=[];root.document.removeEventListener('click',onClick);}};
 }
 root.TSIGameRanking={create:create};
})(window);
