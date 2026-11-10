// Server-owned knowledge and dialogue state. Customer text never supplies prices or permissions.
export const PACKAGES=Object.freeze({flag:{price:200,min:6,deposit:600},tackle:{price:250,min:12,deposit:750},individual:{price:650}});
export function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
const money=n=>'$'+Number(n).toLocaleString('es-MX')+' MXN';
const packages='📷 Flag: $200 por jugador (mínimo 6). Tackle: $250 por jugador (mínimo 12). En equipo: más de 80 fotos y 2 reels por equipo.\n🌟 Individual: $650 (pago completo), entre 25 y 35 fotos y 1 video.\n📦 Entrega de lunes a miércoles posteriores al juego. El acceso al campo no está incluido cuando tenga costo.';
export function answer(text,previous={},snapshot={}){
 const s=normalize(text),state={...previous};let replies=[],handoff=false;state.show_booking=!!state.show_booking;
 if(/\b(flag|tocho)\b/.test(s))state.sport='flag';else if(/\b(tackle|americano)\b/.test(s))state.sport='tackle';
 if(/\bindividual\b/.test(s))state.package='individual';else if(/\b(equipo|grupal)\b/.test(s))state.package='equipo';
 const players=s.match(/\b(\d{1,3})\s*(jugadores?|ninos?|personas?|integrantes?)\b/);if(players&&+players[1]>=1&&+players[1]<=100)state.players=+players[1];
 const b=snapshot.booking;
 if(/\b(queja|reclamo|reclamar|demanda|reembolso|devolucion|devolver|cancelar|cancelacion|cancela|cobro indebido|no reconozco|privacidad|datos personales|retir[ae]r? foto|borrar foto|faltan fotos|fotos faltantes|urgente|humano|persona|asesor|personal|encargado|corregir|correccion)\b/.test(s)){
  handoff=true;replies.push('🙋 Voy a pasar tu conversación al equipo para revisar tu caso. Conservamos el historial y el folio; no necesitas repetir todo. TABI quedará en pausa mientras te atienden.');
  if(/cancel|devol|reembolso/.test(s))replies.push('La condición acordada es: si el cliente cancela dentro de las 12 horas previas al juego, el anticipo no es reembolsable. El personal revisará tu situación; no he cancelado ni emitido un reembolso.');
 }else{
  if(/\b(descuento|promocion|rebaja|barato|precio especial)\b/.test(s))replies.push('Los descuentos los autoriza exclusivamente Administración 😊. Puedo cotizarte con las tarifas vigentes; si necesitas una excepción, pulsa Hablar con el equipo.');
  if(/\b(precio|precios|paquete|paquetes|costo|costos|cuanto|cobran|incluye|incluyen|fotos|videos|reels)\b/.test(s))replies.push(packages);
  if(/\b(entrega|entregan|entregas|cuando|edicion|avance|seguimiento|estado)\b/.test(s)){
   if(b)replies.push('📦 Folio '+b.folio+': '+b.status+'. Avance: '+b.progress+'. Saldo: '+money(b.balance)+'.'+(b.delivery_url?' Tu enlace de entrega ya está disponible en el seguimiento de esta conversación.':' Aún no hay un enlace de entrega registrado.')+' Entregamos entre lunes y miércoles posteriores al juego.');
   else replies.push('📦 Entregamos entre lunes y miércoles posteriores al juego. Todavía no hay una contratación vinculada a esta conversación. Si tu contratación fue por otro medio, el equipo debe verificarla antes de compartir pagos o enlaces privados.');
  }
  if(/\b(anticipo|anticipar|pago|pagos|pagar|transferencia|deposito|saldo|cuenta|clabe|banco)\b/.test(s)){
   replies.push('💳 Para equipos, el anticipo mínimo equivale a 3 jugadores: $600 en flag o $750 en tackle. El paquete individual se paga completo: $650; '+(snapshot.settings?.individual_deposit!=null?'su anticipo configurado es '+money(snapshot.settings.individual_deposit)+'.':'Administración aún debe definir su anticipo.'));
   if(b)replies.push('Tu pago registrado es '+money(b.paid)+' y el saldo es '+money(b.balance)+'. En staging puedes pagar con Stripe de prueba. El importe se registra cuando Stripe confirma el pago; enviar un mensaje o volver desde el checkout no acredita un pago.');
   replies.push(snapshot.settings?.payment_instructions||'Los datos para realizar el pago aún no están configurados. No transfieras a cuentas no verificadas; puedes solicitarlos al equipo.');
  }
  if(/\b(campo|entrada|acceso)\b/.test(s))replies.push('🏟️ El cobro de acceso al campo no está incluido cuando el lugar lo exija. Ese importe se informa por separado; no tengo una tarifa de acceso confirmada.');
  if(/\b(disponibilidad|disponible|disponibles|reservar|reserva|contratar|contratacion|cotizar|cotizacion|confirmar|confirmo|quiero|necesito|busco)\b/.test(s)||players){
   state.show_booking=true;
   if(state.package==='equipo'&&state.sport&&state.players&&state.players<PACKAGES[state.sport].min){
    state.package='individual';state.players=1;
    replies.push('Para equipo completo necesitamos al menos '+PACKAGES[state.sport].min+' jugadores. Puedo ofrecerte el individual de $650, con 25–35 fotos y 1 video 🌟.');
   }
   replies.push('¡Vamos a preparar tu cobertura! 🏈 En el cotizador de abajo puedes elegir únicamente partidos publicados que ya tengan fotógrafo asignado. Revisa deporte, paquete y jugadores; después confirma la cotización. Si tu partido no aparece, el equipo debe revisar la disponibilidad.');
   if(state.sport&&state.package==='equipo'&&state.players)replies.push('Con '+state.players+' jugadores de '+state.sport+', el total estimado es '+money(state.players*PACKAGES[state.sport].price)+' y el anticipo mínimo es '+money(PACKAGES[state.sport].deposit)+'. El importe final se valida al generar la cotización.');
  }
 }
 if(!replies.length){
  if(/^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal)[ !?.👋]*$/.test(s))replies.push('¡Hola! Soy Tabi 📷✨ Puedo ayudarte con paquetes, cotizaciones, partidos disponibles, anticipos y seguimiento. Cuéntame qué necesitas o elige una opción.');
  else if(/\b(gracias|perfecto|excelente|ok|listo)\b/.test(s))replies.push('¡Con gusto! 📷✨ Aquí sigo si quieres cotizar, revisar tu seguimiento o hablar con el equipo.');
  else{
   state.misses=(Number(state.misses)||0)+1;
   if(state.misses>=2){handoff=true;replies.push('No tengo información suficiente para resolverlo con seguridad. Te paso con el equipo y conservo lo que me contaste 🙋.');}
   else replies.push('Quiero ayudarte bien 😊. ¿Tu consulta es sobre paquetes, disponibilidad, pagos o entregas? Si es otro tema, pulsa Hablar con el equipo.');
  }
 }else state.misses=0;
 return {reply:replies.join('\n\n').slice(0,4000),state,handoff};
}
