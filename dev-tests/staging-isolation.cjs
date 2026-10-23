const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../staging/index.html'),'utf8');
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
const values=new Map([['tsi_production_tantlgswituiwkxfgmsr_auth','production-sentinel'],['tsi_staging_nksqpoigywfegcbvfhoa_auth',JSON.stringify({access:jwt,refresh:'',uid,exp:Date.now()/1000+3600})]]);
const app={innerHTML:''};
const doc={hidden:false,activeElement:null,getElementById:()=>app,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{},createElement:()=>({style:{},setAttribute(){},appendChild(){},getContext:()=>({})}),documentElement:{style:{setProperty(){}},dataset:{}},body:{appendChild(){}}};
const fetch=async (url,opt)=>{calls.push(String(url));const p=new URL(url).pathname;let result=[];
 if(p==='/rest/v1/profiles')result=[{id:uid,email:'foto@test.invalid',name:'Foto prueba',role:'foto'}];
 if(p==='/rest/v1/settings')result=[{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}];
 if(p==='/rest/v1/rpc/tsi11_photographer_risks')result={risks:[]};
 if(p==='/rest/v1/rpc/tsi11_photo_availability_state')result={photographers:[]};
 if(p==='/functions/v1/tsi-push')result={publicKey:'B'.repeat(87),registered:false,events:[],preferences:{enabled:true,categories:[],quiet_enabled:true,quiet_start:22,quiet_end:8,timezone:'America/Monterrey'}};
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
const ctx={console,URL,URLSearchParams,Date,Math,Map,Set,Promise,JSON,Number,String,Boolean,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,atob,btoa,Response,Blob,
 crypto:crypto.webcrypto,document:doc,navigator:{userAgent:'test',platform:'Linux',maxTouchPoints:0,serviceWorker:{getRegistration:async()=>null,register:async()=>({active:{scriptURL:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/tsi-push-sw.js'},pushManager:{getSubscription:async()=>null}}),addEventListener(){}}},
 localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
 location:{href:'https://patricioontiverosdz-hue.github.io/tanabisport/staging/?tsi_tab=notif',pathname:'/tanabisport/staging/',search:'?tsi_tab=notif',hash:'',origin:'https://patricioontiverosdz-hue.github.io'},
 history:{replaceState(){}},Notification:{permission:'default'},PushManager:function(){},fetch,addEventListener(){},matchMedia:()=>({matches:false}),isSecureContext:true,
 setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},alert(){},confirm:()=>true};
ctx.window=ctx;ctx.self=ctx;
vm.createContext(ctx);
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let last=scripts.pop();const pos=last.lastIndexOf('})();');assert.ok(pos>0);
last=last.slice(0,pos)+'globalThis.__tsiTest={state:S,TP:TP,load:tsiPushLoad,config:stagingConfigError};\n'+last.slice(pos);
for(const script of [...scripts,last])vm.runInContext(script,ctx,{timeout:10000});
(async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));
 assert.equal(ctx.__tsiTest.config(),'');assert.equal(ctx.__tsiTest.state.meId,uid);assert.equal(ctx.__tsiTest.state.tab,'notif');
 assert.ok(html.includes('APP_VERSION="2.1.1-staging"'));assert.ok(app.innerHTML.includes('STAGING · Pruebas 2.1.1'));assert.ok(app.innerHTML.includes('STAGING'));assert.ok(app.innerHTML.includes('Avisos al celular'));assert.ok(ctx.__tsiTest.TP.info);assert.ok(ctx.__tsiTest.TP.reg);
 assert.equal(values.get('tsi_production_tantlgswituiwkxfgmsr_auth'),'production-sentinel');
 assert.ok(calls.length);assert.ok(calls.every(u=>new URL(u).origin==='https://nksqpoigywfegcbvfhoa.supabase.co'));
 console.log('Página completa: arranque y panel push correctos; todas las llamadas a staging y sesión de producción intacta.');
})().catch(e=>{console.error(e);process.exit(1);});
