const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clone=value=>JSON.parse(JSON.stringify(value));
const image=(label,type='jpeg')=>'data:image/'+type+';base64,'+Buffer.from((label+'|').repeat(12)).toString('base64');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function until(check,label){for(let i=0;i<400;i++){if(check())return;await delay(5);}throw Error('No se completó: '+label);}

function serverState(){
 return {settings:{id:'shop',bw:true,motion:true,watermark:true,watermark_data:null,version:1},
  items:[{id:'701',title:'Foto primera',folder:'#12',price:50,img:image('public-protected-one')},{id:'702',title:'Foto antigua',folder:'#14',price:50,img:image('public-protected-legacy')}],
  sources:[{id:'701',img:image('PRIVATE-COLOR-SOURCE-ONE'),legacy:false,version:1},{id:'702',img:image('public-protected-legacy'),legacy:true,version:0}]};
}

function installCanvas(window){
 const canvases=[],encoded=new Map(),decoded=[];
 class MockImage{
  constructor(){this.width=1200;this.height=800;this.naturalWidth=1200;this.naturalHeight=800;this.complete=true;}
  set src(value){this._src=String(value);decoded.push(this._src);queueMicrotask(()=>this.onload?.());}
  get src(){return this._src;}
  decode(){return Promise.resolve();}
 }
 window.Image=MockImage;
 const getContext=function(){
  if(this._context)return this._context;
  const operations=[],context={canvas:this,operations,pixels:[100,150,200,255],
   drawImage(img,...args){operations.push({name:'drawImage',source:crypto.createHash('sha256').update(img.src||'canvas').digest('hex'),args});},
   getImageData(){operations.push({name:'getImageData'});return {data:new Uint8ClampedArray(this.pixels)};},
   putImageData(value){this.pixels=Array.from(value.data);operations.push({name:'putImageData',pixels:this.pixels});},
   measureText(text){return {width:String(text).length*10};}};
  for(const name of ['save','restore','translate','rotate','scale','clearRect','fillRect','strokeRect','fillText','strokeText','beginPath','moveTo','lineTo','stroke','rect','clip','setTransform']){
   context[name]=(...args)=>operations.push({name,args});
  }
  this._context=context;canvases.push(context);return context;
 };
 const toDataURL=function(type='image/png',quality){
  const ctx=this.getContext('2d'),content={width:this.width,height:this.height,quality,pixels:ctx.pixels,ops:ctx.operations};
  const value='data:'+type+';base64,'+Buffer.from(JSON.stringify(content)).toString('base64');encoded.set(value,content);return value;
 };
 const createElement=window.document.createElement.bind(window.document);
 window.document.createElement=(tag,...args)=>{const element=createElement(tag,...args);if(String(tag).toLowerCase()==='canvas'){element.getContext=getContext;element.toDataURL=toDataURL;}return element;};
 return {canvases,encoded,decoded};
}

async function environment(role='admin',server=serverState(),options={}){
 const {Window}=await import('happy-dom');
 const window=new Window({url:'https://preview.invalid/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 Object.defineProperty(window,'crypto',{value:crypto.webcrypto});window.setInterval=()=>0;window.clearInterval=()=>{};window.confirm=()=>true;
 let user=role?{id:'test-'+role,role,name:role}:null,mod,nextId=800;
 const state={view:role?'dash':'shop',tab:'tienda',cfg:{shop:true},shop:{items:clone(server.items)}};
 const canvas=installCanvas(window),calls=[],errors=[];
 window.alert=message=>errors.push(String(message));
 window.document.body.innerHTML='<main id="app"></main>';
 let failSettings=false,holdState=null;
 const sb=async(method,url,payload)=>{
  calls.push({method,url,payload:payload?clone(payload):null});
  if(url.startsWith('/rest/v1/tsi224_shop_preview'))return [clone(server.settings)];
  if(url==='/rest/v1/rpc/tsi224_shop_state'){
   assert.ok(user&&['admin','editora'].includes(user.role),'Solo el personal autorizado solicita fuentes');
   if(holdState)return await new Promise(resolve=>{holdState.resolve=()=>resolve(clone({settings:server.settings,sources:server.sources}));});
   return clone({settings:server.settings,sources:server.sources});
  }
  if(url==='/rest/v1/rpc/tsi224_shop_command'){
   assert.ok(user&&['admin','editora'].includes(user.role),'Solo personal autorizado modifica vistas previas');
   const p=clone(payload.payload);
   if(payload.operation==='settings'){
    if(failSettings){failSettings=false;const error=Error('La configuración cambió en otra sesión. Recarga para reintentar.');error.status=409;error.body={code:'40001'};throw error;}
    assert.equal(p.expected_version,server.settings.version,'Se comprueba la versión global');
    assert.deepEqual(p.items.map(item=>String(item.id)).sort(),server.items.map(item=>String(item.id)).sort(),'Se actualiza toda la tienda en la misma solicitud');
    for(const item of p.items){const source=server.sources.find(source=>source.id===String(item.id));assert.equal(item.source_version,source.version);}
    for(const item of p.items)server.items.find(row=>row.id===String(item.id)).img=item.img;
    server.settings={...server.settings,...clone(p.settings),version:server.settings.version+1};
    return {settings:clone(server.settings),updated:p.items.length};
   }
   if(payload.operation==='upload'){
    assert.equal(p.settings_version,server.settings.version);
    for(const item of p.items){
     const id=String(item.id),previous=server.items.find(row=>row.id===id),source=server.sources.find(row=>row.id===id);
     if(previous){assert.equal(item.source_version,source.version);previous.img=item.img;source.img=item.source_img;source.legacy=false;source.version++;}
     else{server.items.push({id,title:item.title,folder:item.folder,price:item.price,img:item.img});server.sources.push({id,img:item.source_img,legacy:false,version:1});}
    }
    return {settings:clone(server.settings),updated:p.items.length};
   }
   throw Error('Operación inesperada: '+payload.operation);
  }
  throw Error('Solicitud inesperada: '+method+' '+url);
 };
 function render(){
  if(!mod)return;mod.beforeRender();const app=window.document.getElementById('app');
  app.innerHTML=state.view==='dash'?mod.tab('<section id="base-upload">Carga existente</section>'):state.shop.items.map(item=>mod.preview(item)).join('');mod.afterRender();
 }
 const api={state,me:()=>user,esc,sb,render,syncIdle:()=>true,nid:()=>String(++nextId),canUploadShop:()=>!!user&&['admin','editora'].includes(user.role),loadShop:async()=>{state.shop.items=clone(server.items);}};
 window.eval(fs.readFileSync(path.join(ROOT,'assets/tsi-shop-preview.js'),'utf8'));
 mod=window.TSIShopPreviewInstall(api);render();
 await mod.publicLoad();if(user&&['admin','editora'].includes(user.role)){await mod.load();await until(()=>mod.diagnostics().loaded,'carga de opciones privadas');}render();
 const doc=window.document;
 function change(id,value){const field=doc.getElementById(id);assert.ok(field,'Campo '+id);if(field.type==='checkbox')field.checked=value;else field.value=value;field.dispatchEvent(new window.Event('change',{bubbles:true}));}
 function click(selector){const element=doc.querySelector(selector);assert.ok(element,'Control '+selector);element.click();}
 return {window,doc,api,mod,state,server,canvas,calls,errors,change,click,render,
  failSave(){failSettings=true;},holdPrivate(){holdState={};return holdState;},
  setUser(value){user=value;state.view=value?'dash':'shop';render();},
  close:async()=>{await window.happyDOM.cancelAsync();window.close();}};
}

async function main(){
 // Cada rol obtiene controles y fuentes según su permiso; el público recibe solo miniaturas protegidas.
 for(const role of ['admin','editora','foto',null]){
  const env=await environment(role);
  try{
   const staff=role==='admin'||role==='editora';
   for(const id of ['s224-bw','s224-motion','s224-watermark','s224-watermark-file'])assert.equal(!!env.doc.getElementById(id),staff,'Control '+id+' para '+role);
   const privateCalls=env.calls.filter(call=>call.url==='/rest/v1/rpc/tsi224_shop_state');assert.equal(privateCalls.length>0,staff,'Lectura privada según rol');
   if(!staff){assert.ok(!env.doc.body.innerHTML.includes('PRIVATE-COLOR-SOURCE'));assert.ok(!env.doc.body.innerHTML.includes(env.server.sources[0].img));}
   else{assert.ok(env.doc.body.textContent.toLocaleLowerCase('es').includes('antigua'),'Límite de la miniatura antigua visible');assert.ok(env.doc.querySelector('[data-224-replace="702"]'),'Reemplazo de la fuente antigua');}
   env.state.view='shop';env.render();
   assert.equal(env.doc.querySelectorAll('.s224-motion').length,env.server.items.length,'El efecto continúa activo para '+role);
   assert.equal(env.doc.querySelectorAll('[data-224-motion]').length,staff?env.server.items.length:0,'Solo administración y editora ven el control de pausa: '+role);
   if(staff){
    env.click('[data-224-motion="701"]');assert.ok(env.doc.querySelector('[data-224-preview="701"]').classList.contains('s224-paused'),'El personal puede pausar su vista previa');
    env.click('[data-224-motion="701"]');assert.ok(!env.doc.querySelector('[data-224-preview="701"]').classList.contains('s224-paused'),'El personal puede reanudar su vista previa');
   }
  }finally{await env.close();}
 }

 const env=await environment('editora');
 try{
  // La desactivación se guarda globalmente y genera nuevas vistas de todas las fotos.
  const originalItems=clone(env.server.items);
  env.change('s224-bw',false);env.change('s224-motion',false);env.change('s224-watermark',false);
  await env.mod.save();await until(()=>!env.mod.diagnostics().busy,'guardar ajustes');
  assert.equal(env.mod.diagnostics().error,'','Guardar ajustes: '+env.mod.diagnostics().error);
  assert.deepEqual([env.server.settings.bw,env.server.settings.motion,env.server.settings.watermark],[false,false,false]);
  const command=env.calls.find(call=>call.url.endsWith('tsi224_shop_command')&&call.payload.operation==='settings');assert.ok(command);
  assert.equal(command.payload.payload.items.length,2);assert.ok(command.payload.request_id,'Solicitud identificable para reintento');
  assert.deepEqual(env.server.items.map(item=>({title:item.title,folder:item.folder,price:item.price})),originalItems.map(item=>({title:item.title,folder:item.folder,price:item.price})),'Regenerar conserva metadatos y precios');
  assert.ok(env.server.items.every((item,index)=>item.img!==originalItems[index].img));
  assert.ok(!JSON.stringify(command.payload.payload.settings).includes('shop'),'No modifica habilitación de la tienda ni otras opciones cfg');
  const publicView=await environment(null,env.server);
  try{assert.ok(!publicView.doc.querySelector('[data-224-motion]'),'Movimiento desactivado en toda la tienda');assert.ok(!publicView.doc.body.innerHTML.includes(env.server.sources[0].img));}finally{await publicView.close();}
  const reopened=await environment('admin',env.server);
  try{for(const id of ['s224-bw','s224-motion','s224-watermark'])assert.equal(reopened.doc.getElementById(id).checked,false,'Los ajustes persisten al abrir otra sesión');}finally{await reopened.close();}

  // El desenfoque móvil nunca utiliza las fuentes privadas como src público.
  env.change('s224-motion',true);await env.mod.save();env.state.view='shop';env.render();
  assert.ok(env.doc.querySelector('[data-224-motion]'),'Movimiento activado');
  for(const img of env.doc.querySelectorAll('.shop-preview img'))assert.ok(env.server.items.some(item=>item.img===img.src),'La franja usa miniatura protegida');
  env.state.view='dash';env.render();

  // El procesamiento altera píxeles al habilitar BW y graba la marca en el archivo.
  const color=await env.mod.renderImage(env.server.sources[0].img,{bw:false,motion:false,watermark:false,watermark_data:null});
  const gray=await env.mod.renderImage(env.server.sources[0].img,{bw:true,motion:false,watermark:false,watermark_data:null});
  const marked=await env.mod.renderImage(env.server.sources[0].img,{bw:false,motion:false,watermark:true,watermark_data:null});
  const colorData=env.canvas.encoded.get(color),grayData=env.canvas.encoded.get(gray),markData=env.canvas.encoded.get(marked);
  assert.ok(colorData&&grayData&&markData,'Los resultados son imágenes procesadas');
  assert.notEqual(color,gray);assert.equal(grayData.pixels[0],grayData.pixels[1]);assert.equal(grayData.pixels[1],grayData.pixels[2]);
  assert.ok(markData.ops.some(op=>op.name==='fillText'||op.name==='strokeText'),'Marca predeterminada incrustada');
  assert.ok(!colorData.ops.some(op=>op.name==='fillText'||op.name==='strokeText'),'Sin marca cuando se desactiva');

  // Una marca propia se normaliza a PNG y queda dibujada dentro de cada miniatura.
  env.change('s224-watermark',true);
  const pngBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cVZ0AAAAASUVORK5CYII=','base64');
  const logo=new env.window.File([pngBytes],'mi-marca.png',{type:'image/png'}),logoInput=env.doc.getElementById('s224-watermark-file');
  Object.defineProperty(logoInput,'files',{value:[logo],configurable:true});logoInput.dispatchEvent(new env.window.Event('change',{bubbles:true}));
  await until(()=>!env.mod.diagnostics().busy&&!!env.mod.diagnostics().draft.watermark_data,'normalizar marca propia');
  const ownMark=env.mod.diagnostics().draft.watermark_data;
  assert.ok(ownMark.startsWith('data:image/png;base64,'));assert.ok(ownMark.length<=300000);
  const markedWithLogo=await env.mod.renderImage(env.server.sources[0].img,{bw:false,motion:false,watermark:true,watermark_data:ownMark});
  assert.ok(env.canvas.encoded.get(markedWithLogo).ops.filter(op=>op.name==='drawImage').length>1,'El logo se graba en píxeles, además de dibujar la fotografía');
  await env.mod.save();assert.equal(env.mod.diagnostics().error,'');assert.equal(env.server.settings.watermark_data,ownMark);
  const anotherSession=await environment('admin',env.server);
  try{assert.equal(anotherSession.mod.diagnostics().draft.watermark_data,ownMark,'La marca propia queda disponible para otro usuario autorizado');}finally{await anotherSession.close();}
  env.click('[data-224-action="remove-watermark"]');assert.equal(env.mod.diagnostics().draft.watermark_data,null);
  await env.mod.save();assert.equal(env.server.settings.watermark_data,null,'Puede volver a la marca predeterminada');

  // Carga privada y reemplazo de una foto antigua sin alterar el pedido ni los metadatos.
  const photo=new env.window.File([pngBytes],'jugador-nuevo.png',{type:'image/png'}),count=env.server.items.length;
  await env.mod.upload([photo],'#31',999);assert.equal(env.mod.diagnostics().error,'');assert.equal(env.server.items.length,count+1);
  const newItem=env.server.items.at(-1),newSource=env.server.sources.find(source=>source.id===newItem.id);
  assert.equal(newItem.price,50,'La editora conserva el precio autorizado aunque se le pase otro importe');assert.equal(newItem.folder,'#31');
  assert.ok(newSource&&!newSource.legacy);assert.notEqual(newSource.img,newItem.img,'La fuente limpia no sustituye la imagen pública protegida');
  assert.ok(Math.max(env.canvas.encoded.get(newSource.img).width,env.canvas.encoded.get(newSource.img).height)<=720,'La copia privada de trabajo también está reducida');
  const legacyMeta=clone(env.server.items.find(item=>item.id==='702'));
  await env.mod.upload([photo],'carpeta que no debe sustituir la existente',1,'702');assert.equal(env.mod.diagnostics().error,'');
  const replaced=env.server.items.find(item=>item.id==='702'),replacedSource=env.server.sources.find(source=>source.id==='702');
  assert.deepEqual({title:replaced.title,folder:replaced.folder,price:replaced.price},{title:legacyMeta.title,folder:legacyMeta.folder,price:legacyMeta.price});
  assert.equal(replacedSource.legacy,false);assert.ok(replacedSource.version>legacyMeta.version||replacedSource.version>0);
  assert.equal(env.doc.querySelector('[data-224-replace="702"]'),null,'La foto reemplazada deja de mostrarse como fuente antigua');
  await assert.rejects(env.mod.processFile(new env.window.File(['<svg/>'],'logo.svg',{type:'image/svg+xml'})),/JPEG|PNG|WebP/,'Los SVG no llegan al procesador de imágenes');

  const viewerAfterUpload=await environment(null,env.server);
  try{assert.ok(!viewerAfterUpload.doc.body.innerHTML.includes(newSource.img));assert.equal(viewerAfterUpload.calls.filter(call=>call.url.endsWith('tsi224_shop_state')).length,0);}finally{await viewerAfterUpload.close();}

  // Una carrera de versiones conserva borrador y miniaturas publicadas sin cambios parciales.
  env.change('s224-bw',true);const before=clone(env.server);env.failSave();await env.mod.save();
  assert.deepEqual(env.server,before,'El servidor rechaza el lote completo ante conflicto');
  assert.ok(env.mod.diagnostics().error);assert.equal(env.mod.diagnostics().draft.bw,true,'Se conserva el borrador para corregir o reintentar');
  assert.ok(env.doc.body.textContent.includes('cambió')||env.doc.body.textContent.includes('confirm'),'Error de guardado visible');
 }finally{await env.close();}

 // Una respuesta privada demorada no debe reaparecer después de cerrar sesión.
 const closing=await environment('admin');
 try{
  closing.state.view='shop';closing.render();closing.click('[data-224-motion="701"]');
  assert.ok(closing.doc.querySelector('[data-224-preview="701"]').classList.contains('s224-paused'),'La sesión del personal estaba pausada');
  const held=closing.holdPrivate(),pending=closing.mod.load(true);
  await until(()=>typeof held.resolve==='function','solicitud privada demorada');
  closing.setUser(null);held.resolve();await pending;
  assert.equal(closing.mod.diagnostics().sources.length,0,'Fuentes privadas eliminadas al cambiar de sesión');
  assert.ok(!closing.doc.body.innerHTML.includes(closing.server.sources[0].img),'La respuesta antigua no se coloca en la vista pública');
  assert.equal(closing.doc.querySelector('[data-224-motion]'),null,'Cerrar sesión elimina el botón de pausa');
  assert.ok(closing.doc.querySelector('[data-224-preview="701"]').classList.contains('s224-motion'),'El movimiento sigue habilitado para clientes');
  assert.ok(!closing.doc.querySelector('[data-224-preview="701"]').classList.contains('s224-paused'),'El estado de pausa del personal no congela la vista pública');
 }finally{await closing.close();}

 console.log('TSI 2.2.4: roles, fuentes privadas, opciones globales, BW, marca propia, carga/reemplazo, movimiento, conflicto y cierre de sesión aprobados con servidor simulado.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
