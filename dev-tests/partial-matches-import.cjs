'use strict';
/* Regresión del flujo de Importar rol y privacidad TSI 2.2.5. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'assets/tsi-225-incomplete-matches.js'),'utf8');
const window={},events={},document={addEventListener:function(name,fn){(events[name]??=[]).push(fn);}};
vm.runInNewContext(code,{window,document,crypto,TextEncoder,confirm:()=>true});
const model=window.TSIPartialMatches225;
const excel={file:{name:'rol.xlsx',sha256:'fixture-hash'},rows:[
 {row:2,error:'fecha inválida',data:{date:'',time:'09:00',cat:'FLAG',venue:'Campo A',rol:{local:'Águilas',visitor:'Búhos'}}},
 {row:3,error:'fecha inválida; duplicado exacto de la fila 2',data:{date:'',time:'10:00',cat:'FLAG',venue:'Campo A',rol:{local:'Osos',visitor:'Lobos'}}},
 {row:4,error:'hora inválida',data:{date:'2026-11-10',time:'',cat:'TACKLE',venue:'Campo B',rol:{local:'Lobos',visitor:'Halcones'}}},
 {row:5,error:'fórmula con error',data:{date:'',time:'',cat:'FLAG',venue:'Campo X',rol:{local:'A',visitor:'B'}}},
 {row:6,error:'duplicado exacto',data:{date:'2026-11-10',time:'12:00',cat:'FLAG',venue:'Campo B',rol:{local:'A',visitor:'B'}}}
]};
assert.deepEqual(Array.from(model.candidates(excel),r=>r.row),[2,3,4]);
assert.deepEqual(Array.from(model.missing(model.fromRow(excel.rows[0],excel.file))),['fecha']);
assert.deepEqual(Array.from(model.missing(model.fromRow(excel.rows[2],excel.file))),['hora']);
let user={id:'test-admin',role:'admin'},req=[],published=0,renderCount=0;
const api={server:'https://tantlgswituiwkxfgmsr.supabase.co',me:()=>user,esc:String,
 uuid:()=> '123e4567-e89b-42d3-a456-426614174000',render:()=>{renderCount++;},
 importState:()=>excel,syncIdle:()=>true,reloadMatches:async()=>{published++;},
 request:async(method,p,body,owner)=>{
  req.push({method,path:p,body,owner});
  if(method==='GET')return [];
  if(p.includes('save_many'))return body.p_items.map(x=>({id:x.p_id}));
  throw Error('Unexpected network request');
 }};
const ui=model.install(api);
(async()=>{
 await ui.load(); // GET jamás debe enviar un cuerpo.
 assert.equal(req[0].method,'GET');
 assert.equal(req[0].body,undefined);
 let importer=ui.importer();
 assert.match(importer,/Importar juegos incompletos/);
 assert.match(importer,/Guardar 3 juegos incompletos/);
 assert.match(importer,/Posible duplicado/);
 const button={getAttribute:(name)=>name==='data-pm'?'import':null};
 events.click.forEach(fn=>fn({target:{closest:()=>button}}));
 for(let k=0;k<150&&!req.some(x=>x.path.includes('save_many'));k++)await new Promise(resolve=>setTimeout(resolve,5));
 for(let k=0;k<150&&!ui.importer().includes('guardados sin publicarse');k++)await new Promise(resolve=>setTimeout(resolve,5));
 const batch=req.find(x=>x.path.includes('save_many'));
 assert.ok(batch,'debe guardar desde la pantalla Importar rol');
 assert.equal(batch.body.p_items.length,3);
 assert.equal(new Set(batch.body.p_items.map(x=>x.p_id)).size,3);
 assert.match(ui.importer(),/3 juegos incompletos guardados sin publicarse/);
 assert.equal(published,0,'no debe crear partidos operativos');
 user={id:'test-admin',role:'editora'};
 ui.beforeRender('importarrol');
 assert.equal(ui.importer(),'');
 assert.equal(ui.view(),'');
 const prod=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const staging=fs.readFileSync(path.join(root,'staging/equipo.html'),'utf8');
 for(const html of [prod,staging]){
  assert.match(html,/PM225\.importer\(\)/);
  assert.match(html,/page\.replace\(anchor,panel\+anchor\)/);
  assert.match(html,/assets\/tsi-225-incomplete-matches\.js/);
 }
 console.log('TSI 2.2.5: Importar rol incompleto · 15 verificaciones aprobadas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
