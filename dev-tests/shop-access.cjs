const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const ids={admin:'00000000-0000-4000-8000-000000000001',foto:'00000000-0000-4000-8000-000000000002',editora:'00000000-0000-4000-8000-000000000003'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<100;i++){if(check())return;await pause(10);}throw Error('No se completó: '+label);}

// Todas las solicitudes se responden en memoria; no se consultan ni modifican servidores.
async function environment(staging,role,shop){
 const {Window}=await import('happy-dom'),project=staging?'nksqpoigywfegcbvfhoa':'tantlgswituiwkxfgmsr';
 const base='https://'+project+'.supabase.co',url='https://patricioontiverosdz-hue.github.io/tanabisport/'+(staging?'staging/':'');
 const window=new Window({url,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 const errors=[],calls=[];window.alert=message=>errors.push(String(message));
 window.document.body.innerHTML='<div id="app"></div>';
 const item={id:701,title:'Foto de prueba',folder:'#12 — Jugador de prueba',price:50,img:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cVZ0AAAAASUVORK5CYII='};
 const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 window.fetch=async(input,options={})=>{
  const request=new URL(String(input)),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
  assert.equal(request.origin,base,'Cada entorno conserva su servidor');calls.push({path:request.pathname,method,body,headers:options.headers||{}});
  if(request.pathname==='/rest/v1/settings')return response([{id:'cfg',data:{shop,reservasPublicas:false,loans:false,autoArchive:false,whatsapp:''}}]);
  if(request.pathname==='/rest/v1/shop_items')return response([{id:String(item.id),data:item}]);
  if(request.pathname==='/rest/v1/profiles')return response(Object.entries(ids).map(([r,id])=>({id,email:r+'@test.invalid',name:'Prueba '+r,role:r})));
  if(request.pathname==='/rest/v1/rpc/tsi11_state')return response({server_now:new Date().toISOString(),model:{parameters:{min_completed_jobs:3}},capacity:[],estimates:[],sessions:[],matches:[],events:[],snapshots:[]});
  if(request.pathname==='/rest/v1/rpc/tsi11_photographer_risks')return response({risks:[]});
  if(request.pathname==='/rest/v1/rpc/tsi11_photo_availability_state')return response({photographers:[]});
  return response([]);
 };
 if(role){
  const access='test.'+Buffer.from(JSON.stringify({iss:base+'/auth/v1'})).toString('base64url')+'.test';
  window.localStorage.setItem('tsi_'+(staging?'staging':'production')+'_'+project+'_auth',JSON.stringify({access,uid:ids[role],exp:Date.now()/1000+3600}));
 }
 const html=fs.readFileSync(path.join(root,staging?'staging/index.html':'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean);
 let last=scripts.pop(),position=last.lastIndexOf('})();');assert.ok(position>0);
 last=last.slice(0,position)+'window.__shopTest={S:S,render:function(){render();}};\n'+last.slice(position);
 for(const script of [...scripts,last])window.eval(script);
 await until(()=>window.__shopTest&&!window.__shopTest.S.booting,'arranque '+(staging?'staging':'producción'));
 const api=window.__shopTest,doc=window.document;
 assert.equal(api.S.meId||null,role?ids[role]:null,'La sesión corresponde al visitante');
 function click(selector){const element=doc.querySelector(selector);assert.ok(element,'Control '+selector);element.click();}
 function go(tab){api.S.view='dash';api.S.tab=tab;api.render();}
 return {window,doc,api,calls,errors,item,click,go,close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}

async function main(){
 for(const staging of [false,true]){
  for(const shop of [true,false])for(const role of ['admin','editora','foto']){
   const env=await environment(staging,role,shop);
   try{
    env.go('resumen');const allowed=role==='admin'||role==='editora'&&shop;
    assert.equal(!!env.doc.querySelector('[data-tab="tienda"]'),allowed,'Entrada Tienda: '+role+', shop='+shop);
    if(allowed){
     env.click('[data-tab="tienda"]');assert.equal(env.api.S.tab,'tienda');
     assert.ok(env.doc.getElementById('shopfolder'),'Carpeta para organizar la carga');
     const upload=env.doc.getElementById('shopimg');assert.ok(upload);assert.equal(upload.type,'file');assert.equal(upload.multiple,true);
    }else{
     env.go('tienda');assert.notEqual(env.api.S.tab,'tienda','Una ruta forzada respeta los permisos');assert.equal(env.doc.getElementById('shopimg'),null);
    }
    assert.equal(env.calls.filter(call=>call.method!=='GET'&&!call.path.includes('/rpc/')).length,0,'Consultar la carga no modifica registros');
    assert.deepEqual(env.errors,[]);
   }finally{await env.close();}
  }
  for(const shop of [true,false]){
   const env=await environment(staging,null,shop);
   try{
    assert.equal(env.api.S.view,'home');assert.equal(!!env.doc.querySelector('[data-x="goShop"]'),shop,'Acceso público según configuración');
    if(shop){
     env.click('[data-x="goShop"]');await until(()=>env.doc.querySelector('.shop-preview img'),'vista previa pública');
     assert.equal(env.api.S.meId,null);assert.ok(env.doc.getElementById('shopfolderfilter'));assert.ok(env.doc.body.textContent.includes(env.item.folder));
     assert.equal(env.doc.getElementById('shopimg'),null,'El visitante no puede subir fotos');
     env.click('[data-x="cart"][data-id="701"]');
     env.doc.getElementById('sn').value='Cliente de prueba';env.doc.getElementById('sc').value='8112345678';
     env.click('[data-x="order"]');await until(()=>env.doc.body.textContent.includes('¡Pedido recibido!'),'confirmación de pedido');
     const orders=env.calls.filter(call=>call.path==='/rest/v1/orders'&&call.method==='POST');
     assert.equal(orders.length,1);assert.equal(orders[0].body.data.total,50);assert.equal(orders[0].body.data.items[0].id,701);
     assert.equal(orders[0].headers.Authorization,undefined,'El pedido funciona sin sesión del equipo');
     assert.equal(env.api.S.meId,null);assert.equal(env.api.S.cart.length,0);
    }else{
     env.api.S.view='shop';env.api.render();assert.ok(env.doc.body.textContent.includes('Tienda temporalmente deshabilitada'));
     assert.equal(env.doc.querySelector('[data-x="cart"]'),null);assert.equal(env.doc.querySelector('[data-x="order"]'),null);
    }
    assert.deepEqual(env.errors,[]);
   }finally{await env.close();}
  }
 }
 console.log('Tienda: acceso y carga de admin/editora, restricción de fotógrafo, catálogo y pedido sin login, cierre público y separación de entornos aprobados con servidor simulado.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
