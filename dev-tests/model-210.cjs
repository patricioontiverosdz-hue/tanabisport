const assert=require('node:assert/strict');
const M=require('../assets/tsi-210-model.js'),B=require('../assets/tsi-210-backup.js');
async function main(){
 assert.equal(M.cents(199.99),19999);assert.throws(()=>M.cents(Infinity));
 for(let amount=0;amount<100;amount++)for(const weights of [[1],[1,1],[3,2,7],[.5,.2,.3]])assert.equal(M.split(amount,weights).reduce((a,b)=>a+b,0),amount);
 assert.deepEqual(M.split(10001,[1,1]),[5001,5000]);
 const rate={active:true,unit:'player',price_cents:20000,max_discount_pct:10};
 assert.equal(M.quote({quantity:10,discount_cents:15000},rate,false).total_cents,185000);
 assert.throws(()=>M.quote({quantity:10,discount_cents:25000},rate,false));assert.throws(()=>M.quote({quantity:1.5},rate,false));assert.throws(()=>M.quote({quantity:10,unit_price_cents:1},rate,false));
 assert.equal(M.quote({quantity:1.5},Object.assign({},rate,{unit:'hour'}),false).total_cents,30000);
 const match={id:'m',date:'2026-10-21',cov:{players:10,price:200,discount:200,paid:1000},cobros:[{amount:500}]};
 const result=M.summarize(match,[{mid:'m',amount_cents:60000,paid:true},{mid:'m',amount_cents:30000,estimated:true}],[{match_id:'m',amount_cents:10000}]);
 assert.equal(result.net_cents,180000);assert.equal(result.paid_cents,100000);assert.equal(result.field_cash_cents,50000);assert.equal(result.estimated_total_cost_cents,100000);assert.equal(result.profit_cents,80000);assert.equal(result.result_on_collections_cents,0);assert.equal(result.balance_cents,80000);
 const zero=M.summarize({id:'z',cov:{players:1,price:100,discount:100}},[],[]);assert.equal(zero.margin_pct,null);assert.equal(zero.net_cents,0);
 const state={matches:[],users:[],pays:{'u|2026-10-19':{status:'pagado',lines:[{mid:'a',players:1,amount:10},{mid:'b',players:2,amount:20}],bonus:[{amount:10.01}],reimb:[{amount:500}],ded:[{amount:900}]}}};
 const payroll=M.payroll(state,{payeesForWeek:()=>[],mondayOf:x=>x});assert.equal(payroll.reduce((n,r)=>n+r.amount_cents,0),4001);assert.equal(payroll.filter(l=>l.kind==='bonus').reduce((n,l)=>n+l.amount_cents,0),1001);
 const u={id:'f',role:'foto'},pending=M.pending({matches:[{id:1,date:'2026-10-20',teams:'Propio',f1:'f',stage:'listos',cov:{players:1,price:10}},{id:2,date:'2026-10-20',teams:'Ajeno',f1:'otro',stage:'listos',cov:{players:1,price:10}}],users:[u]},{deliveries:[],quotes:[]},u,'2026-10-21');assert.equal(pending.length,1);assert.equal(pending[0].mid,1);
 const snapshot={format:'tsi-operational-backup',schema_version:1,tables:{matches:[{id:'m',data:{title:'Prueba'}}]},files:[{bucket:'tsi-feedback',name:'prueba.jpg'}]};
 const raw=new Uint8Array([1,2,3,4]),payload={snapshot,snapshot_sha256:await B.sha(new TextEncoder().encode(JSON.stringify(snapshot))),assets:[{bucket:'tsi-feedback',name:'prueba.jpg',size:raw.length,base64:B.base64(raw),sha256:await B.sha(raw)}]};
 assert.equal((await B.verify(payload)).files,1);
 const encrypted=await B.seal(payload,'contraseña segura de prueba','proyecto-test');assert.ok(!JSON.stringify(encrypted).includes('Prueba'));
 const opened=await B.open(encrypted,'contraseña segura de prueba','proyecto-test');assert.equal((await B.verify(opened)).records,1);
 await assert.rejects(()=>B.open(encrypted,'contraseña incorrecta','proyecto-test'));await assert.rejects(()=>B.open(encrypted,'contraseña segura de prueba','otro-proyecto'));
 opened.assets[0].base64=B.base64(new Uint8Array([9,9]));await assert.rejects(()=>B.verify(opened));
 const changed=Object.assign({},encrypted,{payload:encrypted.payload.slice(0,-8)+'AAAAAAAA'});await assert.rejects(()=>B.open(changed,'contraseña segura de prueba','proyecto-test'));
 console.log('2.1.0 modelo: importes, descuentos, reparto exacto, nómina sin reembolsos duplicados, pendientes por rol y respaldo cifrado/integridad aprobados.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
