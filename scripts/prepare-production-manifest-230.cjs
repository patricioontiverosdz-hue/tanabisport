const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='708816c9fc5cf6a16520f23423ab1ae1ba2ff329';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const canonical=(p,b)=>/\.(?:html|js|css|json|svg|webmanifest|md|cjs|mjs|ts|sql|txt)$/.test(p)?Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n')):b;
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(dir+'/'+entry.name):[dir+'/'+entry.name]);}
function entry(p){const bytes=canonical(p,fs.readFileSync(path.join(root,p)));return {path:p,bytes:bytes.length,sha256:hash(bytes)};}
function generate(){
 if(!fs.existsSync(path.join(root,'equipo.html')))throw Error('Falta el paquete del equipo de producción.');
 if(cp.execFileSync('git',['diff',base,'--name-only','--','staging'],{cwd:root}).toString().trim())throw Error('Staging cambió durante la preparación de producción.');
 const production=['index.html','equipo.html',...walk('assets/tsi230')];
 const shared=[...walk('assets').filter(p=>!p.startsWith('assets/tsi230/')),...walk('training'),'manifest.webmanifest','tsi-push-sw.js','icon-192.png','icon-512.png'].filter(p=>fs.existsSync(path.join(root,p)));
 for(const p of shared){const before=cp.execFileSync('git',['show',base+':'+p],{cwd:root,maxBuffer:10000000});if(hash(before)!==hash(canonical(p,fs.readFileSync(path.join(root,p)))))throw Error('Recurso compartido cambiado: '+p);}
 const staging=['staging/index.html','staging/equipo.html','staging/tsi-230-public.js','staging/tsi-230-ui.js','staging/tsi-230-admin.js','staging/tsi-230-admin-integration.js','staging/tsi-230-role-catalog.js','staging/tsi-230-guest.js','staging/tsi-230-store.js'];
 const manifest={version:'2.3.0',baseline_main_sha:base,schedule:{date:'2026-11-09',time:'00:00',timezone:'America/Monterrey',utc:'2026-11-09T06:00:00Z'},production_project:'tantlgswituiwkxfgmsr',staging_project:'nksqpoigywfegcbvfhoa',staging_tree_sha:cp.execFileSync('git',['rev-parse',base+':staging'],{cwd:root}).toString().trim(),stripe:'disabled_manual_orders_authorized',previous_index_sha256:hash(cp.execFileSync('git',['show',base+':index.html'],{cwd:root,maxBuffer:10000000})),production:production.map(entry),shared:shared.map(entry),staging:staging.map(entry)};
 fs.mkdirSync(path.join(root,'release/2.3.0-production'),{recursive:true});fs.writeFileSync(path.join(root,'release/2.3.0-production/artifacts.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(require.main===module){try{const m=generate();console.log('Manifest prepared: '+m.production.length+' production artifacts, '+m.shared.length+' unchanged shared artifacts; staging remains pinned.');}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={generate,hash};
