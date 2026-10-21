(function(root){'use strict';
root.TSI210Install=function(api){
 var M=root.TSI210Model,B=root.TSI210Backup,S=api.state,esc=api.esc;
 var D={owner:'',data:null,busy:false,loading:false,error:'',message:'',forms:{},pending:null,filter:{},selected:'',quoteView:'',audit:[],verified:null};
 var project=new URL(api.server).hostname.split('.')[0],drafts={},draftTimer=null,pendingCore={};
 var labels={cotizador:'Cotizador',rentabilidad:'Rentabilidad',clientes:'Equipos y contactos',entregas:'Entregas',pendientes:'Pendientes',borradores:'Borradores',registro:'Bitácora',recuperacion:'Recuperación'};
 var statuses={draft:'Borrador',sent:'Enviada',accepted:'Aceptada',converted:'Vinculada',cancelled:'Cancelada'};
 var units={player:'jugador',team:'equipo',game:'partido',hour:'hora'};
 var costLabels={travel:'Traslado',access:'Acceso al campo',studio:'Estudio',production:'Producción',other:'Otro costo'};
 var quoteCostLabels={studio:'Estudio',photo:'Fotografía',editing:'Edición',transport:'Traslado',production:'Producción',other:'Otros'};
 var admin=function(){return api.me()&&api.me().role==='admin';};
 function userKey(){return api.me()?project+':'+api.me().id+':'+api.me().role:'';}
 function storageKey(kind){return 'tsi210:'+kind+':'+userKey();}
 function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 function date(value){return value?new Date(value).toLocaleString('es-MX',{timeZone:'America/Monterrey'}):'Sin registrar';}
 function text(value){return esc(value==null?'':String(value));}
 function button(action,label,attrs,primary){return '<button class="btn '+(primary?'primary':'')+'" data-210-action="'+action+'" '+(attrs||'')+(D.busy?' disabled':'')+'>'+text(label)+'</button>';}
 function attr(name,value){return 'data-'+name+'="'+text(value)+'" ';}
 function options(rows,value){return rows.map(function(r){return '<option value="'+text(r[0])+'"'+(String(r[0])===String(value)?' selected':'')+'>'+text(r[1])+'</option>';}).join('');}
 function field(form,key,label,type,extra){
  var value=D.forms[form]&&D.forms[form][key],id='s210-'+form+'-'+key,attrs=' id="'+id+'" data-210-form="'+form+'" data-210-key="'+key+'" '+(extra||'');
  if(type==='checkbox')return '<label class="chk" for="'+id+'"><input type="checkbox"'+attrs+(value?' checked':'')+'>'+text(label)+'</label>';
  return '<div class="s210-field"><label for="'+id+'">'+text(label)+'</label>'+(type==='textarea'?'<textarea rows="3"'+attrs+'>'+text(value)+'</textarea>':'<input type="'+(type||'text')+'" value="'+text(value)+'"'+attrs+'>')+'</div>';
 }
 function select(form,key,label,rows){var id='s210-'+form+'-'+key;return '<div class="s210-field"><label for="'+id+'">'+text(label)+'</label><select id="'+id+'" data-210-form="'+form+'" data-210-key="'+key+'">'+options(rows,D.forms[form]&&D.forms[form][key])+'</select></div>';}
 function empty(label){return '<p class="muted s210-empty">'+text(label)+'</p>';}
 function find(table,id){return ((D.data||{})[table]||[]).find(function(r){return String(r.id||r.match_id)===String(id);});}
 function match(id){return S.matches.find(function(m){return String(m.id)===String(id);});}
 function teamName(id){var team=find('teams',id);return team?team.team_name:'Equipo no disponible';}
 function name(id){var u=S.users.find(function(u){return u.id===id;});return u?u.name:'Cuenta anterior';}
 function panel(title,body){return '<section class="card s210-panel"><h2>'+text(title)+'</h2>'+body+'</section>';}
 function moneyInput(form,key,label){return field(form,key,label,'number','min="0" max="90000000" step="0.01" inputmode="decimal"');}
 function readDrafts(){try{var saved=JSON.parse(localStorage.getItem(storageKey('drafts'))||'{}');drafts=saved.owner===userKey()?saved.entries||{}:{};Object.keys(drafts).forEach(function(k){if(Date.now()-drafts[k].at>7*86400000)delete drafts[k];});}catch(e){drafts={};}}
 function saveDrafts(){try{localStorage.setItem(storageKey('drafts'),JSON.stringify({owner:userKey(),entries:drafts}));}catch(e){D.error='No hay espacio para conservar más borradores en este dispositivo.';}}
 function saveDraft(key,value,label,tab){if(!api.me())return;drafts[key]={at:Date.now(),value:JSON.parse(JSON.stringify(value)),label:label,tab:tab};clearTimeout(draftTimer);draftTimer=setTimeout(saveDrafts,250);}
 function clearDraft(key){delete drafts[key];saveDrafts();}
 function capture(e){
  if(!api.me()||S.view!=='dash'||!e.target)return;var el=e.target;
  if(el.dataset&&el.dataset['210Form']){
   var form=el.dataset['210Form'],key=el.dataset['210Key'];if(!D.forms[form])return;
   D.forms[form][key]=el.type==='checkbox'?el.checked:el.value;
   if(['team','rate','quote','cost','convert','delivery'].includes(form))saveDraft('form:'+form,D.forms[form],{team:'Equipo y contacto',rate:'Tarifa',quote:'Cotización',cost:'Costo de cobertura',convert:'Vinculación de cotización',delivery:'Corrección de entrega'}[form],S.tab);
   if(form==='quote')updateQuotePreview();return;
  }
  if(el.type==='password'||el.type==='file')return;
  if(el.dataset&&el.dataset.f){
   var card=el.closest('[data-card]'),m=card&&match(card.dataset.card);if(!m||!M.canMatch(api.me(),m,S.users))return;
   var values={};card.querySelectorAll('input[data-f],select[data-f],textarea[data-f]').forEach(function(input){if(!input.disabled)values[input.dataset.f]=input.type==='checkbox'?input.checked:input.value;});
   saveDraft('coverage:'+m.id,{mid:String(m.id),values:values,baseline:JSON.stringify(m.cov||null)},'Cobertura · '+m.teams,'cobertura');
  }else if(el.dataset&&el.dataset.draft){saveDraft('core:match',S.draft,'Nuevo partido','partidos');}
  else if(/^av29-(title|text|to)$/.test(el.id)){var draft=api.avisoDraft();if(draft)saveDraft('core:aviso',{id:draft.id,title:draft.title,text:draft.text,to:draft.to,format:draft.format,source:draft.source?{id:draft.source.id,updatedAt:draft.source.updatedAt}:null},'Texto de aviso','avisos');}
 }
 async function load(base){
  if(!api.me()||D.loading)return;var owner=D.owner;D.loading=true;D.error='';api.render();
  try{if(base){if(!api.syncIdle())throw Error('Hay cambios guardándose. Espera unos segundos.');await api.loadBase(true);}
   var data=await api.sb('POST','/rest/v1/rpc/tsi210_state',{});if(owner!==D.owner)return;D.data=data;D.audit=data.audit||[];
  }catch(e){if(owner===D.owner)D.error='No se pudieron actualizar las herramientas: '+e.message;}
  finally{if(owner===D.owner){D.loading=false;api.render();}}
 }
 function syncPending(){try{if(D.pending)localStorage.setItem(storageKey('pending'),JSON.stringify(D.pending));else localStorage.removeItem(storageKey('pending'));}catch(e){}}
 async function run(operation,payload,success,draftKey){
  if(D.busy)return;if(!api.syncIdle()){D.error='Espera a que terminen de guardarse los cambios anteriores.';api.render();return;}
  if(D.pending&&operation){D.error='Reintenta o descarta la solicitud pendiente antes de enviar otra.';api.render();return;}
  if(operation)D.pending={operation:operation,payload:JSON.parse(JSON.stringify(payload)),request_id:crypto.randomUUID(),success:success,draftKey:draftKey};
  if(!D.pending)return;syncPending();var owner=D.owner,request=D.pending;
  D.busy=true;D.error='';D.message='';var confirmed=false;api.render();
  try{
   var response=await api.sb('POST','/rest/v1/rpc/tsi210_command',{operation:request.operation,payload:request.payload,request_id:request.request_id});
   if(owner!==D.owner)return;confirmed=true;D.pending=null;syncPending();if(request.draftKey)clearDraft(request.draftKey);
   if(request.operation==='team.save')D.forms.team=null;if(request.operation==='rate.save')D.forms.rate=null;if(request.operation==='quote.save')D.forms.quote=null;if(request.operation==='cost.save')D.forms.cost=null;
   D.message=request.success||'Cambio guardado.';if(request.operation==='quote.convert'){D.quoteView='';D.forms.convert=null;}
   if(request.operation==='quote.convert')await api.loadBase(true);
   D.data=await api.sb('POST','/rest/v1/rpc/tsi210_state',{});D.audit=D.data.audit||[];return response;
  }catch(e){if(owner!==D.owner)return;if(confirmed){D.error='El cambio se guardó. No se pudo actualizar la vista: '+e.message;return;}var code=e.body&&e.body.code;if(e.status>=400&&e.status<500||['40001','P0001','23514','23503','23505','42501'].includes(code)){D.pending=null;syncPending();}D.error='No se confirmó el cambio: '+e.message+(D.pending?' Usa Reintentar para evitar duplicados.':' El borrador se conserva.');}
  finally{if(owner===D.owner){D.busy=false;api.render();}}
 }
 function controls(){return '<div class="s210-status" aria-live="polite">'+(D.error?'<p class="err" role="alert">'+text(D.error)+'</p>':'')+(D.message?'<p class="note" role="status">'+text(D.message)+'</p>':'')+(D.busy?'<p role="status">Guardando…</p>':'')+(D.pending?'<div class="note">Hay una solicitud pendiente de confirmar. '+button('retry','Reintentar')+button('discard-request','Descartar solicitud')+'</div>':'')+'</div><div class="s210-actions">'+button('refresh',D.loading?'Actualizando…':'Actualizar datos')+'</div>';
 }
 function newTeam(team){D.forms.team=team?Object.assign({},team):{id:crypto.randomUUID(),version:0,team_name:'',sport:'Flag',coordinator_name:'',whatsapp:'',notes:'',archived:false};D.focusForm='team';}
 function teamForm(){var f=D.forms.team;if(!f)return button('new-team','Agregar equipo','',true);return panel(f.version?'Editar equipo':'Nuevo equipo',field('team','team_name','Equipo','text','maxlength="120" required')+select('team','sport','Deporte',[['Flag','Flag'],['Americano','Fútbol americano'],['Béisbol','Béisbol'],['Soccer','Soccer'],['Media Day','Media Day'],['Otro','Otro']])+field('team','coordinator_name','Nombre de la coordinadora o contacto','text','maxlength="120"')+field('team','whatsapp','WhatsApp','tel','maxlength="24" inputmode="tel"')+field('team','notes','Notas del equipo','textarea','maxlength="2000"')+(f.version?field('team','archived','Archivar equipo','checkbox'):'')+'<div class="s210-actions">'+button('save-team','Guardar equipo','',true)+button('cancel-form','Cancelar',attr('form','team'))+'</div>');}
 function teams(){
  var html=teamForm()+panel('Directorio de equipos','<label for="s210-team-search">Buscar por equipo, deporte o coordinadora</label><input id="s210-team-search" type="search" data-210-search="teams" autocomplete="off">'+D.data.teams.map(function(t){
   var quotes=D.data.quotes.filter(function(q){return q.team_id===t.id;}),links=D.data.team_matches.filter(function(l){return l.team_id===t.id;}),phone=t.whatsapp.length===10?'52'+t.whatsapp:t.whatsapp;
   return '<article class="s210-row" data-210-search-row="teams" data-search="'+text([t.team_name,t.sport,t.coordinator_name].join(' ').toLowerCase())+'"><h3>'+text(t.team_name)+(t.archived?' <span class="badge">Archivado</span>':'')+'</h3><p>'+text(t.sport)+' · '+text(t.coordinator_name||'Contacto sin nombre')+'</p>'+(phone?'<a class="btn small" href="https://wa.me/'+text(phone)+'" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>':'')+'<p>'+text(t.notes)+'</p><div class="s210-actions">'+((admin()||t.owner_id===api.me().id)?button('edit-team','Editar',attr('id',t.id)):'')+(!t.archived?button('quote-team','Cotizar',attr('id',t.id))+button('link-team','Vincular cobertura',attr('id',t.id)):'')+'</div><details><summary>Historial · '+quotes.length+' cotizaciones · '+links.length+' coberturas</summary>'+quotes.map(function(q){return '<p>'+text(q.package_name)+' · '+M.money(q.total_cents)+' · '+statuses[q.status]+'</p>';}).join('')+links.map(function(l){var m=match(l.match_id);return m?'<p>'+text(m.teams)+' · '+text(m.date)+' '+button('open-match','Abrir',attr('mid',m.id)+attr('tab','cobertura'))+'</p>':'';}).join('')+'</details></article>';
  }).join('')+(D.data.teams.length?'':empty('Agrega el primer equipo para guardar sus contactos y cotizaciones.')));
  if(D.forms.link){html+=panel('Vincular una cobertura a '+teamName(D.forms.link.team_id),select('link','match_id','Partido',[['','Selecciona un partido']].concat(S.matches.filter(function(m){return M.canMatch(api.me(),m,S.users);}).map(function(m){return [m.id,m.date+' · '+m.teams];})))+button('save-link','Vincular cobertura','',true));}
  return html;
 }
 function newRate(rate){D.forms.rate=rate?Object.assign({},rate,{price:Number(rate.price_cents)/100}):{id:crypto.randomUUID(),version:0,sport:'Flag',package_name:'',unit:'player',price:'',max_discount_pct:0,description:'',active:false};D.focusForm='rate';}
 function rates(){
  if(!admin())return '';var f=D.forms.rate,body=button('new-rate','Nueva tarifa');
  if(f)body=field('rate','sport','Deporte','text','maxlength="60"')+field('rate','package_name','Paquete','text','maxlength="120" placeholder="Ej. Field Day, Field Pro o cobertura de partido"')+select('rate','unit','Unidad',[['player','Por jugador'],['team','Por equipo'],['game','Por partido'],['hour','Por hora']])+moneyInput('rate','price','Precio aprobado (MXN)')+field('rate','max_discount_pct','Descuento máximo para fotógrafos (%)','number','min="0" max="100" step="0.01"')+field('rate','description','Contenido del paquete','textarea','maxlength="3000"')+field('rate','active','Tarifa aprobada y disponible para cotizar','checkbox')+'<div class="s210-actions">'+button('save-rate','Guardar tarifa','',true)+button('cancel-form','Cancelar',attr('form','rate'))+'</div>';
  return '<details class="card s210-panel"><summary>Administrar tarifas y paquetes</summary>'+body+D.data.rates.map(function(r){return '<div class="s210-row"><strong>'+text(r.sport+' · '+r.package_name)+'</strong><p>'+M.money(r.price_cents)+' por '+units[r.unit]+' · '+(r.active?'Aprobada':'Desactivada')+' · Descuento permitido '+r.max_discount_pct+'%</p>'+button('edit-rate','Editar',attr('id',r.id))+'</div>';}).join('')+'</details>';
 }
 function newQuote(q,team){
  D.focusForm='quote';
  var rate=D.data&&D.data.rates.find(function(r){return r.active;});
  D.forms.quote=q?Object.assign({},q,{price:Number(q.unit_price_cents)/100,discount:Number(q.discount_cents)/100}):{id:crypto.randomUUID(),version:0,team_id:team||'',rate_id:rate&&rate.id||'',quantity:'',price:rate?rate.price_cents/100:'',discount:0,event_date:'',event_time:'',venue:'',category:'',scope:rate&&rate.description||'',valid_until:api.addDays(today(),7)};
  if(admin()){var costs=q&&D.data.quote_costs.find(function(c){return c.quote_id===q.id;});Object.keys(quoteCostLabels).forEach(function(k){D.forms.quote['cost_'+k]=costs?Number(costs.items[k]||0)/100:0;});}
 }
 function quotePreview(){
  var f=D.forms.quote,rate=f&&find('rates',f.rate_id);if(!f||!rate)return 'Selecciona una tarifa aprobada.';
  try{var totals=M.quote({quantity:f.quantity,unit_price_cents:M.cents(f.price),discount_cents:M.cents(f.discount||0)},rate,admin()),out='Total: '+M.money(totals.total_cents)+' · Subtotal '+M.money(totals.gross_cents)+' · Descuento '+M.money(totals.discount_cents);
   if(admin()){var cost=Object.keys(quoteCostLabels).reduce(function(n,k){return n+M.cents(f['cost_'+k]||0);},0),profit=totals.total_cents-cost;out+=' · Costos estimados '+M.money(cost)+' · Utilidad estimada '+M.money(profit)+(totals.total_cents?' · Margen '+(profit/totals.total_cents*100).toFixed(1)+'%':'');}return out;
  }catch(e){return e.message;}
 }
 function updateQuotePreview(){var el=document.getElementById('s210-quote-preview');if(el)el.textContent=quotePreview();}
 function quoteForm(){
  var f=D.forms.quote;if(!f)return button('new-quote','Crear cotización','',true);
  var active=D.data.rates.filter(function(r){return r.active;}),teamRows=D.data.teams.filter(function(t){return !t.archived;});
  var html=select('quote','team_id','Equipo',[['','Selecciona un equipo']].concat(teamRows.map(function(t){return [t.id,t.team_name+' · '+t.sport];})))+select('quote','rate_id','Paquete aprobado',[['','Selecciona una tarifa']].concat(active.map(function(r){return [r.id,r.sport+' · '+r.package_name+' · '+M.money(r.price_cents)+' por '+units[r.unit]];})))+'<div class="s210-grid">'+field('quote','quantity','Cantidad de jugadores, equipos, partidos u horas','number','min="0.01" max="10000" step="0.01"')+moneyInput('quote','price','Precio unitario (MXN)')+moneyInput('quote','discount','Descuento total al cliente (MXN)')+'</div><div class="s210-grid">'+field('quote','event_date','Fecha del evento','date')+field('quote','event_time','Hora del evento','time')+field('quote','valid_until','Vigente hasta','date')+'</div>'+field('quote','venue','Campo o sede','text','maxlength="160"')+field('quote','category','Categoría','text','maxlength="80"')+field('quote','scope','Fotos, video, duración y alcance acordado','textarea','maxlength="3000"');
  if(admin())html+='<details><summary>Costos internos estimados · sólo administración</summary><div class="s210-grid">'+Object.keys(quoteCostLabels).map(function(k){return moneyInput('quote','cost_'+k,quoteCostLabels[k]+' (MXN)');}).join('')+'</div></details>';
  return panel(f.version?'Editar cotización':'Nueva cotización',html+'<p class="note" id="s210-quote-preview" role="status">'+text(quotePreview())+'</p><div class="s210-actions">'+button('save-quote','Guardar cotización','',true)+button('cancel-form','Cancelar',attr('form','quote'))+'</div>');
 }
 function quotes(){
  var html=(!D.data.rates.some(function(r){return r.active;})?'<p class="note">'+(admin()?'Primero configura y aprueba tus precios en Administrar tarifas y paquetes. No se han inventado precios comerciales.':'Administración debe aprobar una tarifa antes de que puedas cotizar.')+'</p>':'')+quoteForm()+rates(),rows=D.data.quotes;
  html+=panel('Historial de cotizaciones',rows.map(function(q){
   var attrs=attr('id',q.id),cost=admin()&&D.data.quote_costs.find(function(c){return c.quote_id===q.id;}),totalCost=cost?Object.values(cost.items).reduce(function(n,v){return n+Number(v);},0):null;
   return '<article class="s210-row" id="s210-quote-'+q.id+'"><h3>'+text(teamName(q.team_id))+' <span class="badge">'+statuses[q.status]+'</span></h3><p>'+text(q.sport+' · '+q.package_name)+' · '+M.money(q.total_cents)+'</p><p>'+text(q.quantity)+' '+text(units[q.unit])+' · '+text(q.event_date||'Fecha por definir')+' · '+text(q.venue)+'</p><p class="s210-preserve">'+text(q.scope)+'</p>'+(totalCost!==null?'<p>Costos estimados '+M.money(totalCost)+' · Utilidad estimada '+M.money(Number(q.total_cents)-totalCost)+'</p>':'')+'<div class="s210-actions">'+button('export-quote','Descargar cotización',attrs)+(q.status==='draft'?button('edit-quote','Editar',attrs)+button('quote-status','Marcar enviada',attrs+attr('status','sent')):'')+(q.status==='sent'?button('quote-status','Registrar aceptación',attrs+attr('status','accepted'))+button('quote-status','Volver a borrador',attrs+attr('status','draft')):'')+(q.status==='accepted'&&admin()?button('convert-quote','Vincular partido',attrs):'')+(q.status==='converted'&&q.match_id?button('open-match','Abrir partido',attr('mid',q.match_id)+attr('tab','cobertura')):'')+(['draft','sent','accepted'].includes(q.status)?button('quote-status','Cancelar',attrs+attr('status','cancelled')):'')+'</div>'+conversionForm(q)+'</article>';
  }).join('')||(empty('Aún no hay cotizaciones.')));return html;
 }
 function conversionForm(q){if(D.quoteView!==q.id||!D.forms.convert)return '';return '<div class="s210-inset"><p>Vincula un partido existente o crea una opción de cobertura. Los fotógrafos elegirán su plaza desde Partidos.</p>'+select('convert','match_id','Partido existente',[['','Crear un partido nuevo']].concat(S.matches.filter(function(m){return !m.archived;}).map(function(m){return [m.id,m.date+' · '+m.teams];})))+field('convert','teams','Equipos, si crearás un partido nuevo','text','maxlength="200" placeholder="Equipo local vs visitante"')+button('save-conversion','Confirmar vinculación','',true)+'</div>';}
 function ownMatches(){return S.matches.filter(function(m){return M.canMatch(api.me(),m,S.users);}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});}
 function deliveries(){
  var rows=ownMatches().filter(function(m){return m.cov||find('deliveries',m.id);});
  return panel('Envío, recepción y correcciones','<p class="muted">Registrar un envío confirma que alguien del equipo compartió el enlace. La recepción se registra manualmente cuando el cliente la confirma.</p>'+rows.map(function(m){
   var d=find('deliveries',m.id),attrs=attr('mid',m.id),canSend=api.me().role!=='editora',canResolve=admin()||api.me().role==='editora';
   return '<article class="s210-row" id="s210-delivery-'+text(m.id)+'"><h3>'+text(m.teams)+'</h3><p>'+text(m.date+' · '+m.venue)+' · <span class="badge">'+M.deliveryStatus(d)+'</span></p><p>Envío: '+text(date(d&&d.sent_at))+(d&&d.sent_by?' · '+text(name(d.sent_by)):'')+'<br>Recepción: '+text(date(d&&d.confirmed_at))+'</p>'+(d&&d.correction_open?'<p class="note s210-preserve">'+text(d.correction_note)+'</p>':'')+'<div class="s210-actions">'+(m.link&&/^https?:\/\//.test(m.link)?'<a class="btn" href="'+text(m.link)+'" target="_blank" rel="noopener noreferrer">Abrir carpeta</a>':'')+button('open-match','Ver proceso',attrs+attr('tab','proceso'))+(canSend&&m.stage==='listos'&&m.link?button('delivery-action',d&&d.sent_at?'Registrar nuevo envío':'Registrar envío',attrs+attr('action','sent')):'')+(canSend&&d&&d.sent_at&&!d.confirmed_at&&!d.correction_open?button('delivery-action','Confirmar recepción',attrs+attr('action','confirmed')):'')+button('delivery-correction','Anotar corrección',attrs)+(canResolve&&d&&d.correction_open?button('delivery-action','Marcar corrección resuelta',attrs+attr('action','resolved')):'')+'</div>'+(D.forms.delivery&&D.forms.delivery.match_id===String(m.id)?'<div class="s210-inset">'+field('delivery','note','Corrección solicitada','textarea','maxlength="2000"')+button('save-correction','Guardar corrección','',true)+'</div>':'')+'</article>';
  }).join('')+(rows.length?'':empty('Todavía no hay coberturas para registrar su entrega.')));
 }
 function costForm(m){
  var f=D.forms.cost;if(!f||f.match_id!==String(m.id))return button('new-cost','Registrar costo directo',attr('mid',m.id));
  return '<div class="s210-inset"><h4>'+(f.version?'Editar costo':'Costo directo')+'</h4>'+select('cost','category','Concepto',Object.entries(costLabels))+moneyInput('cost','amount','Importe (MXN)')+field('cost','note','Detalle','text','maxlength="1000"')+'<p class="hint">Los pagos de fotografía, edición y bonos ya se calculan por separado. Aquí registra otros costos que todavía no estén capturados en Gastos.</p><div class="s210-actions">'+button('save-cost','Guardar costo','',true)+button('cancel-form','Cancelar',attr('form','cost'))+'</div></div>';
 }
 function profitability(){
  var month=D.filter.month===undefined?today().slice(0,7):D.filter.month,ms=S.matches.filter(function(m){return m.cov&&(!month||m.date.slice(0,7)===month);}),lines=M.payroll(S,api.helpers),sum={net:0,paid:0,cost:0,profit:0};
  var rows=ms.map(function(m){var row=M.summarize(m,lines,D.data.costs);sum.net+=row.net_cents;sum.paid+=row.paid_cents;sum.cost+=row.estimated_total_cost_cents;sum.profit+=row.profit_cents;return {m,r:row};});
  var allocated=new Set(D.data.costs.map(function(c){return c.source_expense_id;}).filter(Boolean)),unassigned=S.expenses.filter(function(e){return e.status==='aprobado'&&(!month||e.date.slice(0,7)===month)&&!allocated.has(String(e.id));}),unassignedCents=unassigned.reduce(function(n,e){return n+M.cents(e.amount||0);},0);
  var html=panel('Rentabilidad por cobertura','<label for="s210-month">Mes de las coberturas</label><input id="s210-month" type="month" value="'+text(month)+'"><div class="s210-actions">'+button('all-months','Ver todos los meses')+'</div><div class="s210-metrics">'+metric('Venta neta',sum.net)+metric('Cobros registrados',sum.paid)+metric('Costos registrados y estimados',sum.cost)+metric('Utilidad atribuida',sum.profit)+'</div><p class="hint">La utilidad usa ventas netas. El resultado sobre cobros usa lo pagado por el cliente. El efectivo registrado por los fotógrafos sirve para conciliación y no se suma otra vez como ingreso.</p>'+(unassigned.length?'<p class="note" role="status">Hay '+unassigned.length+' gastos aprobados sin atribuir, por '+M.money(unassignedCents)+'. Las utilidades por cobertura no incluyen todavía esos gastos.</p>':'')+rows.map(function(x){var m=x.m,r=x.r,costs=D.data.costs.filter(function(c){return String(c.match_id)===String(m.id);});
   return '<article class="s210-row" id="s210-profit-'+text(m.id)+'"><h3>'+text(m.teams)+'</h3><p>'+text(m.date+' · '+m.venue)+' · <span class="badge">'+(r.estimated?'Incluye personal estimado':'Costos de personal registrados')+'</span></p><div class="s210-metrics">'+metric('Venta neta',r.net_cents)+metric('Costo atribuido',r.estimated_total_cost_cents)+metric('Utilidad atribuida',r.profit_cents)+metric('Saldo del cliente',r.balance_cents)+'</div><details><summary>Desglose y costos directos</summary><dl class="s210-detail"><dt>Venta bruta</dt><dd>'+M.money(r.gross_cents)+'</dd><dt>Descuento al cliente</dt><dd>−'+M.money(r.discount_cents)+'</dd><dt>Cobros del cliente</dt><dd>'+M.money(r.paid_cents)+'</dd><dt>Efectivo registrado por fotógrafos</dt><dd>'+M.money(r.field_cash_cents)+' · conciliación</dd><dt>Personal registrado, incluidos bonos atribuidos</dt><dd>'+M.money(r.payroll_cents)+'</dd><dt>Personal todavía estimado</dt><dd>'+M.money(r.estimated_payroll_cents)+'</dd><dt>Otros costos atribuidos</dt><dd>'+M.money(r.direct_cost_cents)+'</dd><dt>Resultado sobre cobros registrados</dt><dd>'+M.money(r.result_on_collections_cents)+'</dd><dt>Margen estimado sobre venta neta</dt><dd>'+(r.margin_pct===null?'Sin venta neta':r.margin_pct.toFixed(1)+'%')+'</dd></dl><p class="hint">Los bonos de pagos guardados se prorratean por jugadores entre las coberturas de ese pago. Los reembolsos y descuentos de préstamos no se vuelven a contar como sueldo.</p>'+costs.map(function(c){return '<div class="s210-row"><strong>'+text(costLabels[c.category])+' · '+M.money(c.amount_cents)+'</strong><p>'+text(c.note)+'</p>'+(c.source_expense_id?'<small>Gasto compartido atribuido; ya forma parte del total mensual de Gastos.</small>':button('edit-cost','Editar',attr('id',c.id))+button('delete-cost','Eliminar',attr('id',c.id)))+'</div>';}).join('')+costForm(m)+'</details></article>';
  }).join('')+(rows.length?'':empty('No hay coberturas registradas en este periodo.')));
  return html+allocationForm();
 }
 function metric(label,value){return '<div><span>'+text(label)+'</span><strong>'+M.money(value)+'</strong></div>';}
 function allocationForm(){
  if(!D.forms.allocation)D.forms.allocation={expense_id:'',method:'equal',match_ids:[],replace:false};var f=D.forms.allocation;
  return '<details class="card s210-panel"><summary>Distribuir un gasto aprobado</summary><p>Selecciona el gasto existente para atribuirlo a sus coberturas sin volver a registrarlo. El reparto conserva hasta el último centavo.</p>'+select('allocation','expense_id','Gasto aprobado',[['','Selecciona']].concat(S.expenses.filter(function(e){return e.status==='aprobado';}).map(function(e){return [e.id,e.date+' · '+e.cat+' · '+api.money(e.amount)];})))+select('allocation','method','Forma de reparto',[['equal','Partes iguales'],['players','Proporcional a jugadores']])+'<fieldset class="s210-checklist"><legend>Coberturas a las que corresponde</legend>'+S.matches.filter(function(m){return m.cov;}).sort(function(a,b){return b.date.localeCompare(a.date);}).map(function(m){return '<label class="chk"><input type="checkbox" data-210-allocation="'+text(m.id)+'"'+(f.match_ids.includes(String(m.id))?' checked':'')+'>'+text(m.date+' · '+m.teams)+' · '+text(m.cov.players)+' jugadores</label>';}).join('')+'</fieldset>'+field('allocation','replace','Reemplazar la distribución anterior de este gasto','checkbox')+'<div class="s210-actions">'+button('allocate','Guardar distribución','',true)+button('unallocate','Retirar distribución')+'</div></details>';
 }
 function pendings(){
  var rows=M.pending(S,D.data,api.me(),today());return panel('Qué requiere atención','<p>'+rows.length+' pendientes para tu perfil.</p>'+rows.map(function(r){return '<article class="s210-row"><span class="badge '+(r.priority===1?'warn':'')+'">'+text(r.kind)+'</span><h3>'+text(r.title)+'</h3>'+(r.amount_cents?'<p>'+M.money(r.amount_cents)+'</p>':'')+button('open-pending','Resolver',attr('key',r.key))+'</article>';}).join('')+(rows.length?'':empty('No hay pendientes de estas categorías.')));
 }
 function draftList(){return panel('Borradores de este dispositivo','<p>Los borradores pertenecen a tu cuenta y a este entorno. Caducan después de siete días. Las imágenes y los archivos originales deben volver a seleccionarse.</p>'+Object.keys(drafts).map(function(k){var d=drafts[k];return '<article class="s210-row"><h3>'+text(d.label)+'</h3><p>'+text(date(d.at))+'</p><div class="s210-actions">'+button('restore-draft','Recuperar',attr('key',k))+button('discard-draft','Descartar',attr('key',k))+'</div></article>';}).join('')+(Object.keys(drafts).length?'':empty('No hay borradores pendientes.')));}
 function draftBanner(){if(!api.me()||S.view!=='dash')return '';var count=Object.keys(drafts).filter(function(k){return drafts[k].tab===S.tab;}).length;return count&&S.tab!=='borradores'?'<aside class="note s210-draft" role="status">Hay '+count+' borrador(es) de esta sección en este dispositivo. '+button('open-drafts','Revisar borradores')+'</aside>':'';}
 function audit(){return panel('Bitácora de cambios','<p class="muted">Cobros, pagos, asignaciones, avisos y herramientas internas. Los registros conservan autor, fecha y valores; las imágenes no se duplican en la bitácora.</p><label for="s210-audit-search">Buscar por entidad, identificador o persona</label><input id="s210-audit-search" type="search" data-210-search="audit">'+D.audit.map(function(a){return '<details class="s210-row" data-210-search-row="audit" data-search="'+text([a.entity,a.entity_id,name(a.actor_id)].join(' ').toLowerCase())+'"><summary>'+text(date(a.happened_at))+' · '+text(a.entity)+' · '+text(a.action)+'</summary><p>'+text(a.actor_id?name(a.actor_id):'Proceso del sistema')+' · Registro '+text(a.entity_id)+'</p><p>Campos: '+text((a.changed_keys||[]).join(', '))+'</p><h4>Antes</h4><pre>'+text(JSON.stringify(a.before_data,null,2))+'</pre><h4>Después</h4><pre>'+text(JSON.stringify(a.after_data,null,2))+'</pre></details>';}).join('')+button('more-audit','Cargar registros anteriores'));}
 function recovery(){return panel('Respaldo operativo cifrado','<p>Incluye registros operativos y fotos adjuntas de comentarios. El archivo se cifra con una contraseña que tú eliges. Las cuentas de acceso, secretos y configuración del servidor requieren el procedimiento de recuperación del proyecto.</p><label for="s210-backup-password">Contraseña para el respaldo (mínimo 12 caracteres)</label><input id="s210-backup-password" type="password" autocomplete="new-password" minlength="12"><p class="hint">Guarda esta contraseña en un lugar seguro. No se conserva en TSI.</p>'+button('backup','Descargar respaldo cifrado','',true))+panel('Comprobar un respaldo','<p>Comprueba la contraseña, integridad, adjuntos y restauración de registros en tablas temporales. Esta prueba conserva intactos los datos activos.</p><label for="s210-backup-file">Archivo de respaldo</label><input id="s210-backup-file" type="file" accept=".tsibackup,application/json">'+(D.verifyFile?'<p>Seleccionado: '+text(D.verifyFile.name)+'</p>':'')+'<label for="s210-verify-password">Contraseña del respaldo</label><input id="s210-verify-password" type="password" autocomplete="off">'+button('verify-backup','Comprobar respaldo','',true)+(D.verified?'<p class="note" role="status">Verificado: '+D.verified.tables+' tablas, '+D.verified.records+' registros y '+D.verified.files+' archivos. Ensayo de restauración aprobado; los datos activos permanecen intactos.</p>':''));}
 function download(filename,data,mime){var url=URL.createObjectURL(new Blob([data],{type:mime||'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);}
 async function makeBackup(){
  var el=document.getElementById('s210-backup-password'),password=el&&el.value||'';if(el)el.value='';if(password.length<12)throw Error('Usa una contraseña de al menos 12 caracteres.');
  D.busy=true;D.error='';D.message='Generando el respaldo y comprobando los adjuntos…';api.render();
  try{var snapshot=await api.sb('POST','/rest/v1/rpc/tsi210_backup',{});snapshot.project=project;var assets=[],size=0;
   for(var i=0;i<snapshot.files.length;i++){
   var file=snapshot.files[i],raw=new Uint8Array(await api.storageFile(file.bucket,file.name));if(Number(file.size)>0&&raw.length!==Number(file.size))throw Error('Un adjunto cambió mientras se preparaba el respaldo. Vuelve a generar el archivo.');size+=raw.length;if(size>70000000)throw Error('Los adjuntos superan 70 MB. Se requiere el respaldo de archivos desde administración del proyecto; no se generó un respaldo parcial.');
    assets.push({bucket:file.bucket,name:file.name,size:raw.length,base64:B.base64(raw),sha256:await B.sha(raw)});
   }
   var payload={snapshot:snapshot,snapshot_sha256:await B.sha(new TextEncoder().encode(JSON.stringify(snapshot))),assets:assets};await B.verify(payload);
   var envelope=await B.seal(payload,password,project);download('TSI-respaldo-'+today()+'.tsibackup',JSON.stringify(envelope));D.message='Respaldo cifrado preparado. Conserva el archivo y su contraseña por separado.';
  }finally{password='';D.busy=false;api.render();}
 }
 async function verifyBackup(){
  var file=D.verifyFile,el=document.getElementById('s210-verify-password'),password=el&&el.value||'';if(el)el.value='';if(!file||!password)throw Error('Selecciona el respaldo e indica su contraseña.');if(file.size>150000000)throw Error('El archivo supera el límite de verificación de 150 MB.');
  D.busy=true;D.error='';D.verified=null;D.message='Comprobando el respaldo…';api.render();
  try{var payload=await B.open(JSON.parse(await file.text()),password,project),checked=await B.verify(payload),result=await api.sb('POST','/rest/v1/rpc/tsi210_verify_restore',{snapshot:payload.snapshot});if(!result.verified||result.live_data_modified)throw Error('El ensayo de restauración no se confirmó.');D.verified=checked;D.message='Respaldo comprobado. No se modificaron los datos activos.';}
  finally{password='';D.busy=false;api.render();}
 }
 function exportQuote(q){
  var body='<h1>Tanabi Sports</h1><h2>Cotización · '+text(q.package_name)+'</h2><p>Equipo: '+text(teamName(q.team_id))+'<br>Deporte: '+text(q.sport)+'<br>Fecha del evento: '+text(q.event_date||'Por definir')+'<br>Sede: '+text(q.venue||'Por definir')+'</p><p>'+text(q.quantity)+' '+text(units[q.unit])+' × '+M.money(q.unit_price_cents)+'</p><p>Descuento: '+M.money(q.discount_cents)+'</p><h2>Total: '+M.money(q.total_cents)+' MXN</h2><h3>Alcance</h3><p style="white-space:pre-wrap">'+text(q.scope)+'</p><p>Vigente hasta: '+text(q.valid_until||'Según acuerdo')+'</p><small>Referencia: '+text(q.id)+'</small>';
  download('TSI-cotizacion-'+q.id.slice(0,8)+'.html','<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cotización Tanabi Sports</title><style>body{font:16px/1.6 system-ui;max-width:760px;margin:40px auto;padding:24px;color:#141414}h1,h2{color:#34317f}@media print{body{margin:0}}</style><body>'+body+'</body></html>','text/html');
 }
 async function restoreDraft(key){
  var saved=drafts[key];if(!saved)throw Error('El borrador ya no está disponible.');var value=JSON.parse(JSON.stringify(saved.value));
  S.view='dash';S.tab=saved.tab;
  if(key.startsWith('form:')){var form=key.slice(5);if(['rate','cost'].includes(form)&&!admin())throw Error('Este borrador requiere administración.');D.forms[form]=value;D.focusForm=form;if(form==='convert')D.quoteView=value.quote_id;api.render();}
  else if(key.startsWith('coverage:')){
   var m=match(value.mid);if(!m||!M.canMatch(api.me(),m,S.users))throw Error('La cobertura ya no está disponible para tu perfil.');
   if(!admin()&&m.cov&&m.cov.locked)throw Error('La cobertura está bloqueada. Solicita autorización para modificarla; el borrador se conserva.');
   if(JSON.stringify(m.cov||null)!==value.baseline&&!confirm('Los datos guardados de esta cobertura cambiaron. ¿Quieres recuperar el borrador para compararlos antes de guardar?'))return;
   api.render();var card=Array.from(document.querySelectorAll('[data-card]')).find(function(c){return c.dataset.card===String(value.mid);});
   if(!card)throw Error('No se pudo abrir esta cobertura.');
   card.querySelectorAll('input[data-f],select[data-f],textarea[data-f]').forEach(function(el){var k=el.dataset.f;if(!el.disabled&&Object.prototype.hasOwnProperty.call(value.values,k)){if(el.type==='checkbox')el.checked=!!value.values[k];else el.value=value.values[k];}});
   card.scrollIntoView({block:'center'});D.message='Borrador recuperado. Revisa los datos y guarda la cobertura para confirmarlos.';
   var total=card.querySelector('[data-f="total"]');if(total)total.textContent='Borrador recuperado · revisa los importes antes de guardar';
   return;
  }else if(key==='core:match'){S.draft=value;api.render();}
  else if(key==='core:aviso'){await api.restoreAviso(value);}
  D.message='Borrador recuperado. Revisa sus datos antes de guardar.';api.render();
 }
 async function action(action,el){
  var ds=el.dataset,id=ds.id,mid=ds.mid,f,q;
  if(action==='refresh')return load(true);
  if(action==='retry')return run();
  if(action==='discard-request'){if(!confirm('Descartar el reintento no revierte una operación que el servidor ya haya guardado. ¿Actualizar datos y descartar la solicitud?'))return;await load(true);if(D.error)return;D.pending=null;syncPending();api.render();return;}
  if(action==='cancel-form'){D.forms[ds.form]=null;api.render();return;}
  if(action==='new-team'){newTeam();api.render();return;}
  if(action==='edit-team'){newTeam(find('teams',id));api.render();return;}
  if(action==='save-team'){f=D.forms.team;if(!f)return;return run('team.save',Object.assign({},f,{whatsapp:String(f.whatsapp||'').replace(/\D/g,'')}),'Equipo guardado.','form:team');}
  if(action==='link-team'){D.forms.link={team_id:id,match_id:''};D.focusForm='link';api.render();return;}
  if(action==='save-link')return run('team.link',D.forms.link,'Cobertura vinculada al equipo.');
  if(action==='quote-team'){newQuote(null,id);S.tab='cotizador';api.render();return;}
  if(action==='new-rate'){newRate();api.render();return;}
  if(action==='edit-rate'){newRate(find('rates',id));api.render();return;}
  if(action==='save-rate'){f=D.forms.rate;if(!f)return;return run('rate.save',Object.assign({},f,{price_cents:M.cents(f.price),max_discount_pct:Number(f.max_discount_pct)}),'Tarifa guardada.','form:rate');}
  if(action==='new-quote'){newQuote();api.render();return;}
  if(action==='edit-quote'){newQuote(find('quotes',id));api.render();return;}
  if(action==='save-quote'){
   f=D.forms.quote;if(!f)return;var rate=find('rates',f.rate_id);if(!rate)throw Error('Selecciona una tarifa aprobada.');
   var payload=Object.assign({},f,{quantity:Number(f.quantity),unit_price_cents:M.cents(f.price),discount_cents:M.cents(f.discount||0)});M.quote(payload,rate,admin());
   Object.keys(payload).forEach(function(k){if(k.startsWith('cost_')||k==='price'||k==='discount')delete payload[k];});
   if(admin()){payload.costs={};Object.keys(quoteCostLabels).forEach(function(k){payload.costs[k]=M.cents(f['cost_'+k]||0);});}
   return run('quote.save',payload,'Cotización guardada.','form:quote');
  }
  if(action==='quote-status'){
   q=find('quotes',id);if(!q)return;if(ds.status==='accepted'&&!confirm('¿Confirmas que el cliente aceptó esta cotización? Este registro es manual.'))return;
   if(ds.status==='cancelled'&&!confirm('¿Cancelar esta cotización?'))return;
   return run('quote.status',{id:id,version:q.version,status:ds.status},'Estado de cotización actualizado.');
  }
  if(action==='export-quote'){q=find('quotes',id);if(q)exportQuote(q);return;}
  if(action==='convert-quote'){q=find('quotes',id);D.quoteView=id;D.forms.convert={quote_id:id,match_id:'',teams:teamName(q.team_id)+' vs '};D.focusForm='convert';api.render();return;}
  if(action==='save-conversion'){f=D.forms.convert;q=f&&find('quotes',f.quote_id);if(!q)return;return run('quote.convert',{id:q.id,version:q.version,match_id:f.match_id||null,teams:f.teams},'Cotización vinculada. La asignación del fotógrafo se realiza desde Partidos.','form:convert');}
  if(action==='delivery-correction'){var d=find('deliveries',mid);D.forms.delivery={match_id:String(mid),version:d?d.version:0,note:d&&d.correction_note||''};D.focusForm='delivery';api.render();return;}
  if(action==='save-correction'){f=D.forms.delivery;if(!f||!f.note.trim())throw Error('Describe la corrección.');return run('delivery.update',{match_id:f.match_id,version:f.version,action:'correction',note:f.note},'Corrección registrada.','form:delivery');}
  if(action==='delivery-action'){
   var delivery=find('deliveries',mid);if(ds.action==='sent'&&!confirm('¿Confirmas que ya compartiste el enlace con el cliente? TSI registrará el envío, sin mandar un mensaje automáticamente.'))return;
   if(ds.action==='confirmed'&&!confirm('¿El cliente te confirmó que recibió la entrega?'))return;
   return run('delivery.update',{match_id:mid,version:delivery?delivery.version:0,action:ds.action},'Registro de entrega actualizado.');
  }
  if(action==='new-cost'){D.forms.cost={id:crypto.randomUUID(),match_id:String(mid),category:'travel',amount:'',note:'',version:0};D.focusForm='cost';api.render();return;}
  if(action==='edit-cost'){var cost=find('costs',id);D.forms.cost=Object.assign({},cost,{amount:Number(cost.amount_cents)/100});D.focusForm='cost';api.render();return;}
  if(action==='save-cost'){f=D.forms.cost;if(!f)return;return run('cost.save',{id:f.id,match_id:f.match_id,category:f.category,amount_cents:M.cents(f.amount),note:f.note,version:f.version},'Costo guardado.','form:cost');}
  if(action==='delete-cost'){var c=find('costs',id);if(!c||!confirm('¿Eliminar este costo directo? El cambio quedará en la bitácora.'))return;return run('cost.delete',{id:id,version:c.version},'Costo eliminado.');}
  if(action==='allocate'){f=D.forms.allocation;if(!f||!f.expense_id||!f.match_ids.length)throw Error('Selecciona el gasto y las coberturas.');if(f.replace&&!confirm('¿Reemplazar la distribución anterior de este gasto?'))return;return run('expense.allocate',f,'Gasto atribuido sin duplicar su importe.');}
  if(action==='unallocate'){f=D.forms.allocation;if(!f||!f.expense_id)throw Error('Selecciona un gasto.');if(!confirm('¿Retirar la distribución de este gasto? El gasto original se conserva.'))return;return run('expense.unallocate',{expense_id:f.expense_id},'Distribución retirada.');}
  if(action==='all-months'){D.filter.month='';api.render();return;}
  if(action==='open-match'){S.view='dash';S.tab=ds.tab||'cobertura';var m=match(mid);if(m){S.fltField=m.venue||'';S.fltCat=m.cat||'';}api.render();var target=Array.from(document.querySelectorAll('[data-card]')).find(function(c){return c.dataset.card===String(mid);});if(target)target.scrollIntoView({block:'center'});return;}
  if(action==='open-pending'){
   var row=M.pending(S,D.data,api.me(),today()).find(function(r){return r.key===ds.key;});if(!row)return;S.tab=row.tab;if(row.week){S.payWeek=row.week;S.payTouched=true;}D.selected=row.mid||'';D.quoteView=row.quote_id||'';api.render();var selector=row.tab==='entregas'?'s210-delivery-':row.tab==='cotizador'?'s210-quote-':'';var target=selector&&document.getElementById(selector+(row.mid||row.quote_id));if(target)target.scrollIntoView({block:'center'});return;
  }
  if(action==='open-drafts'){S.tab='borradores';api.render();return;}
  if(action==='restore-draft')return restoreDraft(ds.key);
  if(action==='discard-draft'){clearDraft(ds.key);api.render();return;}
  if(action==='more-audit'){
   var last=D.audit[D.audit.length-1],path='/rest/v1/tsi210_audit_log?select=*&order=happened_at.desc&limit=100';if(last)path+='&happened_at=lt.'+encodeURIComponent(last.happened_at);
   var more=await api.sb('GET',path);D.audit=D.audit.concat(more);if(!more.length)D.message='No hay registros anteriores.';api.render();return;
  }
  if(action==='backup')return makeBackup();if(action==='verify-backup')return verifyBackup();
 }
 document.addEventListener('input',capture);
 document.addEventListener('change',function(e){
  capture(e);var el=e.target;
  if(el.id==='s210-backup-file'){D.verifyFile=el.files&&el.files[0]||null;return;}
  if(el.id==='s210-month'){D.filter.month=el.value;api.render();return;}
  if(el.dataset&&el.dataset['210Allocation']){var f=D.forms.allocation,id=String(el.dataset['210Allocation']);if(f){f.match_ids=f.match_ids.filter(function(v){return v!==id;});if(el.checked)f.match_ids.push(id);}return;}
  if(el.dataset&&el.dataset['210Form']==='quote'&&el.dataset['210Key']==='rate_id'){
   var r=find('rates',el.value);if(r&&D.forms.quote){D.forms.quote.price=Number(r.price_cents)/100;D.forms.quote.scope=r.description;api.render();}
  }
 });
 document.addEventListener('input',function(e){var el=e.target,group=el.dataset&&el.dataset['210Search'];if(!group)return;var query=el.value.toLocaleLowerCase('es');document.querySelectorAll('[data-210-search-row]').forEach(function(row){if(row.dataset['210SearchRow']===group)row.hidden=!(row.dataset.search||'').includes(query);});});
 document.addEventListener('click',function(e){var el=e.target.closest&&e.target.closest('[data-210-action]');if(!el||D.busy)return;Promise.resolve(action(el.dataset['210Action'],el)).catch(function(error){D.error=error.message;D.busy=false;api.render();});});
 function tabs(role){var keys=role==='admin'?['cotizador','rentabilidad','clientes','entregas','pendientes','borradores','registro','recuperacion']:role==='foto'?['cotizador','clientes','entregas','pendientes','borradores']:role==='editora'?['entregas','pendientes','borradores']:[];return keys.map(function(k){return [k,labels[k]];});}
 function beforeRender(){
  var owner=userKey();if(owner===D.owner)return;D={owner:owner,data:null,busy:false,loading:false,error:'',message:'',forms:{},pending:null,filter:{},selected:'',quoteView:'',audit:[],verified:null};drafts={};pendingCore={};if(!owner)return;
  readDrafts();try{var pending=JSON.parse(localStorage.getItem(storageKey('pending'))||'null');if(pending&&typeof pending.operation==='string'&&pending.payload&&pending.request_id)D.pending=pending;}catch(e){}
 }
 function afterRender(){
  var u=api.me();if(!u||!['admin','foto','editora'].includes(u.role)||S.view!=='dash')return;
  if(!D.data&&!D.loading&&!D.error)load(false);
  var price=document.getElementById('s210-quote-price');if(price&&!admin())price.readOnly=true;
  if(D.focusForm){var field=document.querySelector('[data-210-form="'+D.focusForm+'"]');D.focusForm='';if(field){var parent=field.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}field.scrollIntoView({block:'center'});field.focus({preventScroll:true});}}
 }
 function renderTab(tab){
  if(!tabs(api.me().role).some(function(t){return t[0]===tab;}))return empty('Esta sección no está disponible para tu perfil.');
  if(tab==='borradores')return controls()+draftList();
  if(!D.data)return controls()+panel(labels[tab],empty(D.loading?'Cargando herramientas…':'No se cargaron los datos. Usa Actualizar para reintentar.'));
  var routes={cotizador:quotes,rentabilidad:profitability,clientes:teams,entregas:deliveries,pendientes:pendings,registro:audit,recuperacion:recovery};return controls()+routes[tab]();
 }
 function directMonthly(month){if(!D.data||!admin())return 0;return D.data.costs.filter(function(c){var m=match(c.match_id);return !c.source_expense_id&&m&&m.date.slice(0,7)===month;}).reduce(function(n,c){return n+Number(c.amount_cents)/100;},0);}
 function confirmCore(snapshots){
  Object.keys(pendingCore).forEach(function(mid){if(snapshots[mid]){clearDraft(pendingCore[mid]);delete pendingCore[mid];}});
  Object.keys(drafts).filter(function(k){return k.startsWith('coverage:');}).forEach(function(k){var draft=drafts[k],saved=snapshots[draft.value.mid];if(!saved)return;try{var cov=JSON.parse(saved).cov;if(!cov)return;var same=Object.keys(draft.value.values).every(function(field){var a=draft.value.values[field],b=cov[field];if(field==='coordinatorWa')return String(a).replace(/\D/g,'')===String(b||'');return String(a).trim()===String(b==null?'':b).trim()||a===''&&Number(b)===0;});if(same)clearDraft(k);}catch(e){}});
 }
 return {tabs,hasTab:function(tab){return Object.prototype.hasOwnProperty.call(labels,tab);},renderTab,beforeRender,afterRender,draftBanner,directMonthly,confirmCore,
  trackCoreSave:function(mid,key){pendingCore[String(mid)]=key;},avisoSaved:function(){clearDraft('core:aviso');},
  diagnostics:function(){return {data:D.data,pending:D.pending,drafts:drafts,error:D.error,forms:D.forms};}};
};
})(typeof globalThis!=='undefined'?globalThis:this);
