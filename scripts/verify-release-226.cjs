// Read-only HTTPS verification. --baseline checks the unchanged 2.2.5 deployment before release.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/tsi226-artifacts.json'),'utf8'));
const base='https://patricioontiverosdz-hue.github.io/tanabisport/';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
async function main(){
 const baseline=process.argv.includes('--baseline');
 const files=baseline?[manifest.base_index,...manifest.production.filter(file=>file.path!=='index.html'&&!file.path.startsWith('assets/tsi-226-'))]:manifest.production;
 for(const file of [...files,manifest.staging_index]){
  assert.ok(/^[\w./-]+$/.test(file.path)&&!file.path.includes('..'),'Safe fixed artifact path');
  const url=new URL(file.path,base);url.searchParams.set('verify226',Date.now().toString());
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'HTTP '+file.path);
  const data=Buffer.from(await response.arrayBuffer());assert.equal(hash(data),file.sha256,'Exact published bytes: '+file.path);
  if(file.path==='index.html')assert.ok(data.includes(Buffer.from('var APP_VERSION="'+(baseline?'2.2.5':'2.2.6')+'"')),'Published version');
  console.log('OK '+file.path);
 }
 console.log(baseline?'2.2.5 baseline and staging verified; production has not been promoted.':'TSI 2.2.6 verified over HTTPS: exact HTML/resources, with staging unchanged.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
