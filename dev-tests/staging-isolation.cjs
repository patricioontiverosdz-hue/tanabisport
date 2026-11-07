const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const appVersion=require('../staging/version.json').version;
const htmlPath=path.join(__dirname,'../staging/index.html'),html=fs.readFileSync(htmlPath,'utf8');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const tokens=['function tsi11Forecast','function tabRoleImport','function tabPhotoAvailability','function discountPayForm','dorsalesHtml'];
for(const name of tokens)assert.ok(html.includes(name)&&source.includes(name),name);
const policy=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
assert.ok(policy.includes("worker-src 'self'"),'El receptor local debe estar permitido por CSP');
assert.ok(policy.includes("manifest-src 'self'"),'El manifiesto local debe estar permitido por CSP');
assert.ok(policy.includes("img-src 'self'"),'Los iconos locales deben estar permitidos por CSP');
assert.ok(policy.includes("default-src 'none'"),'La restricción general debe conservarse');
assert.ok(policy.includes("connect-src https://nksqpoigywfegcbvfhoa.supabase.co"),'La conexión sigue limitada a staging');
assert.ok(!html.includes('tsi_production_'));assert.ok(!html.includes('tantlgswituiwkxfgmsr'));
const uid='00000000-0000-4000-8000-000000000002',calls=[];
const jwt='test.'+Buffer.from(JSON.stringify({iss:'https://nksqpoigywfegcbvfhoa.supabase.co/auth/v1'})).toString('base64url')+'.test';
const backend='https://nksqpoigywfegcbvfhoa.supabase.co';
async function main(){
 const {Window}=await import('happy-dom');
 const window=new Window({url:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/?tsi_tab=notif',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),doc=window.document;
 const errors=[];window.addEventListener('error',event=>errors.push(String(event.error||event.message)));
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});Object.defineProperty(window,'isSecureContext',{value:true});
 Object.defineProperty(window,'Notification',{value:{permission:'default'}});window.PushManager=function(){};
 Object.defineProperty(window.navigator,'serviceWorker',{value:{getRegistration:async()=>null,register:async()=>({active:{scriptURL:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/tsi-push-sw.js'},pushManager:{getSubscription:async()=>null}}),addEventListener(){}}});
 window.setInterval=()=>0;window.clearInterval=()=>{};window.alert=()=>{};window.confirm=()=>true;
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 doc.body.innerHTML='<div id="app"></div>';
 window.localStorage.setItem('tsi_production_tantlgswituiwkxfgmsr_auth','production-sentinel');
 window.localStorage.setItem('tsi_staging_nksqpoigywfegcbvfhoa_auth',JSON.stringify({access:jwt,refresh:'',uid,exp:Date.now()/1000+3600}));
 window.fetch=async(url,opt)=>{calls.push(String(url));const p=new URL(url).pathname;let result=[];
  if(p==='/rest/v1/profiles')result=[{id:uid,email:'foto@test.invalid',name:'Foto prueba',role:'foto'}];
  if(p==='/rest/v1/settings')result=[{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}];
  if(p==='/rest/v1/rpc/tsi11_photographer_risks')result={risks:[]};
  if(p==='/rest/v1/rpc/tsi11_photo_availability_state')result={photographers:[]};
  if(p==='/rest/v1/rpc/tsi230_rules_state')result={availability:[],clock:[],suspensions:[]};
  if(p==='/functions/v1/tsi-guest-access'&&JSON.parse(opt.body||'{}').action==='portfolio/list')result={items:[]};
  if(p==='/functions/v1/tsi-guest-access'&&JSON.parse(opt.body||'{}').action==='portfolio/admin-state')return new Response('{"message":"Sin permiso"}',{status:403});
  if(p==='/rest/v1/rpc/tsi210_state')result={version:'2.1.0',teams:[],team_matches:[],rates:[],quotes:[],quote_costs:[],costs:[],deliveries:[],audit:[]};
  if(p==='/functions/v1/tsi-push')result={publicKey:'B'.repeat(87),registered:false,events:[],preferences:{enabled:true,categories:[],quiet_enabled:true,quiet_start:22,quiet_end:8,timezone:'America/Monterrey'}};
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  // Load the same local scripts as the real document, including staging 2.3.0.
  for(const [,attributes,inline]of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
   const external=attributes.match(/\bsrc="([^"]+)"/);
   if(external){assert.ok(!/^https?:/i.test(external[1]),'Los módulos de la aplicación se sirven localmente');window.eval(fs.readFileSync(path.resolve(path.dirname(htmlPath),external[1].split('?')[0]),'utf8'));continue;}
   let script=inline;
   if(script.includes('var SBU=')){const pos=script.lastIndexOf('})();');assert.ok(pos>0);script=script.slice(0,pos)+'window.__tsiTest={state:S,TP:TP,load:tsiPushLoad,config:stagingConfigError};\n'+script.slice(pos);}
   if(script.trim())window.eval(script);
  }
  for(let i=0;i<200&&(!window.__tsiTest||window.__tsiTest.state.booting||!window.__tsiTest.TP.info||!window.__tsiTest.TP.reg);i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(window.__tsiTest.config(),'');assert.equal(window.__tsiTest.state.meId,uid);assert.equal(window.__tsiTest.state.tab,'notif');
  assert.equal(html.match(/\bvar APP_VERSION="([^"]+)"/)?.[1],appVersion+'-staging','Staging conserva su identificador y la versión del paquete');
  const app=doc.getElementById('app'),stage=app.querySelector('[data-ui230-stage]');
  if(stage){assert.equal(stage.querySelector('span').textContent,'STAGING');assert.ok(stage.textContent.includes('Pruebas '+appVersion));}
  else assert.ok(app.innerHTML.includes('STAGING · Pruebas '+appVersion));
  assert.ok(app.innerHTML.includes('STAGING'));assert.ok(app.innerHTML.includes('Avisos al celular'));assert.ok(window.__tsiTest.TP.info);assert.ok(window.__tsiTest.TP.reg);
  assert.equal(window.localStorage.getItem('tsi_production_tantlgswituiwkxfgmsr_auth'),'production-sentinel');
  assert.ok(calls.length);assert.ok(calls.every(url=>new URL(url).origin===backend));assert.deepEqual(errors,[],'La página completa no genera errores de ejecución');
  console.log('Página completa: arranque y panel push correctos; externos locales cargados, todas las llamadas a staging y sesión de producción intacta.');
 }finally{await window.happyDOM.cancelAsync();window.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
