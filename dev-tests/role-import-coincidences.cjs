'use strict';
/* TSI 2.2.5: coincidencias en Importar rol; no requiere credenciales ni red. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function run(filename){
 const src=fs.readFileSync(path.join(root,filename),'utf8');
 const cut=(a,b)=>{
  const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
  assert.ok(i>=0&&j>i,'fragment missing: '+a);
  return src.slice(i,j);
 };
 const change=cut("document.addEventListener('change',function(e){if(e.target.id==='ri-file')",
                 "document.addEventListener('click',function(e){var b=e.target.closest('[data-ri]')");
 const code=[
  cut('function riNorm(','function riParse('),
  cut('function riSame(','function riStartAllowed('),
  cut('function riFiltered(){','async function riOpenFile('),
  cut('function riCandidates(p){','function riIssues(){'),
  cut('async function riCommit(){','var riOldTabs='),
  change
 ].join('\n');
 let serial=100,network=[],event={},rendered=0;
 const RI={file:{name:'rol.xlsx',sha256:'a'.repeat(64)},rows:[],preview:[],from:'',to:'',
  groups:{},photos:[],pending:null,error:'',message:'',busy:false};
 const S={matches:[]},SYNC={busy:false,dirty:false};
 const document={
  addEventListener:(eventName,handler)=>{event[eventName]=handler;},
  getElementById:()=>({value:''})
 };
 const deps={RI,S,SYNC,document,nid:()=>String(++serial),tiUuid:()=> 'fixture-request-uuid',
  isAdmin:()=>true,render:()=>{rendered++;},sb:async(...args)=>{
    network.push(args);return {added:1,updated:1};
  },loadAll:async()=>{},riStartAllowed:()=>false,riField:x=>x,esc:String,
  riOpenFile:()=>{},riPropose:()=>{},tsi225Suspended:()=>false,tsi11Monday:()=>''};
 const api=new Function(...Object.keys(deps),code+
    '\nreturn {riPlan,riRebuild,riCandidates,riCommit};')(...Object.values(deps));
 const make=(row,date,time,key)=>({
   row,error:'',data:{date,time,cat:'U14',teams:'A vs B',venue:'Campo',
    rol:{modality:'FLAG',group:'1',local:'A',visitor:'B',identity:'same-group',key}}
 });
 const match1={...make(0,'2026-11-03','10:00','key-03').data,id:'101'};
 const match2={...make(0,'2026-11-04','10:00','key-04').data,id:'102'};
 S.matches=[match1,match2];
 const one=make(10,'2026-11-05','10:00','key-05');
 const two=make(11,'2026-11-06','11:00','key-06');
 RI.rows=[one,two];RI.preview=api.riPlan(RI.rows,S.matches);
 assert.deepEqual(RI.preview.map(p=>p.status),['ambiguous','ambiguous']);
 assert.equal(RI.preview[0].selected,false);
 assert.match(api.riCandidates(RI.preview[0]),/Selecciona una decisión/);
 const choose=(row,value)=>event.change({target:{
  id:'',value,getAttribute:name=>name==='data-ri-target'?String(row):null}});
 const tests=async()=>{
  choose(10,'101');
  assert.equal(RI.preview[0].target.id,'101');
  assert.equal(RI.preview[0].selected,true);
  assert.equal(RI.preview[0].resolved,true);
  api.riRebuild();
  assert.equal(RI.preview[0].target.id,'101');
  assert.equal(RI.preview[0].selected,true);
  choose(11,'101');
  await api.riCommit();
  assert.equal(network.length,0,'no update same target twice');
  assert.match(RI.error,/mismo partido/);
  choose(11,'__new');
  assert.equal(RI.preview[1].forceNew,true);
  assert.equal(RI.preview[1].target,null);
  await api.riCommit();
  assert.equal(network.length,1);
  assert.equal(network[0][2].p_items.length,2);
  assert.equal(network[0][2].p_items[0].id,'101');
  assert.equal(network[0][2].p_items[1].previous,null);
  // Repetidos exactos no se convierten en juegos nuevos.
  const same=api.riPlan([make(22,'2026-11-03','10:00','key-03')],S.matches)[0];
  assert.equal(same.status,'same');
  assert.equal(api.riCandidates(same),'');
  const newMatch=api.riPlan([make(23,'2026-11-07','10:00','unique-key')],S.matches)[0];
  assert.equal(newMatch.status,'ambiguous');
  const duplicateRows=api.riPlan([make(24,'2026-11-07','10:00','same-key'),make(25,'2026-11-07','10:00','same-key')],S.matches);
  duplicateRows.forEach(p=>{p.forceNew=true;p.resolved=true;p.selected=true;});
  RI.preview=duplicateRows;
  await api.riCommit();
  assert.match(RI.error,/repetidos/);
  assert.equal(network.length,1);
  console.log('PASS '+filename+': coincidencias, filtros, nuevos y actualización sin duplicar.');
 };
 return tests();
}
(async()=>{await run('index.html');await run('staging/index.html');})().catch(e=>{
 console.error(e);process.exitCode=1;
});
