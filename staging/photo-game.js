(function(root){
 'use strict';
 function create(options){
  var M=root.TSIPhotoGameModel,allowed=['admin','foto','editora'],owner=null,storageKey='',queue=[];
  var state={sceneId:'',settings:{shutter:250,aperture:5.6,iso:400},result:null,captured:null,compare:false,stats:{shots:0,best:0,solved:[]},notice:''};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function user(){var u=options.me();return u&&allowed.includes(u.role)&&options.server==='https://nksqpoigywfegcbvfhoa.supabase.co'?u:null;}
  function scene(){return M.SCENES.find(function(s){return s.id===state.sceneId;});}
  function freshStats(){return {shots:0,best:0,solved:[]};}
  function nextScene(){
   if(!queue.length){queue=M.SCENES.map(function(s){return s.id;});for(var i=queue.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),tmp=queue[i];queue[i]=queue[j];queue[j]=tmp;}if(queue[queue.length-1]===state.sceneId){var first=queue[0];queue[0]=queue[queue.length-1];queue[queue.length-1]=first;}}
   state.sceneId=queue.pop();state.settings={shutter:250,aperture:5.6,iso:400};state.result=null;state.captured=null;state.compare=false;
  }
  function syncOwner(){
   var u=user(),id=u?u.id+'|'+u.role:null;if(owner===id)return;
   owner=id;queue=[];state.stats=freshStats();state.notice='';state.sceneId='';state.result=null;state.captured=null;state.compare=false;
   if(!u)return;
   storageKey='tsi_staging_nksqpoigywfegcbvfhoa_photo_game_v1:'+u.id;
   try{var raw=root.localStorage.getItem(storageKey);if(raw){var saved=JSON.parse(raw);if(!saved||typeof saved!=='object')throw Error('Formato');state.stats={shots:Number.isSafeInteger(saved.shots)&&saved.shots>=0?Math.min(saved.shots,1000000):0,best:Number.isFinite(saved.best)?Math.max(0,Math.min(100,Math.round(saved.best))):0,solved:Array.isArray(saved.solved)?Array.from(new Set(saved.solved.filter(function(id){return M.SCENES.some(function(s){return s.id===id;});}))):[]};}}
   catch(e){state.notice='No se pudo recuperar el progreso de este dispositivo. Puedes seguir jugando.';}
   nextScene();
  }
  function save(){try{root.localStorage.setItem(storageKey,JSON.stringify(state.stats));}catch(e){state.notice='Puedes seguir jugando; este navegador no permitió guardar el progreso.';}}
  function redraw(focus){options.render();if(focus){var el=root.document.getElementById(focus)||root.document.querySelector('[data-pg-action="'+focus+'"]');if(el)el.focus({preventScroll:true});}}
  function icon(name){var paths={camera:'<path d="M8 5l2-2h4l2 2h4v14H4V5z"/><circle cx="12" cy="12" r="4"/>',arrow:'<path d="M4 12h16m-6-6l6 6-6 6"/>',check:'<path d="M5 12l4 4L19 6"/>',target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',light:'<path d="M9 18h6m-5 3h4M8 13a6 6 0 118 0c-1 1-1 2-1 3H9c0-1 0-2-1-3z"/>'};return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.camera)+'</svg>';}
  function button(action,text,extra){return '<button type="button" class="pg-button '+(extra||'')+'" data-pg-action="'+action+'">'+text+'</button>';}
  function setting(name,label,values,format){return '<div class="pg-setting"><label for="pg-'+name+'">'+label+'</label><select id="pg-'+name+'" data-pg-setting="'+name+'">'+values.map(function(v){return '<option value="'+v+'"'+(v===state.settings[name]?' selected':'')+'>'+format(v)+'</option>';}).join('')+'</select></div>';}
  function settingsText(v){return '1/'+v.shutter+' s · f/'+v.aperture+' · ISO '+v.iso;}
  function render(){
   syncOwner();if(!user())return '';
   var s=scene(),r=state.result,display=!!r&&!state.compare;
   var changed=r&&settingsText(state.captured)!==settingsText(state.settings);
   var filter=display?'brightness('+r.brightness+') blur('+(r.motionBlur*3).toFixed(2)+'px)':'none';
   var feedback=r?'<section class="pg-feedback" aria-labelledby="pg-feedback-title"><div class="pg-score '+(r.passed?'pg-pass':'')+'"><div><span class="pg-kicker">TU DISPARO · PRÁCTICA</span><h3 id="pg-feedback-title">'+(r.passed?'Objetivo logrado':r.score>=65?'Vas por buen camino':'Hay una mejor toma')+'</h3><p>'+ (r.passed?'La fotografía cumple el objetivo del reto.':'Compara tu resultado con el objetivo e inténtalo de nuevo.')+'</p></div><strong>'+r.score+'<small>/100</small></strong></div><div class="pg-diagnosis">'+r.feedback.map(function(f){return '<article class="pg-finding '+(f.ok?'pg-ok':'pg-review')+'"><span class="pg-finding-dot" aria-hidden="true"></span><div><h4>'+esc(f.title)+'</h4><p>'+esc(f.text)+'</p></div></article>';}).join('')+'</div>'+(options.ranking?options.ranking.attemptMarkup('camera',state.sceneId,state.captured):'')+'<div class="pg-feedback-actions">'+button('next','Otra escena '+icon('arrow'),'pg-next')+'</div></section>':'';
   return '<div class="pg-shell" data-scene-id="'+s.id+'"><header class="pg-intro"><div><span class="pg-kicker">TANABI LAB <span class="pg-trial">EN PRUEBA</span></span><h2>La luz se entrena.</h2><p>Lee la escena. Ajusta tu cámara. Haz el disparo.</p><button type="button" class="gr-launch" data-tab="rankingjuegos">Ver ranking y podio →</button></div><div class="pg-progress"><div><strong>'+state.stats.solved.length+'<small>/'+M.SCENES.length+'</small></strong><span>Escenas logradas</span></div><div><strong>'+(state.stats.shots?state.stats.best:'—')+'</strong><span>Mejor toma</span></div><div><strong>'+state.stats.shots+'</strong><span>Disparos</span></div></div></header>'+
    '<div class="pg-workspace"><section class="pg-scene"><figure class="pg-viewfinder"><img class="pg-photo" src="'+esc((options.imageBase||'photo-game-scenes/')+s.asset)+'" alt="'+esc(s.imageAlt)+'" style="filter:'+filter+'" draggable="false"><canvas class="pg-noise" width="384" height="256" aria-hidden="true" style="opacity:'+(display?r.noise*.3:0)+'"></canvas><div class="pg-image-error" hidden><strong>No se pudo cargar la escena.</strong><p>Recarga la página para volver a intentarlo.</p></div><div class="pg-camera-top"><span><i aria-hidden="true"></i> '+(display?'TU FOTO':'REFERENCIA')+'</span><span>M · Cámara virtual</span></div><span class="pg-focus" aria-hidden="true"></span><figcaption class="pg-camera-bottom"><span>'+esc(s.lighting)+'</span><strong>'+(r?settingsText(state.captured):'Observa la luz y el movimiento')+'</strong></figcaption></figure>'+
    (r?'<div class="pg-compare" role="group" aria-label="Comparar fotografías"><button type="button" data-pg-action="result" aria-pressed="'+(!state.compare)+'">Tu foto</button><button type="button" data-pg-action="reference" aria-pressed="'+state.compare+'">Referencia</button><span>'+ (changed?'Ajustes modificados: dispara de nuevo.':'Compara el resultado con la referencia.')+'</span></div>':'<p class="pg-before">Esta es la escena de referencia. Configura la cámara para conseguirla.</p>')+
    '<div class="pg-brief"><span class="pg-round">RETO '+String(M.SCENES.indexOf(s)+1).padStart(2,'0')+' / '+String(M.SCENES.length).padStart(2,'0')+'</span><h3>'+esc(s.title)+'</h3><p>'+esc(s.subtitle)+'</p><div class="pg-goal">'+icon('target')+'<div><strong>Tu objetivo</strong><p>'+esc(s.goal)+'</p></div></div></div></section>'+
    '<aside class="pg-camera" aria-labelledby="pg-camera-title"><div class="pg-panel-title"><span class="pg-kicker">MODO MANUAL</span><h3 id="pg-camera-title">Tú tienes el control.</h3></div>'+setting('shutter','Velocidad',M.SHUTTERS,function(n){return '1/'+n+' s';})+setting('aperture','Apertura',M.APERTURES,function(n){return 'f/'+n;})+setting('iso','ISO',M.ISOS,function(n){return String(n);})+
    button('shoot',icon('camera')+' '+(r?'Volver a disparar':'Tomar foto'),'pg-shutter')+'<div class="pg-camera-footer"><span>Otra luz, otro reto.</span>'+button('next','Cambiar escena '+icon('arrow'),'pg-text-button')+'</div></aside></div>'+feedback+
    '<footer class="pg-disclaimer"><p>Escenas creadas con IA. La vista simula exposición, movimiento y ruido; la profundidad de campo se evalúa en el diagnóstico. El resultado es orientativo.</p><p>Tu progreso se guarda por cuenta, solo en este navegador.</p></footer>'+(state.notice?'<p class="pg-storage-notice" role="status">'+esc(state.notice)+'</p>':'')+'</div>';
  }
  function afterRender(){
   if(!user())return;var img=root.document.querySelector('.pg-photo');if(!img)return;
   img.addEventListener('error',function(){var error=root.document.querySelector('.pg-image-error');if(error)error.hidden=false;});
   if(img.complete&&!img.naturalWidth){var err=root.document.querySelector('.pg-image-error');if(err)err.hidden=false;}
   var canvas=root.document.querySelector('.pg-noise');if(!canvas||!state.result||state.compare||!state.result.noise)return;
   try{var ctx=canvas.getContext('2d');if(!ctx)return;var pixels=ctx.createImageData(canvas.width,canvas.height),seed=7919+state.stats.shots*131;for(var i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;var n=seed>>>24;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=n;pixels.data[i+3]=n>127?160:100;}ctx.putImageData(pixels,0,0);}catch(e){}
  }
  function onChange(event){
   var input=event.target.closest('[data-pg-setting]');if(!input||!input.closest('.pg-shell'))return;syncOwner();if(!user())return;
   var name=input.getAttribute('data-pg-setting'),value=Number(input.value),choices={shutter:M.SHUTTERS,aperture:M.APERTURES,iso:M.ISOS};if(!choices[name]||!choices[name].includes(value))return;
   state.settings[name]=value;redraw(input.id);
  }
  function onClick(event){
   var b=event.target.closest('[data-pg-action]');if(!b||!b.closest('.pg-shell'))return;syncOwner();if(!user())return;
   var action=b.getAttribute('data-pg-action');
   if(action==='shoot'){state.result=M.evaluate(scene(),state.settings);state.captured=Object.assign({},state.settings);state.compare=false;state.stats.shots++;state.stats.best=Math.max(state.stats.best,state.result.score);if(state.result.passed&&!state.stats.solved.includes(state.sceneId))state.stats.solved.push(state.sceneId);save();if(options.ranking)options.ranking.submit('camera',state.sceneId,state.captured);redraw();var panel=root.document.getElementById('pg-feedback-title');if(panel){panel.setAttribute('tabindex','-1');panel.focus({preventScroll:true});}}
   else if(action==='next'){nextScene();redraw('shoot');}
   else if(action==='reference'&&state.result){state.compare=true;redraw('reference');}
   else if(action==='result'&&state.result){state.compare=false;redraw('result');}
  }
  root.document.addEventListener('click',onClick);root.document.addEventListener('change',onChange);
  return {render:render,afterRender:afterRender,snapshot:function(){syncOwner();return JSON.parse(JSON.stringify(state));},destroy:function(){root.document.removeEventListener('click',onClick);root.document.removeEventListener('change',onChange);owner=null;}};
 }
 root.TSIPhotoGame={create:create};
})(window);
