const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {baseBlob,replacements,gitBlob}=require('../scripts/prepare-release-226.cjs');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
assert.match(html,/<title>Tanabi Sports Intelligence 2\.2\.6<\/title>/);
assert.match(html,/var APP_VERSION="2\.2\.6"/);
assert.equal(require('../package.json').version,'2.2.6');
assert.equal(require('../package-lock.json').packages[''].version,'2.2.6');
assert.match(html,/var SBU="https:\/\/tantlgswituiwkxfgmsr\.supabase\.co"/);
assert.ok(!/nksqpoigywfegcbvfhoa|tsi_staging_|staging\//.test(html),'Producción mantiene aislamiento');
assert.ok(!/tsi224|TSIStore|tsi-store|js\.stripe\.com|api\.stripe\.com/.test(html),'No promueve la tienda de staging');
let restored=html;
for(const [before,after] of [...replacements].reverse()){
 assert.equal(restored.split(after).length,2,'Solo un punto de integración: '+after.slice(0,75));
 restored=restored.replace(after,before);
}
assert.equal(gitBlob(restored),baseBlob,'El HTML existente es idéntico al retirar los puntos de acceso y versión de privacidad');
for(const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)){
 const source=match[1].split('?')[0];assert.ok(!/^(?:https?:|\/)|\.\./i.test(source));
 assert.ok(fs.statSync(path.join(root,source)).isFile(),'Recurso disponible: '+source);
 new vm.Script(fs.readFileSync(path.join(root,source),'utf8'),{filename:source});
}
for(const [index,match] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].entries())if(match[1].trim())new vm.Script(match[1],{filename:'inline-'+index});
console.log('2.2.6: identidad, '+replacements.length+' cambios acotados, sintaxis, recursos locales y aislamiento aprobados.');
