const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(html,/<title>Tanabi Sports Intelligence 2\.2\.5<\/title>/);
assert.match(html,/var APP_VERSION="2\.2\.5"/);
assert.equal(require('../package.json').version,'2.2.5');
assert.match(html,/var SBU="https:\/\/tantlgswituiwkxfgmsr\.supabase\.co"/);
assert.match(html,/localStorage\.setItem\("tsi_production_tantlgswituiwkxfgmsr_auth"/);
assert.ok(!/nksqpoigywfegcbvfhoa|tsi_staging_|staging\//.test(html),'Producción conserva su servidor, sus sesiones y sus recursos');
assert.ok(!/tsi224|TSIStore|tsi-store|js\.stripe\.com|api\.stripe\.com/.test(html),'La promoción no incorpora la tienda nueva ni Stripe de staging');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
assert.equal(digest('assets/tsi-225-availability-suspensions.js'),digest('staging/availability-suspensions.js'),'El módulo promovido es exactamente el validado en staging');
for(const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)){
 const source=match[1].split('?')[0];assert.ok(!/^(?:https?:|\/)|\.\./i.test(source));assert.ok(fs.statSync(path.join(root,source)).isFile(),'El recurso de producción existe: '+source);
}
// Reuse the complete behavioral suite against production, including navigation
// for admin/photo/editor, account changes, retries, forecasts and proposals.
process.argv[2]='production';
require('./availability-suspensions.cjs');
