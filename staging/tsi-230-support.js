(function (global) {
 'use strict';
 var ctx=null,host=null,mode='public',opened=false,busy=false,error='',session=null,thread=null,messages=[],queue=[],draft='',summary='',category='',editing=false;
 var staffRows=[],staffThread=null,staffMessages=[],contact=null,staffDrafts={},pendingStaff=null,staffStatus='',staffOffset=0,staffMore=false,avatars={},profileUser='',lastUser='',timer=null,storeKey=null,saveChain=Promise.resolve(),ready=Promise.resolve(),storageOK=true;
 var booking=null,assistantState={},settings={},slots=[],slotsLoading=false,lastSlots=0,quoteDraft={},staffBooking=null,owner=null,staffFormDraft={};
 var STORE='tsi230_support_nksqpoigywfegcbvfhoa',CATS=['Cotización','Entrega','Tienda','Correcciones','Pagos','FAQ','Humano'];
 var QUESTIONS={Cotización:'Deporte, tipo de cobertura, fecha, horario, lugar y equipo o evento.',Entrega:'Evento o partido, fecha y folio de pedido si lo tienes.',Tienda:'Producto o foto, talla o variante y tu duda.',Correcciones:'Evento, fecha, folio de pedido y cambio solicitado.',Pagos:'Folio, fecha, monto aproximado y tu duda. No incluyas datos de tarjeta.',FAQ:'Escribe tu pregunta sobre coberturas, entregas o servicios.',Humano:'Cuéntanos brevemente qué necesitas del equipo.'};
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function uuid(){return global.crypto.randomUUID();}
 function isStaff(){return !!(ctx&&ctx.me&&ctx.me()&&['admin','foto','editora'].indexOf(ctx.me().role)!==-1);}
 function uid(){return isStaff()?String(ctx.me().id):'';}
 function token(){var b=new Uint8Array(32);global.crypto.getRandomValues(b);return Array.from(b,function(x){return x.toString(16).padStart(2,'0');}).join('');}
 function bytes64(bytes){var s='';new Uint8Array(bytes).forEach(function(b){s+=String.fromCharCode(b);});return btoa(s);}
 function from64(s){return Uint8Array.from(atob(s),function(c){return c.charCodeAt(0);});}
 // Non-extractable origin key + encrypted per-tab state. No contacts or plaintext messages in localStorage.
 async function encryptionKey(){
  if(!global.indexedDB||!global.crypto.subtle)throw Error('storage');
  var db=await new Promise(function(resolve,reject){var r=indexedDB.open(STORE,1);r.onupgradeneeded=function(){r.result.createObjectStore('keys');};r.onsuccess=function(){resolve(r.result);};r.onerror=function(){reject(r.error);};});
  var key=await new Promise(function(resolve,reject){var r=db.transaction('keys').objectStore('keys').get('session');r.onsuccess=function(){resolve(r.result);};r.onerror=function(){reject(r.error);};});
  if(!key){key=await global.crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await new Promise(function(resolve,reject){var tx=db.transaction('keys','readwrite');tx.objectStore('keys').put(key,'session');tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error);};});}db.close();return key;
 }
 async function restore(){
  try{storeKey=await encryptionKey();var raw=sessionStorage.getItem(STORE);if(!raw)return;var seal=JSON.parse(raw),plain=await global.crypto.subtle.decrypt({name:'AES-GCM',iv:from64(seal.iv)},storeKey,from64(seal.data)),v=JSON.parse(new TextDecoder().decode(plain));
   if(v&&/^[0-9a-f]{64}$/.test(v.token||'')){session={token:v.token};draft=typeof v.draft==='string'?v.draft.slice(0,4000):'';summary=typeof v.summary==='string'?v.summary.slice(0,4000):'';category=CATS.indexOf(v.category)!==-1?v.category:'';queue=Array.isArray(v.queue)?v.queue.slice(0,20):[];opened=!!v.opened;editing=!!v.editing;}
  }catch(e){storageOK=false;try{sessionStorage.removeItem(STORE);}catch(ignore){}}
 }
 function save(){
  var snapshot=session?{token:session.token,draft:draft,summary:summary,category:category,queue:queue,opened:opened,editing:editing}:null;
  saveChain=saveChain.catch(function(){}).then(async function(){try{if(!snapshot){sessionStorage.removeItem(STORE);return;}if(!storeKey)return;var iv=global.crypto.getRandomValues(new Uint8Array(12)),data=await global.crypto.subtle.encrypt({name:'AES-GCM',iv:iv},storeKey,new TextEncoder().encode(JSON.stringify(snapshot)));sessionStorage.setItem(STORE,JSON.stringify({iv:bytes64(iv),data:bytes64(data)}));}catch(e){storageOK=false;}});return saveChain;
 }
 async function request(route,payload,staff){
  if(!ctx)throw Error('Atención está iniciando. Intenta en unos segundos.');
  if(staff){if(!isStaff())throw Error('Entra con una cuenta de equipo.');return ctx.sb('POST','/functions/v1/tsi-support-autonomy/'+route,payload||{});}
  if(!session)throw Error('Registra tu contacto para comenzar.');
  var base=ctx.backendURL||ctx.server;if(base!=='https://nksqpoigywfegcbvfhoa.supabase.co')throw Error('La conexión de atención no está configurada.');
  var r;try{r=await global.fetch(base+'/functions/v1/tsi-support-autonomy/'+route,{method:'POST',headers:{apikey:ctx.publicKey||ctx.publishableKey||'','Content-Type':'application/json','x-support-token':session.token},body:JSON.stringify(payload||{}),cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});}catch(e){throw Error('No hay conexión. Tu mensaje sigue pendiente. Usa Reintentar cuando vuelva.');}
  var j;try{j=await r.json();}catch(e){throw Error('No se pudo confirmar la respuesta. Vuelve a intentar.');}if(!r.ok){var e=Error(j.error||'No se pudo guardar. Intenta otra vez.');e.status=r.status;throw e;}return j;
 }
 function applyPublic(data){if(!data||!data.thread)return;thread=data.thread;messages=data.messages||[];booking=data.booking||null;assistantState=data.assistant_state||{};settings=data.settings||{};if(!editing){category=thread.category||'';summary=thread.summary||'';}error='';save();}
 async function refreshPublic(){if(!session||busy)return;try{applyPublic(await request('history',{}));paint();}catch(e){error=e.message;paint();}}
 async function flush(){
  if(busy||!queue.length||!session)return;busy=true;paint();
  try{while(queue.length){var q=queue[0];applyPublic(await request(q.route,q.payload));queue.shift();await save();}error='';}
  catch(e){error=e.message;if(queue[0]&&queue[0].route==='register'&&[400,401,403].indexOf(e.status)!==-1){session=null;queue=[];save();}}
  finally{busy=false;paint();if(assistantState.show_booking&&!thread?.bot_paused&&Date.now()-lastSlots>60000)loadSlots();}
 }
 function enqueue(route,payload){if(queue.length>=20){error='Tienes 20 solicitudes pendientes. Reintenta el envío antes de escribir más.';paint();return;}queue.push({route:route,payload:Object.assign({},payload,{request_id:uuid()})});save().then(flush);paint();}
 function date(v){try{return new Date(v).toLocaleString('es-MX',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return '';}}
 function historyHtml(rows,staff){return rows.map(function(m){return '<div class="ts230-msg ts230-'+esc(m.kind)+'"><b>'+esc(m.kind==='client'?(staff?'Cliente':'Tú'):m.author_name)+'</b><p>'+esc(m.text)+'</p><time>'+esc(date(m.created_at))+'</time></div>';}).join('');}
 function publicHtml(){
  if(!session)return '<div class="ts230-intro"><span class="ts230-mascot" aria-hidden="true">📷</span><h3>¡Hola! Soy TABI 👋</h3><p>Tu asistente virtual de Tanabi. Te ayudo con paquetes, cotizaciones, disponibilidad y seguimiento. ¡Vamos a capturar tu siguiente jugada! 🏈✨</p></div><form data-ts230="register" class="ts230-form"><label>Tu nombre<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label><label>Correo electrónico<input name="email" type="email" autocomplete="email" maxlength="254" placeholder="correo@ejemplo.com"></label><label>WhatsApp<input name="phone" type="tel" autocomplete="tel" maxlength="40" required pattern="[+0-9 ().-]{10,40}" placeholder="10 a 15 dígitos"></label><p class="ts230-hint">Comparte tu WhatsApp para dar seguimiento; el correo es opcional. Este registro no crea una cuenta.</p><label class="ts230-consent"><input name="consent" type="checkbox" required> Acepto que Tanabi use estos datos para responder a esta solicitud.</label><button class="ts230-primary" '+(busy?'disabled':'')+'>Comenzar conversación</button></form>';
  var html='<div class="ts230-ticket"><b>'+esc(thread?thread.folio:'Confirmando registro…')+'</b><span>'+esc(thread?thread.status:'Sin confirmar')+'</span></div>';
  if(!thread)return html+'<p class="ts230-note">Conservamos esta solicitud para volver a intentar con la misma autorización. Si la sesión venció, puedes comenzar una conversación nueva.</p><button data-ts230-action="retry">Reintentar conexión</button><button class="ts230-link" data-ts230-action="new">Comenzar otra conversación</button>';
  if(!storageOK)html+='<p class="ts230-note">Este navegador no permite guardar la sesión de forma protegida. Mantén esta pestaña abierta para conservar tu conversación.</p>';
  html+='<div class="ts230-history" role="log" aria-live="polite" aria-label="Historial de conversación">'+historyHtml(messages,false)+(queue.length?'<p class="ts230-note">⏳ '+queue.length+' solicitud(es) pendiente(s) de confirmar.</p>':'')+'</div>';
  if(!thread.bot_paused)html+='<div class="ts230-categories" aria-label="¿En qué te ayudo?">'+[['Paquetes','¿Qué paquetes y precios tienen?'],['Cotizar','Quiero cotizar una cobertura'],['Disponibilidad','Consultar disponibilidad'],['Mi seguimiento','Consultar mi seguimiento'],['Anticipo','¿Cómo pago el anticipo?'],['Hablar con el equipo','Quiero hablar con una persona']].map(function(row){return '<button type="button" data-ts231-intent="'+esc(row[1])+'" '+(busy?'disabled':'')+'>'+esc(row[0])+'</button>';}).join('')+'</div>';
  html+=bookingHtml(booking,false);
  if(assistantState.show_booking&&!thread.bot_paused&&(!booking||booking.status==='Cotizada'))html+=quoteHtml();
  html+='<form data-ts230="message" class="ts230-compose"><label class="ts230-sr" for="ts230-message">Mensaje para el equipo</label><textarea id="ts230-message" name="text" rows="2" maxlength="4000" placeholder="Escribe un mensaje…" required>'+esc(draft)+'</textarea><button class="ts230-primary" '+(busy?'disabled':'')+'>Enviar</button></form><p class="ts230-hint">'+(thread&&thread.bot_paused?'El equipo está atendiendo tu conversación. TABI está en pausa.':'TABI es tu asistente virtual 📷. Puedes consultar, cotizar y confirmar coberturas disponibles.')+'</p><button class="ts230-link" data-ts230-action="new">Cerrar esta sesión de atención</button>';
  return html;
 }

 function amount(v){return '$'+Number(v||0).toLocaleString('es-MX')+' MXN';}
 function safeLink(v){try{var x=new URL(v);return x.protocol==='https:'&&!x.username&&!x.password?x.href:'';}catch(e){return '';}}
 function bookingHtml(b,staff){
  if(!b)return '';
  var link=safeLink(b.delivery_url),h='<section class="ts231-booking"><h3>📷 '+esc(b.folio)+'</h3><p>'+esc(b.team)+' · '+esc(b.sport)+' · '+esc(b.package)+' · '+esc(b.players)+' jugador(es)</p><dl><dt>Estado</dt><dd>'+esc(b.status)+'</dd><dt>Total</dt><dd>'+amount(b.total)+'</dd><dt>'+(b.package==='individual'?'Pago completo':'Anticipo mínimo')+'</dt><dd>'+(b.deposit==null?'Pendiente de configurar':amount(b.deposit))+'</dd><dt>Pago registrado</dt><dd>'+amount(b.paid)+'</dd><dt>Descuento autorizado</dt><dd>'+amount(b.discount)+'</dd><dt>Saldo</dt><dd>'+amount(b.balance)+'</dd><dt>Avance</dt><dd>'+esc(b.progress)+'</dd></dl>';
  if(link)h+='<a class="ts231-delivery" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">📦 Abrir entrega</a>';
  h+='<p class="ts230-hint">Entrega de lunes a miércoles posteriores al juego. Acceso al campo aparte cuando tenga costo.</p>';
  if(!staff&&b.status==='Cotizada')h+='<form data-ts230="confirm" class="ts230-form"><label class="ts230-consent"><input name="terms" type="checkbox" required> Confirmo los datos. Acepto que, si cancelo dentro de las 12 horas previas al juego, el anticipo no es reembolsable. Las cancelaciones las revisa el personal.</label><button class="ts230-primary" '+(busy||b.deposit==null?'disabled':'')+'>Confirmar cobertura</button></form>';
  if(!staff&&b.status==='Confirmada'){
   if(Number(b.balance)>0){var due=Math.min(Number(b.balance),Number(b.paid)<Number(b.deposit)?Number(b.deposit)-Number(b.paid):Number(b.balance));h+='<button type="button" class="ts230-primary" data-ts230-action="stripe-pay" '+(busy?'disabled':'')+'>Pagar '+amount(due)+' · Stripe de prueba</button>';}
   h+='<button type="button" data-ts230-action="stripe-refresh" '+(busy?'disabled':'')+'>Actualizar pago</button><p class="ts230-hint">🧪 Stripe está en modo de prueba. No se realizan cargos reales.</p>';
  }
  return h+'</section>';
 }
 function quoteHtml(){
  var q=Object.assign({},assistantState,quoteDraft),sport=q.sport||'flag',pack=q.package||'equipo',count=q.players||(pack==='individual'?1:sport==='flag'?6:12);
  var choices=slots.filter(function(m){return m.sport===sport;});
  return '<details class="ts231-quote" open><summary>🏈 Prepara tu cotización</summary><form data-ts230="quote" class="ts230-form"><label>Deporte<select name="sport"><option value="flag" '+(sport==='flag'?'selected':'')+'>Flag</option><option value="tackle" '+(sport==='tackle'?'selected':'')+'>Tackle</option></select></label><label>Paquete<select name="package"><option value="equipo" '+(pack==='equipo'?'selected':'')+'>Equipo completo</option><option value="individual" '+(pack==='individual'?'selected':'')+'>Individual</option></select></label><label>Jugadores<input name="players" type="number" min="1" max="100" value="'+esc(count)+'" required></label><label>Equipo / jugador<input name="team" minlength="2" maxlength="120" required value="'+esc(q.team||'')+'" autocomplete="off"></label><label>Partido con fotógrafo<select name="match_id" required><option value="">Selecciona un partido</option>'+choices.map(function(m){return '<option value="'+esc(m.id)+'" '+(q.match_id===m.id?'selected':'')+'>'+esc(m.date+' '+m.time+' · '+m.teams+' · '+m.venue)+'</option>';}).join('')+'</select></label><p class="ts230-hint">'+(slotsLoading?'Consultando disponibilidad…':choices.length?'Los importes y la asignación se verifican nuevamente al confirmar.':'No hay partidos de esta modalidad con fotógrafo asignado. Puedes actualizar o hablar con el equipo.')+'</p><button type="button" data-ts230-action="slots">Actualizar partidos</button><button class="ts230-primary" '+(busy||!choices.length?'disabled':'')+'>Generar cotización</button></form></details>';
 }
 async function loadSlots(){if(slotsLoading||!session)return;slotsLoading=true;paint();try{var r=await request('slots',{});slots=r.slots||[];lastSlots=Date.now();}catch(e){error=e.message;}finally{slotsLoading=false;paint();}}
 function staffBookingHtml(){
  if(!staffBooking)return '';
  var b=staffBooking,d=staffFormDraft[b.id]||{};
  return bookingHtml(b,true)+'<details class="ts231-quote"><summary>Actualizar pago y entrega</summary><form data-ts230="staff-booking" class="ts230-form"><label>Total recibido (acumulado)<input name="paid" type="number" min="0" step="0.01" value="'+esc(d.paid??b.paid)+'" required></label>'+(ctx.me().role==='admin'?'<label>Descuento autorizado<input name="discount" type="number" min="0" step="0.01" value="'+esc(d.discount??b.discount)+'"></label>':'')+'<label>Avance<select name="progress">'+['Programada','En edición','Lista','Entregada'].map(function(v){return '<option '+((d.progress||b.progress)===v?'selected':'')+'>'+v+'</option>';}).join('')+'</select></label><label>Enlace privado de entrega<input name="delivery_url" type="url" value="'+esc(d.delivery_url??b.delivery_url)+'" placeholder="https://…"></label><p class="ts230-hint">Estos importes sirven para seguimiento. No generan un segundo cobro ni un registro duplicado de caja.</p><button '+(busy?'disabled':'')+'>Guardar seguimiento</button></form></details>';
 }


 async function stripePay(refresh){
  if(busy||!session)return;busy=true;error='';paint();
  try{
   var r=await request(refresh?'payment-status':'checkout',refresh?{}:{request_id:uuid()});
   if(refresh)applyPublic(r);
   else if(r.checkout_url){var url=new URL(r.checkout_url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw Error('El enlace de pago no es válido.');await save();global.location.assign(url.href);}
   else{applyPublic(await request('history',{}));if(r.payment_status==='unpaid')error='El pago sigue pendiente de confirmación.';}
  }catch(e){error=e.message;}finally{busy=false;paint();}
 }

 function staffHtml(){
  if(!isStaff())return '<p>Entra con tu cuenta de administración, fotografía o edición para abrir la bandeja.</p>';
  if(staffThread){var t=staffThread;return '<button data-ts230-action="back">← Bandeja compartida</button><div class="ts230-ticket"><b>'+esc(t.folio)+'</b><span>'+esc(t.status)+'</span></div><div class="ts230-contact"><b>'+esc(contact&&contact.name)+'</b><span>'+esc(contact&&contact.email)+'</span><span>'+esc(contact&&contact.phone)+'</span><small>Contacto privado · solo equipo</small></div><p class="ts230-hint">'+esc(t.category)+' · '+(t.bot_paused?'TABI en pausa':'Tu primera respuesta pausará TABI')+'</p>'+'<p class="ts230-hint">Responsable: '+esc(owner&&owner.name||'Sin asignar')+'</p><div class="ts230-actions"><button data-ts230-action="claim" '+(busy?'disabled':'')+'>Tomar conversación</button><button data-ts230-action="resume" '+(busy?'disabled':'')+'>Devolver a TABI</button></div>'+staffBookingHtml()+(t.summary?'<details class="ts230-summary"><summary>Resumen</summary><p>'+esc(t.summary)+'</p></details>':'')+'<div class="ts230-history" role="log" aria-live="polite">'+historyHtml(staffMessages,true)+'</div><form data-ts230="staff-message" class="ts230-compose"><textarea name="text" rows="3" maxlength="4000" placeholder="Responder como '+esc(ctx.me().name||'equipo')+'…" required>'+esc(staffDrafts[t.id]||'')+'</textarea><button class="ts230-primary" '+(busy?'disabled':'')+'>Responder</button></form><div class="ts230-actions">'+['Por atender','En atención','Resuelta'].map(function(s){return '<button data-ts230-status="'+s+'" '+(s===t.status||busy?'disabled':'')+'>'+s+'</button>';}).join('')+'</div>';
  }
  return '<p class="ts230-hint">Administración, fotografía y edición comparten esta bandeja. Cada respuesta conserva su autor.</p><label>Estado<select data-ts230-filter><option value="">Todos</option>'+['Por atender','En atención','Resuelta'].map(function(s){return '<option '+(staffStatus===s?'selected':'')+'>'+s+'</option>';}).join('')+'</select></label><div class="ts230-list">'+(staffRows.length?staffRows.map(function(t){return '<button data-ts230-thread="'+esc(t.id)+'"><span><b>'+esc(t.contact_name)+'</b><small>'+esc(t.folio)+' · '+esc(t.category||'Sin categoría')+' · '+esc(t.owner_name||'Sin responsable')+'</small></span><span class="ts230-badge">'+esc(t.status)+'</span><small>'+esc(date(t.updated_at))+'</small></button>';}).join(''):'<p>No hay conversaciones en este estado.</p>')+'</div><div class="ts230-actions"><button data-ts230-action="prev" '+(!staffOffset?'disabled':'')+'>Anterior</button><button data-ts230-action="next" '+(!staffMore?'disabled':'')+'>Siguiente</button><button data-ts230-action="refresh">Actualizar</button></div>';
 }
 function profileHtml(){if(!isStaff())return '<p>Entra con tu cuenta de equipo para cambiar tu foto.</p>';var a=avatars[uid()]||'';return '<div class="ts230-profile">'+(a?'<img src="'+esc(a)+'" alt="Tu foto de perfil">':'<span class="ts230-profile-initial">'+esc((ctx.me().name||'T').slice(0,1))+'</span>')+'<h3>'+esc(ctx.me().name||'Mi perfil')+'</h3><p>Esta foto identifica tu cuenta en el equipo.</p><label class="ts230-primary ts230-file">Elegir foto<input type="file" data-ts230-avatar accept="image/png,image/jpeg" '+(busy?'disabled':'')+'></label><p class="ts230-hint">PNG o JPEG. Ajustaremos tu imagen a un retrato cuadrado de 256 píxeles.</p><button data-ts230-action="remove-avatar" '+(!a||busy?'disabled':'')+'>Quitar foto</button></div>';}
 function paint(){
  if(!host)return;
  var qf=host.querySelector('form[data-ts230="quote"]');if(qf)Array.from(qf.elements).forEach(function(el){if(el.name)quoteDraft[el.name]=el.value;});
  var active=host.contains(document.activeElement)?document.activeElement:null,field=active&&(active.name||active.getAttribute('data-ts230-filter')),selection=active&&active.selectionStart;
  var wasBottom=true,oldLog=host.querySelector('.ts230-history'),scrollTop=oldLog&&oldLog.scrollTop;if(oldLog)wasBottom=oldLog.scrollHeight-oldLog.clientHeight-oldLog.scrollTop<60;
  host.className='ts230-support'+(opened?' is-open':'');host.innerHTML='<button class="ts230-bubble" data-ts230-action="open" aria-label="Abrir conversación con TABI" '+(opened?'hidden':'')+'><span aria-hidden="true">💬</span><span>TABI</span>'+(queue.length?'<i aria-label="Mensajes pendientes">'+queue.length+'</i>':'')+'</button>'+(opened?'<section class="ts230-panel '+(mode==='staff'?'ts230-wide':'')+'" role="dialog" aria-modal="false" aria-labelledby="ts230-heading"><header><span class="ts230-brand" aria-hidden="true">📷</span><div><h2 id="ts230-heading">'+(mode==='staff'?'Atención · Equipo':mode==='profile'?'Mi foto de perfil':'TABI')+'</h2><small>'+(mode==='public'?'Asistente virtual de Tanabi':mode==='staff'?'Bandeja compartida':'Cuenta de equipo')+'</small></div><button data-ts230-action="minimize" aria-label="Minimizar conversación">−</button></header><div class="ts230-body" '+(busy?'aria-busy="true"':'')+'>'+(error?'<div class="ts230-error" role="alert">'+esc(error)+' <button data-ts230-action="retry">Reintentar</button></div>':'')+(mode==='staff'?staffHtml():mode==='profile'?profileHtml():publicHtml())+'</div></section>':'');
  if(field){var f=field==='text'?host.querySelector('textarea[name="text"]'):field==='summary'?host.querySelector('textarea[name="summary"]'):host.querySelector('[name="'+field+'"]');if(f){f.focus({preventScroll:true});if(typeof selection==='number'&&f.setSelectionRange)f.setSelectionRange(selection,selection);}}
  var log=host.querySelector('.ts230-history');if(log)log.scrollTop=wasBottom?log.scrollHeight:scrollTop||0;
  var inline=isStaff()&&mode==='staff'&&ctx.state&&ctx.state.tab==='atencion';host.classList.toggle('ts231-inline',inline);host.hidden=isStaff()&&!inline&&mode!=='profile';if(inline){var bubble=host.querySelector('.ts230-bubble');if(bubble)bubble.hidden=true;var panel=host.querySelector('.ts230-panel');if(panel)panel.setAttribute('role','region');var close=host.querySelector('[data-ts230-action="minimize"]');if(close)close.hidden=true;}
 }
 async function staffLoad(id){
  if(!isStaff())return;var expected=uid();busy=true;error='';paint();
  try{var data=await request(id?'staff-thread':'staff-list',id?{thread_id:id}:{offset:staffOffset,status:staffStatus},true);if(uid()!==expected)return;
   if(id){staffThread=data.thread;staffMessages=data.messages||[];contact=data.contact||null;staffBooking=data.booking||null;owner=data.owner||null;}else{staffThread=null;staffMessages=[];contact=null;staffRows=(data.threads||[]).slice(0,50);staffMore=(data.threads||[]).length>50;}
  }catch(e){error=e.message;}finally{busy=false;paint();}
 }
 async function staffMutation(route,payload){var expected=uid();pendingStaff={route:route,payload:payload,user:expected};busy=true;error='';paint();try{var r=await request(route,payload,true);if(uid()!==expected)return;staffThread=r.thread;staffMessages=r.messages||[];contact=r.contact||null;staffBooking=r.booking||null;owner=r.owner||null;if(route==='staff-booking'&&staffBooking)delete staffFormDraft[staffBooking.id];pendingStaff=null;if(route==='staff-message')delete staffDrafts[payload.thread_id];}catch(e){error=e.message;}finally{busy=false;paint();}}
 function avatarEvent(id,value){avatars[id]=value;global.dispatchEvent(new CustomEvent('tsi230:avatar',{detail:{userId:id,avatar:value}}));}
 async function loadProfile(){if(!isStaff())return;var id=uid();try{var r=await request('profile',{},true);if(id!==uid())return;profileUser=id;avatarEvent(id,r.avatar||'');if(mode==='profile')paint();}catch(e){if(mode==='profile'){error=e.message;paint();}}}
 async function saveAvatar(value){var id=uid();busy=true;error='';paint();try{var r=await request('avatar',{avatar:value},true);if(id!==uid())return;avatarEvent(id,r.avatar||'');}catch(e){error=e.message;}finally{busy=false;paint();}}
 async function resizeAvatar(file){
  if(!file||!['image/png','image/jpeg'].includes(file.type)||file.size>10000000)throw Error('Elige una foto PNG o JPEG de hasta 10 MB.');
  var url=URL.createObjectURL(file);try{var image=await new Promise(function(resolve,reject){var im=new Image();im.onload=function(){resolve(im);};im.onerror=function(){reject(Error('No pudimos leer esta imagen.'));};im.src=url;});if(image.width<16||image.height<16)throw Error('Elige una foto de al menos 16 píxeles por lado.');var canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;var size=Math.min(image.width,image.height);canvas.getContext('2d').drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,256,256);return canvas.toDataURL('image/jpeg',0.85);}finally{URL.revokeObjectURL(url);}
 }
 function mount(){if(host&&document.body.contains(host))return;host=document.createElement('div');host.id='tsi230-support-root';document.body.appendChild(host);
  host.addEventListener('input',function(e){var sf=e.target.closest('form[data-ts230="staff-booking"]');if(sf&&staffBooking){var sd=staffFormDraft[staffBooking.id]||(staffFormDraft[staffBooking.id]={});if(e.target.name)sd[e.target.name]=e.target.value;}if(e.target.name==='text'){if(mode==='staff'&&staffThread)staffDrafts[staffThread.id]=e.target.value;else{draft=e.target.value;save();}}if(e.target.name==='summary'){summary=e.target.value;editing=true;save();}});
  host.addEventListener('change',async function(e){
   var qf=e.target.closest('form[data-ts230="quote"]');if(qf&&['sport','package'].includes(e.target.name)){Array.from(qf.elements).forEach(function(el){if(el.name)quoteDraft[el.name]=el.value;});quoteDraft.players=quoteDraft.package==='individual'?1:quoteDraft.sport==='flag'?6:12;quoteDraft.match_id='';qf.remove();paint();}
if(e.target.matches('[data-ts230-filter]')){staffStatus=e.target.value;staffOffset=0;staffLoad();}if(e.target.matches('[data-ts230-avatar]')){try{await saveAvatar(await resizeAvatar(e.target.files[0]));}catch(err){error=err.message;paint();}}});
  host.addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.hasAttribute('data-ts231-intent')){enqueue('message',{text:b.getAttribute('data-ts231-intent')});return;}
   if(b.hasAttribute('data-ts230-category')){category=b.getAttribute('data-ts230-category');summary='';editing=true;enqueue('category',{category:category});return;}
   if(b.hasAttribute('data-ts230-thread')){staffLoad(b.getAttribute('data-ts230-thread'));return;}
   if(b.hasAttribute('data-ts230-status')&&staffThread){staffMutation('staff-status',{thread_id:staffThread.id,status:b.getAttribute('data-ts230-status'),request_id:uuid()});return;}
   var a=b.getAttribute('data-ts230-action');if(a==='open')api.open();if(a==='minimize'){opened=false;save();paint();}if(a==='retry'){error='';if(mode==='staff'){if(pendingStaff&&pendingStaff.user===uid())staffMutation(pendingStaff.route,pendingStaff.payload);else staffLoad(staffThread&&staffThread.id);}else if(mode==='profile')loadProfile();else if(queue.length)flush();else refreshPublic();}
   if(a==='edit-summary'){editing=true;summary=thread.summary;category=thread.category;paint();save();}
   if(a==='save-draft'){var f=host.querySelector('form[data-ts230="summary"]');if(f.reportValidity()){summary=f.elements.summary.value;enqueue('draft',{category:category,summary:summary});}}
   if(a==='new'&&global.confirm('¿Cerrar esta sesión de atención? Tu historial quedará con el equipo y no se podrá abrir desde esta pestaña sin la sesión actual.')){session=null;thread=null;messages=[];queue=[];booking=null;assistantState={};slots=[];quoteDraft={};draft='';summary='';category='';editing=false;error='';save();paint();}
   if(a==='stripe-pay')stripePay(false);if(a==='stripe-refresh')stripePay(true);
   if(a==='slots')loadSlots();
   if(a==='claim'&&staffThread)staffMutation('staff-claim',{thread_id:staffThread.id,request_id:uuid()});
   if(a==='resume'&&staffThread)staffMutation('staff-resume',{thread_id:staffThread.id,request_id:uuid()});
   if(a==='back'||a==='refresh')staffLoad();if(a==='prev'){staffOffset=Math.max(0,staffOffset-50);staffLoad();}if(a==='next'){staffOffset+=50;staffLoad();}if(a==='remove-avatar')saveAvatar('');
  });
  host.addEventListener('submit',async function(e){var f=e.target;if(!f.matches('form[data-ts230]'))return;e.preventDefault();if(busy)return;
   var type=f.getAttribute('data-ts230');if(type==='register'){
    var p={name:f.elements.name.value,email:f.elements.email.value,phone:f.elements.phone.value,consent:f.elements.consent.checked,request_id:uuid()};if(!p.phone){error='Escribe tu WhatsApp para que podamos responderte.';var box=document.createElement('p');box.className='ts230-error';box.role='alert';box.textContent=error;f.prepend(box);return;}
    session={token:token()};error='';enqueue('register',p);
   }else if(type==='quote'){
    quoteDraft={sport:f.elements.sport.value,package:f.elements.package.value,players:Number(f.elements.players.value),team:f.elements.team.value.trim(),match_id:f.elements.match_id.value};
    enqueue('quote',quoteDraft);
   }else if(type==='confirm'&&booking){if(f.elements.terms.checked)enqueue('confirm',{booking_id:booking.id,accept_terms:true});}
   else if(type==='staff-booking'&&staffThread){
    var bp={thread_id:staffThread.id,paid:Number(f.elements.paid.value),progress:f.elements.progress.value,delivery_url:f.elements.delivery_url.value.trim(),request_id:uuid()};
    if(ctx.me().role==='admin')bp.discount=Number(f.elements.discount.value);
    staffMutation('staff-booking',bp);
   }else if(type==='message'){var text=f.elements.text.value.trim();if(!text)return;draft='';enqueue('message',{text:text});}
   else if(type==='summary'){summary=f.elements.summary.value.trim();editing=false;enqueue('submit',{category:category,summary:summary});}
   else if(type==='staff-message'&&staffThread){if(pendingStaff){error='Hay una respuesta pendiente de confirmar. Usa Reintentar antes de enviar otra.';paint();return;}staffMutation('staff-message',{thread_id:staffThread.id,text:f.elements.text.value,request_id:uuid()});}
  });
 }
 function identityCheck(){var id=uid();if(id!==lastUser){lastUser=id;staffRows=[];staffThread=null;staffMessages=[];staffDrafts={};pendingStaff=null;contact=null;error='';avatars={};profileUser='';staffBooking=null;owner=null;staffFormDraft={};if(mode!=='public'){opened=false;mode='public';paint();}if(id)loadProfile();}}
 var api={install:function(options){ctx=options;mount();ready=restore().then(function(){identityCheck();paint();if(session){if(queue.length)flush();else if(new URL(global.location.href).searchParams.has('tabi_payment')){opened=true;stripePay(true);var returnUrl=new URL(global.location.href);returnUrl.searchParams.delete('tabi_payment');global.history.replaceState(null,'',returnUrl.href);}else refreshPublic();}});clearInterval(timer);timer=setInterval(function(){identityCheck();if(document.hidden||busy)return;if(mode==='staff'&&opened&&isStaff())staffLoad(staffThread&&staffThread.id);else if(mode==='public'&&session){if(queue.length)flush();else refreshPublic();}},30000);return api;},
  open:function(){if(isStaff()){api.openStaff();return;}ready.then(function(){mode='public';opened=true;error='';mount();paint();save();if(session){if(queue.length)flush();else refreshPublic();}});},
  openStaff:function(){ready.then(function(){identityCheck();if(!isStaff())return;mode='staff';opened=true;ctx.state.view='dash';ctx.state.tab='atencion';if(ctx.render)ctx.render();mount();var target=document.querySelector('[data-ts231-inbox]');if(target)target.appendChild(host);paint();staffLoad();});},
  openProfile:function(){ready.then(function(){identityCheck();mode='profile';opened=true;mount();paint();loadProfile();});},
  getAvatar:function(id){return avatars[id||uid()]||'';},afterRender:function(){if(ctx){mount();identityCheck();if(isStaff()&&ctx.state&&ctx.state.view==='dash'&&ctx.state.tab==='atencion'){mode='staff';opened=true;var target=document.querySelector('[data-ts231-inbox]');if(target)target.appendChild(host);paint();if(!staffRows.length&&!staffThread&&!busy)staffLoad();}else paint();}},_testing:{questions:QUESTIONS,categories:CATS}};
 global.TSI230Support=api;
 global.addEventListener('tsi230:support',function(e){if(e.detail&&e.detail.staff)api.openStaff();else api.open();});
 global.addEventListener('tsi230:profile',function(){api.openProfile();});
 global.addEventListener('online',function(){if(queue.length)flush();});
 global.addEventListener('visibilitychange',function(){if(!document.hidden){identityCheck();if(mode==='public'&&session)refreshPublic();}});
})(window);
