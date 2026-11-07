'use strict';
/* TSI 2.2.5: pruebas sin red de campos, privacidad de interfaz e integración. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'assets/tsi-225-incomplete-matches.js'),'utf8');
const tabs={};
const window={};
vm.runInNewContext(script,{window,document:{addEventListener(event,fn){(tabs[event]??=[]).push(fn);}},TextEncoder,crypto:require('node:crypto').webcrypto});
const model=window.TSIPartialMatches225;
assert.equal(typeof model.install,'function');
assert.deepEqual([...model.missing({})].sort(),['categoría','campo','equipos','fecha','hora'].sort());
assert.deepEqual(Array.from(model.missing({date:'2026-11-09',time:'18:30',cat:'FLAG',home:'Águilas',away:'Halcones',venue:'Campo 1'})),[]);
assert.ok(model.missing({date:'2026-02-30',time:'18:30',cat:'FLAG',home:'A',away:'B',venue:'Campo 1'}).includes('fecha'));
assert.ok(model.missing({date:'2026-11-09',time:'25:40',cat:'FLAG',home:'A',away:'B',venue:'Campo 1'}).includes('hora'));
assert.ok(model.missing({date:'2026-11-09',time:'18:30',cat:'FLAG',home:'Tigres',away:'TIGRES',venue:'Campo 1'}).includes('equipos'));
assert.deepEqual(Array.from(model.missing({date:'2026-11-09',time:'18:30',cat:'FLAG',team_mode:'text',teams:'Final',venue:'Campo 1'})),[]);
const excel={file:{name:'jornada.xlsx',sha256:'test'},rows:[
 {row:3,error:'falta equipo',data:{date:'2026-11-09',rol:{local:'A'}}},
 {row:4,error:'fórmula con error',data:{date:'2026-11-09',rol:{local:'A'}}},
 {row:5,error:'duplicado exacto',data:{date:'2026-11-09',rol:{local:'A'}}}
]};
assert.equal(model.candidates(excel).length,1);
let user={id:'test-user',role:'foto'},calls=0;
const ui=model.install({server:'https://nksqpoigywfegcbvfhoa.supabase.co',me:()=>user,esc:String,uuid:()=> 'id',render:()=>{},importState:()=>excel,syncIdle:()=>true,request:async()=>{calls++;return[];}});
ui.beforeRender('incompletos');
assert.equal(ui.view(),'');assert.equal(ui.importer(),'');assert.equal(calls,0);
user.role='editora';ui.beforeRender('incompletos');
assert.equal(ui.view(),'');assert.equal(ui.importer(),'');assert.equal(calls,0);
user.role='admin';ui.beforeRender('incompletos');
assert.match(ui.view(),/Rol de juegos incompletos/);
assert.match(ui.importer(),/Guardar filas incompletas/);
const staging=fs.readFileSync(path.join(root,'staging/equipo.html'),'utf8');
assert.match(staging,/PM225\.beforeRender/);
assert.match(staging,/PM225\.view\(\)/);
assert.match(staging,/PM225\.importer\(\)/);
assert.match(staging,/assets\/tsi-225-incomplete-matches\.js/);
assert.match(staging,/['"]incompletos['"],['"]micalendario/);
const production=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(process.argv.includes('--production')){
 assert.match(production,/PM225\.beforeRender/);
 assert.match(production,/assets\/tsi-225-incomplete-matches\.js/);
}else{
 assert.doesNotMatch(production,/PM225\.beforeRender/,'staging deployment must not modify production');
}
console.log('TSI 2.2.5: tests de privados/admin/validación e integración aprobados.');
