(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TSI210Model=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function cents(value){var n=Number(value);if(!Number.isFinite(n))throw new Error('El importe no es válido.');return Math.round((n+Number.EPSILON)*100);}
 function money(value){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format((Number(value)||0)/100);}
 function split(amount,weights){
  if(!Number.isSafeInteger(amount)||amount<0||!weights.length||weights.some(function(w){return !Number.isFinite(w)||w<=0;}))throw new Error('Reparto inválido.');
  var sum=weights.reduce(function(a,b){return a+b;},0),out=weights.map(function(w){return Math.floor(amount*w/sum);}),left=amount-out.reduce(function(a,b){return a+b;},0);
  for(var i=0;i<left;i++)out[i%out.length]++;return out;
 }
 function quote(input,rate,isAdmin){
  var quantity=Number(input.quantity),unit=rate.unit,price=Number(rate.price_cents),discount=Number(input.discount_cents)||0;
  if(!rate.active||!Number.isFinite(quantity)||quantity<=0||quantity>10000||Math.round(quantity*100)!==quantity*100&&Math.abs(Math.round(quantity*100)-quantity*100)>1e-8||unit!=='hour'&&!Number.isInteger(quantity))throw new Error('Revisa la tarifa y la cantidad.');
  if(isAdmin&&input.unit_price_cents!==undefined)price=Number(input.unit_price_cents);
  else if(input.unit_price_cents!==undefined&&Number(input.unit_price_cents)!==price)throw new Error('Usa el precio aprobado.');
  var gross=Math.round(quantity*price),limit=isAdmin?gross:Math.floor(gross*Number(rate.max_discount_pct)/100);
  if(!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(discount)||discount<0||discount>gross||discount>limit)throw new Error('El descuento excede lo autorizado.');
  return {gross_cents:gross,discount_cents:discount,total_cents:gross-discount};
 }
 function summarize(match,lines,costs){
  var cov=match.cov||{},gross=cents((Number(cov.players)||0)*(Number(cov.price)||0)),discount=Math.min(gross,Math.max(0,cents(cov.discount||0))),net=gross-discount,paid=cents(cov.paid||0);
  var payroll=0,estimated=0,paidPayroll=0,bonuses=0;
  (lines||[]).filter(function(l){return String(l.mid)===String(match.id);}).forEach(function(l){if(l.estimated)estimated+=l.amount_cents;else payroll+=l.amount_cents;if(l.paid)paidPayroll+=l.amount_cents;if(l.kind==='bonus')bonuses+=l.amount_cents;});
  var direct=(costs||[]).filter(function(c){return String(c.match_id)===String(match.id);}).reduce(function(n,c){return n+Number(c.amount_cents);},0);
  return {id:match.id,gross_cents:gross,discount_cents:discount,net_cents:net,paid_cents:paid,balance_cents:Math.max(0,net-paid),extra_paid_cents:Math.max(0,paid-net),field_cash_cents:(match.cobros||[]).reduce(function(n,c){return n+cents(c.amount||0);},0),payroll_cents:payroll,paid_payroll_cents:paidPayroll,estimated_payroll_cents:estimated,bonus_cents:bonuses,direct_cost_cents:direct,total_cost_cents:payroll+direct,estimated_total_cost_cents:payroll+direct+estimated,profit_cents:net-payroll-direct-estimated,result_on_collections_cents:paid-payroll-direct-estimated,margin_pct:net>0?(net-payroll-direct-estimated)/net*100:null,estimated:estimated>0};
 }
 function payroll(state,helpers){
  var lines=[],seen=new Set();
  Object.keys(state.pays||{}).forEach(function(key){
   var pay=state.pays[key],entries=(pay.lines||[]).filter(function(l){return l.mid!=null;});
   entries.forEach(function(l){var k=key+'|'+String(l.mid);seen.add(k);lines.push({mid:l.mid,uid:key.split('|')[0],amount_cents:cents(l.amount||0),estimated:false,paid:pay.status==='pagado',kind:'salary',source:key});});
   var bonus=(pay.bonus||[]).reduce(function(n,b){return n+cents(b.amount||0);},0);
   if(bonus&&entries.length){var portions=split(bonus,entries.map(function(l){return Math.max(1,Number(l.players)||0);}));entries.forEach(function(l,i){lines.push({mid:l.mid,uid:key.split('|')[0],amount_cents:portions[i],estimated:false,paid:pay.status==='pagado',kind:'bonus',source:key});});}
  });
  var weeks=Array.from(new Set(state.matches.filter(function(m){return m.cov;}).map(function(m){return helpers.mondayOf(m.date);}))),users=state.users||[];
  weeks.forEach(function(week){
   helpers.payeesForWeek(week).forEach(function(u){
    var key=u.id+'|'+week;if(state.pays[key])return;
    var pay=helpers.calcPay(u,week);
    (pay.lines||[]).forEach(function(l){if(!seen.has(key+'|'+String(l.mid))){seen.add(key+'|'+String(l.mid));lines.push({mid:l.mid,uid:u.id,amount_cents:cents(l.amount),estimated:true,paid:false,kind:'salary',source:key});}});
    // La edición sin concluir aún no integra el pago: se muestra como estimación.
    if(u.role==='editora'){
     var own=state.matches.filter(function(m){return m.cov&&helpers.mondayOf(m.date)===week&&(m.ed===u.id||m.edBy===u.id||!m.ed&&!m.edBy&&users.filter(function(x){return x.role==='editora';}).length===1);});
     var quantity=own.reduce(function(n,m){return n+(Number(m.cov.players)||0);},0),rate=helpers.rateFor('ed',quantity);
     own.forEach(function(m){var k=key+'|'+String(m.id);if(!seen.has(k)){seen.add(k);lines.push({mid:m.id,uid:u.id,amount_cents:cents((Number(m.cov.players)||0)*rate),estimated:true,paid:false,kind:'salary',source:key});}});
    }
   });
  });return lines;
 }
 function deliveryStatus(d){if(!d)return 'Pendiente de envío';if(d.correction_open)return 'Corrección pendiente';if(d.confirmed_at)return 'Recepción confirmada';if(d.sent_at)return 'Enviada · falta confirmar';return 'Pendiente de envío';}
 function canMatch(user,m,users){return !!user&&(user.role==='admin'||user.role==='foto'&&(m.f1===user.id||m.f2===user.id)||user.role==='editora'&&(m.ed===user.id||!m.ed&&m.edBy===user.id||!m.ed&&!m.edBy&&(users||[]).filter(function(u){return u.role==='editora';}).length===1));}
 function pending(state,data,user,today){
  var out=[],admin=user.role==='admin',deliveries=new Map((data.deliveries||[]).map(function(d){return [String(d.match_id),d];}));
  state.matches.filter(function(m){return !m.archived&&canMatch(user,m,state.users);}).forEach(function(m){
   var d=deliveries.get(String(m.id)),title=m.teams+' · '+m.date;
   if(!m.cov&&m.date<=today&&(admin||user.role==='foto'))out.push({key:'cov-'+m.id,kind:'Cobertura sin registrar',title,tab:'cobertura',mid:m.id,priority:2});
   if(m.cov&&admin){var balance=Math.max(0,cents((Number(m.cov.players)||0)*(Number(m.cov.price)||0))-cents(m.cov.discount||0)-cents(m.cov.paid||0));if(balance>0)out.push({key:'balance-'+m.id,kind:'Saldo por cobrar',title,tab:'cobertura',mid:m.id,amount_cents:balance,priority:2});}
   if(d&&d.correction_open)out.push({key:'fix-'+m.id,kind:'Corrección pendiente',title,tab:'entregas',mid:m.id,priority:1});
   else if(m.stage==='listos'&&(!d||!d.sent_at))out.push({key:'send-'+m.id,kind:'Fotos listas sin envío registrado',title,tab:'entregas',mid:m.id,priority:1});
   else if(d&&d.sent_at&&!d.confirmed_at)out.push({key:'receipt-'+m.id,kind:'Recepción por confirmar',title,tab:'entregas',mid:m.id,priority:3});
  });
  if(admin){
   ['expenses','loans'].forEach(function(key){(state[key]||[]).filter(function(x){return x.status==='pendiente';}).forEach(function(x){out.push({key:key+'-'+x.id,kind:key==='expenses'?'Gasto por aprobar':'Préstamo por revisar',title:(x.cat||x.note||'Solicitud')+' · '+(x.date||''),tab:key==='expenses'?'gastos':'prestamos',priority:2});});});
   Object.keys(state.pays||{}).forEach(function(key){if(state.pays[key].status==='revision')out.push({key:'pay-'+key,kind:'Pago con revisión solicitada',title:key.split('|')[1],tab:'pagos',week:key.split('|')[1],priority:1});});
   (data.quotes||[]).filter(function(q){return q.status==='accepted'||q.status==='converted'&&!q.match_id;}).forEach(function(q){out.push({key:'quote-'+q.id,kind:'Cotización por vincular',title:q.package_name,tab:'cotizador',quote_id:q.id,priority:2});});
  }
  return out.sort(function(a,b){return a.priority-b.priority||a.title.localeCompare(b.title,'es');});
 }
 return {cents,money,split,quote,summarize,payroll,deliveryStatus,canMatch,pending};
});
