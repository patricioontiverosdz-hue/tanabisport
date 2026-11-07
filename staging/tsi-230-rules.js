(function(root){'use strict';
root.TSI230Rules={install:function(ctx){
 var state=null,owner='',loading=false,error='',loadedAt=0,revision=0,lastTimer='',lastAvailability='';
 function key(){var u=ctx.me();return u?u.id+':'+u.role:'';}
 function reset(){owner=key();state=null;error='';loadedAt=0;loading=false;revision++;lastTimer='';lastAvailability='';}
 async function load(force){
  if(!key())return;if(owner!==key())reset();if(loading||!force&&Date.now()-loadedAt<20000)return;
  var expected=owner,request=++revision;loading=true;
  try{var next=await ctx.sb('POST','/rest/v1/rpc/tsi230_rules_state',{});if(expected!==key()||request!==revision)return;
   if(!next||!Array.isArray(next.availability)||!Array.isArray(next.clock)||!Array.isArray(next.suspensions))throw Error('No se pudieron verificar los permisos de cobertura y cronómetro.');
   state=next;error='';
  }catch(e){if(expected===key()&&request===revision){state=null;error=e.message||'No se pudieron verificar disponibilidad y cronómetro.';}}
  finally{if(expected===key()&&request===revision){loadedAt=Date.now();loading=false;ctx.render();}}
 }
 function monday(day){var d=new Date(day+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return '';d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
 function canTake(match,user){
  if(!match||!user||user.role!=='foto'||!state)return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(match.date||'')||!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(match.time||''))return false;
  if(state.suspensions.some(function(s){return s.user_id===user.id&&s.start_date<=match.date&&s.end_date>=match.date;}))return false;
  var rows=state.availability.filter(function(r){return r.photographer_id===user.id&&r.week_start===monday(match.date);}).sort(function(a,b){return Number(b.version)-Number(a.version);});
  if(!rows.length||!Array.isArray(rows[0].schedule))return false;
  var index=(new Date(match.date+'T12:00:00Z').getUTCDay()+6)%7,entry=rows[0].schedule[index],time=String(match.time).slice(0,5);
  return !!(entry&&entry.available===true&&/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.start||'')&&/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.end||'')&&time>=entry.start&&time<entry.end);
 }
 function clocked(userId,matchId){return !!state&&state.clock.some(function(row){return row.editor_id===userId&&String(row.match_id)===String(matchId)&&Number(row.seconds)>0;});}
 function calc(base,user,week){
  if(!user||user.role!=='editora'&&!(user.role==='admin'&&ctx.payKind&&ctx.payKind(user,ctx.state.matches.filter(function(m){return m.cov&&monday(m.date)===week;}))==='ed'))return base(user,week);
  var all=ctx.state.matches,blocked=[];
  ctx.state.matches=all.filter(function(match){
   var fallback=!match.ed&&!match.edBy&&ctx.state.users.filter(function(u){return u.role==='editora';}).length===1;
   var own=match.ed===user.id||match.edBy===user.id||fallback;
   if(!own||!match.cov||monday(match.date)!==week)return true;
   var assigned=match.ed||match.edBy||(user.role==='editora'&&fallback?user.id:'');
   if(assigned===user.id&&clocked(user.id,match.id))return true;
   blocked.push(match);return false;
  });
  var result;try{result=base(user,week);}finally{ctx.state.matches=all;}
  result.notes=result.notes||[];result.skipped=result.skipped||[];
  if(blocked.length){result.notes.push(state?'Las coberturas sin una sesión de edición original registrada y pausada no generan pago.':'El pago de edición espera la verificación del cronómetro en el servidor.');blocked.forEach(function(m){result.skipped.push(m.teams+' · '+(state?'sin cronómetro registrado':'cronómetro pendiente de verificar'));});}
  return result;
 }
 function afterRender(){
  if(owner!==key())reset();if(!key())return;
  var timer=ctx.editingState&&ctx.editingState(),signature=timer&&timer.sessions?timer.sessions.map(function(s){return s.id+'|'+s.status+'|'+s.active_seconds;}).join(';'):'';
  if(signature!==lastTimer){lastTimer=signature;loadedAt=0;}
  var availability=ctx.photoAvailability&&ctx.photoAvailability(),availabilitySignature=availability?JSON.stringify(availability):'';
  if(availabilitySignature!==lastAvailability){lastAvailability=availabilitySignature;loadedAt=0;}
  load(false);
  var user=ctx.me();if(user.role==='foto')document.querySelectorAll('[data-act="take"]').forEach(function(b){var m=ctx.state.matches.find(function(row){return String(row.id)===b.getAttribute('data-id');});if(!canTake(m,user)){b.disabled=true;b.setAttribute('aria-label','Confirma tu disponibilidad para tomar este partido');b.dataset.tsi230Blocked='true';}else if(b.dataset.tsi230Blocked){b.disabled=false;delete b.dataset.tsi230Blocked;b.removeAttribute('aria-label');}});
  if(ctx.state.view==='dash'&&['partidos','mipago','pagos'].includes(ctx.state.tab)){
   var host=document.getElementById('app');if(host&&!host.querySelector('[data-tsi230-rule-note]')){
    var note=document.createElement('p');note.setAttribute('data-tsi230-rule-note','');note.className=error?'note err':'hint';
    note.textContent=error|| (user.role==='foto'?'Para tomar un partido, confirma disponibilidad para esa semana, fecha y hora.':'Los pagos de edición nuevos requieren tiempo original registrado y pausado. Se conserva el cálculo por jugadores y tarifas.');
    host.appendChild(note);
   }
  }
 }
 document.addEventListener('click',function(event){var button=event.target.closest&&event.target.closest('[data-act="take"]');if(!button||!ctx.me()||ctx.me().role!=='foto')return;var match=ctx.state.matches.find(function(row){return String(row.id)===button.getAttribute('data-id');});if(!canTake(match,ctx.me())){event.preventDefault();event.stopImmediatePropagation();ctx.state.banner='Confirma tu disponibilidad para esa semana, fecha y horario antes de tomar el partido.';ctx.render();load(true);}},true);
 return {afterRender:afterRender,canTake:canTake,clocked:clocked,calc:calc,reload:function(){return load(true);},status:function(){return {ready:!!state,loading:loading,error:error};}};
}};
})(window);
