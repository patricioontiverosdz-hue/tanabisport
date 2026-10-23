(function(root){
 'use strict';
 function create(options){
  var M=root.TSIEditingGameModel,renderer=root.TSIEditingRenderer.create({imageBase:options.imageBase||'training/photo-game-scenes/'}),owner=null,key='',bag=[],drawVersion=0;
  var state={sceneId:'',settings:copy(M.DEFAULTS),committed:copy(M.DEFAULTS),view:'edited',imageReady:false,result:null,captured:null,undo:[],stats:{evaluations:0,best:0,solved:[]},notice:''};
  function copy(v){return Object.assign({},v);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function user(){var u=options.me();return u&&['admin','foto','editora'].includes(u.role)&&options.server==='https://tantlgswituiwkxfgmsr.supabase.co'?u:null;}
  function scene(){return M.SCENES.find(function(s){return s.id===state.sceneId;});}
  function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function dirty(){return !!state.result&&!equal(state.settings,state.captured);}
  function next(){
   if(!bag.length){bag=M.SCENES.map(function(s){return s.id;});for(var i=bag.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),v=bag[i];bag[i]=bag[j];bag[j]=v;}if(bag[bag.length-1]===state.sceneId){var first=bag[0];bag[0]=bag[bag.length-1];bag[bag.length-1]=first;}}
   state.sceneId=bag.pop();state.settings=copy(M.DEFAULTS);state.committed=copy(M.DEFAULTS);state.view='edited';state.imageReady=false;state.result=null;state.captured=null;state.undo=[];
  }
  function syncOwner(){
   var u=user(),id=u?u.id+'|'+u.role:null;if(owner===id)return;owner=id;bag=[];state.sceneId='';state.imageReady=false;state.result=null;state.captured=null;state.undo=[];state.stats={evaluations:0,best:0,solved:[]};state.notice='';drawVersion++;
   if(!u)return;key='tsi_production_tantlgswituiwkxfgmsr_editing_game_v1:'+u.id;
   try{var raw=root.localStorage.getItem(key);if(raw){var p=JSON.parse(raw);if(!p||typeof p!=='object')throw Error('Formato');state.stats={evaluations:Number.isSafeInteger(p.evaluations)&&p.evaluations>=0?Math.min(p.evaluations,1000000):0,best:Number.isFinite(p.best)?Math.max(0,Math.min(100,Math.round(p.best))):0,solved:Array.isArray(p.solved)?Array.from(new Set(p.solved.filter(function(id){return M.SCENES.some(function(s){return s.id===id;});}))):[]};}}
   catch(e){state.notice='No se pudo recuperar el progreso de este navegador. Puedes seguir editando.';}next();
  }
  function save(){try{root.localStorage.setItem(key,JSON.stringify(state.stats));}catch(e){state.notice='Puedes seguir editando; el navegador no permitió guardar el progreso.';}}
  function commit(){if(!equal(state.committed,state.settings)){state.undo.push(copy(state.committed));if(state.undo.length>30)state.undo.shift();state.committed=copy(state.settings);}}
  function redraw(focus){options.render();if(focus){var el=root.document.getElementById(focus)||root.document.querySelector('[data-eg-action="'+focus+'"]');if(el)el.focus({preventScroll:true});}}
  function button(action,label,extra,disabled){return '<button type="button" class="eg-button '+(extra||'')+'" data-eg-action="'+action+'"'+(disabled?' disabled':'')+'>'+label+'</button>';}
  function format(k,n){return (n>0?'+':'')+(k==='exposure'?Number(n).toFixed(1):n);}
  function control(c){return '<div class="eg-control"><div><label for="eg-'+c.key+'">'+esc(c.label)+'</label><output id="eg-value-'+c.key+'" for="eg-'+c.key+'">'+format(c.key,state.settings[c.key])+'</output></div><input id="eg-'+c.key+'" data-eg-setting="'+c.key+'" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+state.settings[c.key]+'"></div>';}
  function panControl(k,label){return control({key:k,label:label,min:-100,max:100,step:5});}
  function render(){
   syncOwner();if(!user())return '';var s=scene(),r=state.result;
   return '<div class="eg-shell" data-scene-id="'+s.id+'"><header class="eg-intro"><div><span class="eg-kicker">TANABI LAB </span><h2>Una foto. Tu criterio.</h2><p>Encuentra el equilibrio entre luz, color y encuadre.</p><button type="button" class="gr-launch" data-tab="rankingjuegos">Ver ranking y podio →</button></div><div class="eg-progress"><div><strong>'+state.stats.solved.length+'<small>/'+M.SCENES.length+'</small></strong><span>Encargos logrados</span></div><div><strong>'+(state.stats.evaluations?state.stats.best:'—')+'</strong><span>Mejor edición</span></div><div><strong>'+state.stats.evaluations+'</strong><span>Intentos</span></div></div></header>'+
    '<div class="eg-workspace"><section class="eg-image-panel"><div class="eg-frame" aria-busy="true"><canvas class="eg-canvas" role="img" aria-label="'+esc(s.imageAlt)+'"></canvas><span class="eg-frame-label">'+(state.view==='original'?'ORIGINAL':'TU EDICIÓN')+'</span><div class="eg-loading" role="status">Cargando fotografía…</div><div class="eg-image-error" hidden><strong>No se pudo cargar la fotografía.</strong><p>Vuelve a intentarlo para continuar.</p>'+button('retry','Volver a cargar','eg-light')+'</div></div><div class="eg-comparison" role="group" aria-label="Comparar la edición"><button type="button" data-eg-action="original" aria-pressed="'+(state.view==='original')+'">Antes</button><button type="button" data-eg-action="edited" aria-pressed="'+(state.view==='edited')+'">Tu edición</button><span>Compara sin perder tus ajustes.</span></div>'+
    '<div class="eg-brief"><span class="eg-kicker">ENCARGO '+String(M.SCENES.indexOf(s)+1).padStart(2,'0')+' / '+String(M.SCENES.length).padStart(2,'0')+'</span><h3>'+esc(s.title)+'</h3><p>'+esc(s.subtitle)+'</p><div class="eg-goal"><span aria-hidden="true">◎</span><div><strong>Tu objetivo</strong><p>'+esc(s.goal)+'</p></div></div></div></section>'+
    '<aside class="eg-adjustments" aria-labelledby="eg-adjustments-title"><header><span class="eg-kicker">MESA DE EDICIÓN</span><h3 id="eg-adjustments-title">Dale tu intención.</h3><span class="eg-live">Vista en vivo</span></header>'+M.CONTROLS.map(control).join('')+'<div class="eg-crop"><label for="eg-crop">Encuadre</label><select id="eg-crop" data-eg-setting="crop">'+[['original','Completo'],['landscape','Horizontal · 3:2'],['square','Cuadrado · 1:1'],['portrait','Vertical · 4:5']].map(function(c){return '<option value="'+c[0]+'"'+(state.settings.crop===c[0]?' selected':'')+'>'+c[1]+'</option>';}).join('')+'</select>'+(state.settings.crop!=='original'?panControl('panX','Posición horizontal')+panControl('panY','Posición vertical'):'')+'</div><div class="eg-history">'+button('undo','↶ Deshacer','',!state.undo.length)+button('reset','Restablecer')+'</div>'+button('evaluate','Evaluar edición','eg-evaluate',!state.imageReady)+'<p class="eg-dirty"'+(dirty()?'':' hidden')+'>Edición modificada: vuelve a evaluar.</p></aside></div>'+
    (r?'<section class="eg-feedback" aria-labelledby="eg-feedback-title"><header class="eg-score '+(r.passed?'eg-pass':'')+'"><div><span class="eg-kicker">TU RESULTADO · PRÁCTICA</span><h3 id="eg-feedback-title">'+(r.passed?'Objetivo logrado':r.score>=65?'La edición toma forma':'Todavía hay detalle por revelar')+'</h3><p>'+(r.passed?'Tu edición cumple el objetivo del encargo.':'Compara la fotografía con el objetivo y decide tu siguiente cambio.')+'</p></div><strong>'+r.score+'<small>/100</small></strong></header><div class="eg-diagnosis">'+r.feedback.map(function(f){return '<article class="eg-finding '+(f.ok?'eg-ok':'')+'"><i aria-hidden="true"></i><div><h4>'+esc(f.title)+'</h4><p>'+esc(f.text)+'</p></div></article>';}).join('')+'</div>'+(options.ranking?options.ranking.attemptMarkup('editing',state.sceneId,state.captured):'')+'<div class="eg-feedback-actions">'+button('next','Otro encargo →','eg-next')+'</div></section>':'<div class="eg-next-row"><p>La misma fotografía admite distintas ediciones válidas.</p>'+button('next','Cambiar encargo →')+'</div>')+
    '<footer class="eg-disclaimer"><p>Simulación orientativa de edición sobre escenas creadas con IA. Los ajustes son relativos; la evaluación considera luz, color y encuadre, sin imponer un estilo único.</p><p>Tu progreso se guarda por cuenta, solo en este navegador.</p></footer>'+(state.notice?'<p class="eg-notice" role="status">'+esc(state.notice)+'</p>':'')+'</div>';
  }
  function updateLiveDOM(){
   var shell=root.document.querySelector('.eg-shell');if(!shell)return;var label=shell.querySelector('.eg-frame-label');if(label)label.textContent='TU EDICIÓN';
   for(var k of Object.keys(state.settings)){var value=root.document.getElementById('eg-value-'+k);if(value)value.textContent=format(k,state.settings[k]);}
   for(var b of shell.querySelectorAll('[data-eg-action="original"],[data-eg-action="edited"]'))b.setAttribute('aria-pressed',String(b.getAttribute('data-eg-action')===state.view));
   var pending=shell.querySelector('.eg-dirty');if(pending)pending.hidden=!dirty();
  }
  function draw(){
   if(!user())return;var canvas=root.document.querySelector('.eg-canvas');if(!canvas)return;var version=++drawVersion,frame=canvas.closest('.eg-frame'),loading=frame.querySelector('.eg-loading'),error=frame.querySelector('.eg-image-error');
   state.imageReady=false;var evaluateButton=root.document.querySelector('.eg-evaluate');if(evaluateButton)evaluateButton.disabled=true;error.hidden=true;loading.hidden=canvas.dataset.ready==='true';frame.setAttribute('aria-busy','true');
   Promise.resolve().then(function(){return renderer.draw(canvas,scene(),copy(state.settings),state.view);}).then(function(){if(!canvas.isConnected||version!==drawVersion)return;state.imageReady=true;canvas.dataset.ready='true';loading.hidden=true;error.hidden=true;frame.setAttribute('aria-busy','false');var readyButton=root.document.querySelector('.eg-evaluate');if(readyButton)readyButton.disabled=false;},function(){if(!canvas.isConnected||version!==drawVersion)return;state.imageReady=false;loading.hidden=true;error.hidden=false;frame.setAttribute('aria-busy','false');});
  }
  function readSetting(el){
   var name=el.getAttribute('data-eg-setting');if(name==='crop'){if(!M.CROPS.includes(el.value))return false;state.settings.crop=el.value;}
   else{var c=M.CONTROLS.find(function(c){return c.key===name;})||(['panX','panY'].includes(name)?{min:-100,max:100,step:5}:null),value=Number(el.value);if(!c||!Number.isFinite(value)||value<c.min||value>c.max||Math.abs((value-c.min)/c.step-Math.round((value-c.min)/c.step))>0.001)return false;state.settings[name]=value;}
   state.view='edited';return true;
  }
  function onInput(e){var el=e.target.closest('[data-eg-setting]');if(!el||!el.closest('.eg-shell'))return;syncOwner();if(!user()||!readSetting(el))return;updateLiveDOM();draw();}
  function onChange(e){var el=e.target.closest('[data-eg-setting]');if(!el||!el.closest('.eg-shell'))return;syncOwner();if(!user()||!readSetting(el))return;commit();redraw(el.id);}
  function onClick(e){
   var b=e.target.closest('[data-eg-action]');if(!b||!b.closest('.eg-shell')||b.disabled)return;syncOwner();if(!user())return;var action=b.getAttribute('data-eg-action');
   if(action==='evaluate'){if(!state.imageReady)return;commit();try{state.result=M.evaluate(scene(),state.settings);state.captured=copy(state.settings);state.stats.evaluations++;state.stats.best=Math.max(state.stats.best,state.result.score);if(state.result.passed&&!state.stats.solved.includes(state.sceneId))state.stats.solved.push(state.sceneId);save();if(options.ranking)options.ranking.submit('editing',state.sceneId,state.captured);}catch(error){state.notice='No se pudo evaluar la edición. Revisa los ajustes y vuelve a intentarlo.';}redraw();var heading=root.document.getElementById('eg-feedback-title');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
   else if(action==='undo'&&state.undo.length){state.settings=state.undo.pop();state.committed=copy(state.settings);state.view='edited';redraw('evaluate');}
   else if(action==='reset'){commit();if(!equal(state.settings,M.DEFAULTS)){state.undo.push(copy(state.settings));state.settings=copy(M.DEFAULTS);state.committed=copy(state.settings);}state.view='edited';redraw('reset');}
   else if(action==='original'||action==='edited'){state.view=action;redraw(action);}
   else if(action==='next'){next();redraw('evaluate');}
   else if(action==='retry')draw();
  }
  root.document.addEventListener('input',onInput);root.document.addEventListener('change',onChange);root.document.addEventListener('click',onClick);
  return {render:render,afterRender:draw,snapshot:function(){syncOwner();return JSON.parse(JSON.stringify(state));},destroy:function(){drawVersion++;renderer.destroy();root.document.removeEventListener('input',onInput);root.document.removeEventListener('change',onChange);root.document.removeEventListener('click',onClick);owner=null;}};
 }
 root.TSIEditingGame={create:create};
})(window);
