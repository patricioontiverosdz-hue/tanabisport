// Release-specific checks. Every child runs sequentially; the first failure stops the run.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const postgres=!!process.env.TSI230_PGLITE_MODULE;
const suites=[
 'ui-230.cjs',
 'rules-230.cjs',
 'support-230.cjs',
 'support-230-ui.cjs',
 'guest230.cjs',
 'guest230-ui.cjs',
 'guest230-manual-ui.cjs',
 'portfolio230.cjs',
 'portfolio230-ui.cjs',
 'store-payments-230.cjs',
 'store-ui-230-security.cjs',
 'integration-230.cjs',
 ...(postgres?['rules-230-postgres.cjs','guest230-postgres.cjs']:[]),
 'staging-isolation.cjs',
 'photo-game-ui.cjs',
 'editing-game-model.cjs',
 'editing-game-renderer.cjs',
 'editing-game-ui.cjs',
 'game-ranking-backend.cjs',
 'game-ranking-ui.cjs',
 'production-training.cjs'
];
console.log('TSI 2.3.0 · verificación secuencial de la entrega');
if(postgres)console.log('PostgreSQL local habilitado: soporte lo ejecuta dentro de support-230.cjs; reglas e invitados tienen suites independientes.');
else console.log('OMITIDO: PostgreSQL local. Define TSI230_PGLITE_MODULE con la ruta de una instalación local de @electric-sql/pglite para incluir sus pruebas.');
const started=Date.now();let passed=0;
for(const [index,file]of suites.entries()){
 const target=path.join(__dirname,file);
 console.log('\n['+(index+1)+'/'+suites.length+'] '+file);
 if(!fs.existsSync(target)){console.error('FALLO: falta la suite '+file);process.exitCode=1;break;}
 const result=spawnSync(process.execPath,[target],{cwd:root,stdio:'inherit',env:process.env,windowsHide:true});
 if(result.error||result.status!==0){
  console.error('FALLO: '+file+(result.error?' · '+result.error.message:result.signal?' · señal '+result.signal:' · código '+result.status));
  process.exitCode=Number.isInteger(result.status)&&result.status>0?result.status:1;
  break;
 }
 passed++;
}
if(!process.exitCode)console.log('\nAPROBADO: '+passed+'/'+suites.length+' suites · '+((Date.now()-started)/1000).toFixed(1)+' s'+(postgres?' · PostgreSQL local incluido.':' · PostgreSQL local omitido.'));
else console.error('Ejecución detenida tras '+passed+' suite(s) aprobada(s).');
