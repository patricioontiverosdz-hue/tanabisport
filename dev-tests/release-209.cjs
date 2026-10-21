const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const uid='00000000-0000-4000-8000-000000000002',calls=[],store=new Map(),fields=new Map();
let failSave=false;
const jwt='test.'+Buffer.from(JSON.stringify({iss:'https://tantlgswituiwkxfgmsr.supabase.co/auth/v1'})).toString('base64url')+'.test';
const local=new Map([['tsi_production_tantlgswituiwkxfgmsr_auth',JSON.stringify({access:jwt,refresh:'',uid,exp:Date.now()/1000+3600})]]);
const app={innerHTML:''};
const doc={hidden:false,activeElement:null,getElementById:id=>id==='app'?app:fields.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({style:{},setAttribute(){},appendChild(){},getContext:()=>({})}),documentElement:{style:{setProperty(){}},dataset:{},setAttribute(){},removeAttribute(){}},body:{appendChild(){}}};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const fetch=async(input,opt={})=>{
 const url=new URL(input),method=opt.method||'GET';calls.push({url:url.href,method});let body=opt.body?JSON.parse(opt.body):null;
 if(url.pathname==='/rest/v1/avisos'){
  const id=(url.searchParams.get('id')||'').replace(/^eq\./,'');
  if(method!=='GET'&&failSave)return response({message:'Sin conexión de prueba'},503);
  if(method==='POST'){store.set(body.id,body.data);return response([body]);}
  if(method==='PATCH'){
   const old=store.get(id),filter=url.searchParams.get('data->>updatedAt');
   if(!old||filter==='is.null'&&old.updatedAt||filter?.startsWith('eq.')&&old.updatedAt!==filter.slice(3))return response([]);
   store.set(id,body.data);return response([{id,data:body.data}]);
  }
  if(method==='DELETE'){const data=store.get(id);store.delete(id);return response(data?[{id,data}]:[]);}
  if(id)return response(store.has(id)?[{id,data:store.get(id)}]:[]);
  return response([...store].map(([id,d])=>({id,noticeId:d.id,date:d.date,title:d.title,text:d.text,to:d.to,format:d.format,imageCount:d.imageCount,updatedAt:d.updatedAt})));
 }
 if(url.pathname==='/rest/v1/profiles')return response([{id:uid,email:'admin@test.invalid',name:'Admin prueba',role:'admin'}]);
 if(url.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop:false,reservasPublicas:false,autoArchive:false}}]);
 if(url.pathname==='/rest/v1/rpc/tsi11_state')return response({});
 if(url.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
 if(url.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({photographers:[]});
 return response([]);
};
const ctx={console,URL,URLSearchParams,Date,Math,Map,Set,Promise,JSON,Number,String,Boolean,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,atob,btoa,Response,Blob,Intl,crypto:crypto.webcrypto,document:doc,navigator:{userAgent:'test',platform:'Linux',maxTouchPoints:0},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},location:{href:'https://patricioontiverosdz-hue.github.io/tanabisport/?tsi_tab=avisos',pathname:'/tanabisport/',search:'?tsi_tab=avisos',hash:'',origin:'https://patricioontiverosdz-hue.github.io'},history:{replaceState(){}},fetch,addEventListener(){},matchMedia:()=>({matches:false}),isSecureContext:true,setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},alert(){},confirm:()=>true};
ctx.window=ctx;ctx.self=ctx;vm.createContext(ctx);
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);let last=scripts.pop(),pos=last.lastIndexOf('})();');
last=last.slice(0,pos)+`globalThis.T={S,X,render,loadAll,buildRows,av29Publish,av29Edit,av29Delete,av29Text,av29Images,av29PickImages,av29Fetch,av29LoadImages,d29Suggest,tabAvisos,finMonth,get av(){return AV29;}};\n`+last.slice(pos);
for(const script of [...scripts,last])vm.runInContext(script,ctx,{timeout:10000});
const flush=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
function form(title,text,to='all'){for(const [key,value] of Object.entries({title,text,to}))fields.set('av29-'+key,{value,focus(){},selectionStart:0,selectionEnd:0,setSelectionRange(){}});}
(async()=>{
 await flush();const t=ctx.T,s=t.S;
 assert.equal(s.meId,uid);assert.ok(app.innerHTML.includes('Avisos del equipo'));assert.ok(!app.innerHTML.includes('STAGING'));
 assert.ok(!('avisos' in t.buildRows()),'El sincronizador general no debe sobrescribir los adjuntos');
 form('Aviso de prueba','## Jornada\n**Negritas** y *cursivas*\n- Uno\n- Dos\n1. Primero\n[Agenda](https://example.com)');t.X.av29New();
 const image={name:'prueba.png',src:'data:image/png;base64,iVBORw0KGgo='};t.av.draft.images.push(image);
 await t.av29Publish();assert.equal(store.size,1);assert.equal(t.av.draft,null);const id=[...store.keys()][0];
 assert.equal(store.get(id).imageCount,1);assert.equal(store.get(id).images[0].src,image.src);
 const output=t.av29Text(store.get(id));for(const expected of ['<h5>Jornada</h5>','<strong>Negritas</strong>','<em>cursivas</em>','<ul>','<ol>','href="https://example.com/"'])assert.ok(output.includes(expected),expected);
 assert.equal(s.avisos[0].images,undefined);assert.ok(![...local.values()].some(v=>v.includes(image.src)),'No guardar imágenes en localStorage');
 t.av.cache={};await t.loadAll(true);assert.equal(s.avisos[0].imageCount,1);assert.equal(s.avisos[0].images,undefined);
 assert.ok(calls.some(c=>c.url.includes('noticeId:data-%3Eid')||c.url.includes('noticeId:data->id')),'La lista solicita sólo metadatos');
 await t.av29LoadImages(id);assert.equal(t.av.cache[id].images[0].src,image.src);
 await t.av29Edit(id);form('Título editado',t.av.draft.text);await t.av29Publish();assert.equal(store.get(id).title,'Título editado');assert.equal(store.get(id).images.length,1,'Editar texto conserva imágenes');
 await t.av29Edit(id);form('Conflicto',t.av.draft.text);store.get(id).updatedAt='2099-01-01T00:00:00Z';await t.av29Publish();assert.ok(t.av.error.includes('cambió'));assert.equal(t.av.draft.title,'Conflicto');assert.equal(store.get(id).title,'Título editado');
 t.av.draft=null;t.X.av29New();form('Reintento','Borrador');failSave=true;await t.av29Publish();assert.ok(t.av.draft);assert.ok(t.av.error);failSave=false;
 assert.ok(!t.av29Text({format:'markdown',text:'<img src=x onerror=alert(1)> [mal](javascript:alert) **ok**'}).includes('<img'));
 assert.ok(!t.av29Text({format:'markdown',text:'[mal](javascript:alert)'}).includes('<a '));
 assert.ok(t.av29Text({text:'**Aviso antiguo**\nTexto'}).includes('**Aviso antiguo**'));
 assert.equal(t.av29Images([{src:'data:image/svg+xml;base64,PHN2Zz4='}]).length,0);
 t.av.draft.images=Array.from({length:5},()=>image);await t.av29PickImages([{type:'image/png',size:1,name:'sexta.png'}]);assert.ok(t.av.error.includes('5 imágenes'));assert.equal(t.av.draft.images.length,5);
 s.users[0].role='foto';t.render();assert.equal(t.av.draft,null);assert.equal(Object.keys(t.av.cache).length,0);assert.ok(!t.tabAvisos().includes('Crear aviso'));let count=store.size;await t.av29Publish();await t.av29Delete(id);assert.equal(store.size,count);
 s.users[0].role='editora';t.render();assert.ok(!t.tabAvisos().includes('Crear aviso'));await t.av29Edit(id);assert.equal(t.av.draft,null);
 const history=Array.from({length:3},(_,i)=>({id:i,date:'2026-10-'+(10+i),time:'16:00',venue:'Potros',f1:uid,cov:{}}));
 const next=[{id:10,date:'2026-10-24',time:'16:00',venue:'Potros'},{id:11,date:'2026-10-24',time:'10:00',venue:'Otro'},{id:12,date:'2026-10-24',time:'17:00',venue:'Potros',f1:'a',f2:'b'}];
 const ranked=t.d29Suggest(history.concat(next),uid,{date:'2026-10-21',time:'12:00'},null);assert.equal(ranked.items[0].match.id,10);assert.ok(!ranked.items.some(x=>x.match.id===12));
 s.users[0].role='admin';t.render();s.tab='resumen';t.render();assert.ok(app.innerHTML.includes('Hola, Admin'));assert.ok(html.includes('data-tsi-theme-choice'));assert.ok(html.includes('tsiFbPhotoHtml'));assert.ok(html.includes('r.descuentos'));
 await t.av29Delete(id);assert.equal(store.size,0);
 assert.ok(calls.every(c=>new URL(c.url).origin==='https://tantlgswituiwkxfgmsr.supabase.co'));
 console.log('TSI 2.0.9: creación, formato seguro, imágenes, recarga, edición, conflicto, reintento, roles, eliminación, recomendaciones e inicio aprobados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
