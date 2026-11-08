(function(root){'use strict';
 root.TSI230Portfolio={install:function(ctx){
  var S=ctx.state,D={publicItems:[],homepage:null,publicLoaded:false,publicLoading:false,adminItems:[],homepageId:null,adminLoaded:false,adminLoading:false,busy:false,error:'',message:'',file:null,requestId:'',form:{},editId:'',previews:{}},generation=0,privateEpoch=0,adminGeneration=0;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function staff(){var u=ctx.me&&ctx.me();return !!u&&['admin','editora'].includes(u.role);}
  function admin(){var u=ctx.me&&ctx.me();return !!u&&u.role==='admin';}
  function owner(){var u=ctx.me&&ctx.me();return u?u.id+':'+u.role:'';}
  var lastOwner=owner();
  function resetForm(){D.file=null;D.form={};D.requestId='';D.editId='';}
  function checkOwner(){var next=owner();if(next!==lastOwner){privateEpoch++;D.busy=false;D.adminItems=[];D.homepageId=null;D.adminLoaded=false;D.adminLoading=false;D.previews={};resetForm();D.error='';D.message='';lastOwner=next;}}
  async function edge(body){
   var isPrivate=!['portfolio/list','portfolio/image'].includes(body.action),held=owner(),epoch=privateEpoch;
   if(ctx.edge)return ctx.edge(body,isPrivate?{expectedOwner:held}:undefined);
   if(ctx.server!=='https://nksqpoigywfegcbvfhoa.supabase.co')throw Error('Portafolio disponible solo en staging.');
   var headers={'Content-Type':'application/json',apikey:ctx.publicKey||''},token=isPrivate&&ctx.accessToken&&await ctx.accessToken();
   if(isPrivate&&(held!==owner()||epoch!==privateEpoch))throw Error('La cuenta cambió.');
   if(token)headers.Authorization='Bearer '+token;
   var response=await root.fetch(ctx.server+'/functions/v1/tsi-guest-access',{method:'POST',headers:headers,body:JSON.stringify(body),cache:'no-store',referrerPolicy:'no-referrer'}),result=await response.json();
   if(isPrivate&&(held!==owner()||epoch!==privateEpoch))throw Error('La cuenta cambió.');
   if(!response.ok)throw Error(result.message||'No se pudo cargar la imagen.');return result;
  }
  function validImage(p){return !!p&&/^data:image\/jpeg;base64,/.test(p.image||'');}
  function publicPhoto(p){return {id:p.id,title:p.title,image:p.image,expires_at:null};}
  function applyPublic(items,homepage){
   D.publicItems=items.filter(validImage).map(publicPhoto);D.homepage=validImage(homepage)?publicPhoto(homepage):null;
   S.portfolio=D.publicItems.map(function(p){return {id:p.id,title:p.title,url:p.image,expires_at:p.expires_at};});S.photos=D.publicItems.map(function(p){return p.image;});S.homepageImage=D.homepage;
  }
  async function publicLoad(force){if(D.publicLoading&&!force||D.publicLoaded&&!force)return;D.publicLoading=true;var held=++generation;
   try{var listing=await edge({action:'portfolio/list'}),items=Array.isArray(listing.items)?listing.items.slice(0,12):[],home=listing.homepage&&listing.homepage.id?listing.homepage:null,ids=[];
    items.concat(home?[home]:[]).forEach(function(p){if(p&&typeof p.id==='string'&&!ids.includes(p.id))ids.push(p.id);});var photos={};
    for(var at=0;at<ids.length;at+=3){var batch=ids.slice(at,at+3),loaded=await Promise.allSettled(batch.map(function(id){return edge({action:'portfolio/image',id:id});}));loaded.forEach(function(result,i){if(result.status==='fulfilled'&&result.value&&result.value.id===batch[i]&&validImage(result.value))photos[batch[i]]=result.value;});}
    if(held===generation)applyPublic(items.map(function(p){return photos[p.id];}).filter(Boolean),home?photos[home.id]:null);
   }catch(error){if(held===generation)applyPublic([],null);}finally{if(held===generation){D.publicLoaded=true;D.publicLoading=false;ctx.render();}}
  }
  function applyAdmin(result){D.adminItems=Array.isArray(result.items)?result.items:[];D.homepageId=result.homepage_id||null;D.adminLoaded=true;}
  async function adminLoad(){checkOwner();if(!staff()||D.adminLoading)return;var held=owner(),epoch=privateEpoch,revision=++adminGeneration;D.adminLoading=true;
   try{var result=await edge({action:'portfolio/admin-state'});if(held!==owner()||epoch!==privateEpoch||revision!==adminGeneration||!staff())return;applyAdmin(result);D.error='';}
   catch(error){if(held===owner()&&epoch===privateEpoch&&revision===adminGeneration)D.error=error.message;}finally{if(held===owner()&&epoch===privateEpoch&&revision===adminGeneration){D.adminLoading=false;ctx.render();}}
  }
  function field(name,label,type,extra){return '<label for="p230-'+name+'">'+esc(label)+'</label><input id="p230-'+name+'" name="'+name+'" type="'+(type||'text')+'" value="'+esc(D.form[name]||'')+'" '+(extra||'')+'>';}
  function previewFor(p){var picture=D.previews[p.id]||D.publicItems.find(function(item){return item.id===p.id;})||(D.homepage&&D.homepage.id===p.id?D.homepage:null);return validImage(picture)?picture:null;}
  function card(p){var preview=previewFor(p),selected=D.homepageId===p.id;
   return '<article class="p230-image-card">'+(preview?'<img class="p230-thumbnail" src="'+esc(preview.image)+'" alt="Vista previa de '+esc(p.title)+'">':'<div class="p230-thumbnail p230-preview-empty">Vista previa disponible</div>')+'<div class="p230-image-info"><strong>'+esc(p.title)+'</strong>'+(selected?'<span class="p230-current">Imagen principal de Inicio</span>':'')+'<div class="p230-card-actions">'+(!preview?'<button type="button" class="btn small" data-p230-preview="'+esc(p.id)+'"'+(D.busy?' disabled':'')+'>Ver foto</button>':'')+'<button type="button" class="btn small" data-p230-edit="'+esc(p.id)+'"'+(D.busy?' disabled':'')+'>Editar datos o reemplazar foto</button>'+(admin()?'<button type="button" class="btn small" data-p230-home="'+esc(p.id)+'"'+(D.busy||selected?' disabled':'')+'>'+(selected?'Ya está en Inicio':'Usar en Inicio')+'</button>':'')+'<button type="button" class="btn small danger" data-p230-revoke="'+esc(p.id)+'"'+(D.busy?' disabled':'')+'>Retirar y borrar foto</button></div></div></article>';
  }
  function tab(){checkOwner();if(!staff())return '<p>Solo administración y editora gestionan las imágenes de la página.</p>';var current=D.adminItems.find(function(p){return p.id===D.homepageId;}),homeImage=current&&previewFor(current);
   return '<section class="card p230"><h2>Imágenes de la página</h2><p>Sube fotografías, edítalas o retíralas cuando lo decidas. Administración también puede elegir la imagen principal del inicio.</p>'+
    (admin()?'<section class="p230-home-settings"><div><h3>Imagen del inicio</h3><p>'+(current?'Actual: <strong>'+esc(current.title)+'</strong>':'El inicio muestra el logotipo de Tanabi Sports.')+'</p><p>Elige “Usar en Inicio” en una foto. Puedes subir una foto nueva abajo y después seleccionarla.</p>'+(current?'<button type="button" class="btn small" data-p230-home=""'+(D.busy?' disabled':'')+'>Quitar imagen y mostrar logotipo</button>':'')+'</div>'+(homeImage?'<img class="p230-home-preview" src="'+esc(homeImage.image)+'" alt="Imagen actual del inicio">':'')+'</section>':'')+
    '<h3 id="p230-form-title">'+(D.editId?'Editar fotografía':'Agregar fotografía al portafolio')+'</h3>'+
    '<form data-p230-form><fieldset'+(D.busy?' disabled':'')+'>'+field('title','Título público (opcional)','text','maxlength="80" placeholder="Fotografía Tanabi Sports"')+
    '<label for="p230-file">'+(D.editId?'Reemplazar foto (opcional)':'Foto')+' (JPEG, PNG o WebP, hasta 10 MB)</label><input id="p230-file" type="file" accept="image/jpeg,image/png,image/webp"'+(!D.editId&&!D.file?' required':'')+'>'+(D.file?'<p>'+esc(D.file.name)+'</p>':D.editId?'<p class="hint">Si no eliges un archivo, conservaremos la imagen actual.</p>':'')+
    '<div class="p230-form-actions"><button class="btn primary" type="submit">'+(D.editId?'Guardar cambios':'Publicar foto')+'</button>'+(D.editId?'<button type="button" class="btn" data-p230-cancel>Cancelar edición</button>':'')+'</div></fieldset></form>'+
    (D.error?'<p class="err" role="alert">'+esc(D.error)+'</p>':'')+(D.message?'<p class="hint" role="status">'+esc(D.message)+'</p>':'')+
    '<h3>Portafolio publicado</h3>'+(D.adminLoading?'<p>Cargando…</p>':D.adminItems.length?'<div class="p230-image-grid">'+D.adminItems.map(card).join('')+'</div>':'<p>Agrega la primera fotografía con el formulario.</p>')+'</section>';
  }
  function readFile(file){return new Promise(function(resolve,reject){var reader=new root.FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=function(){reject(Error('No se pudo leer la foto.'));};reader.readAsDataURL(file);});}
  async function prepareImage(file){
   if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10*1024*1024)throw Error('Selecciona una foto JPEG, PNG o WebP de hasta 10 MB.');
   var source=await readFile(file),image=await new Promise(function(resolve,reject){var img=new root.Image();img.onload=function(){if(!img.width||!img.height||img.width*img.height>30000000)reject(Error('La foto es demasiado grande.'));else resolve(img);};img.onerror=function(){reject(Error('La foto no es válida.'));};img.src=source;});
   var scale=Math.min(1,1280/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));var context=canvas.getContext('2d');if(!context)throw Error('No se pudo preparar la foto.');context.drawImage(image,0,0,canvas.width,canvas.height);
   for(var quality of [.75,.6,.45,.3]){var jpeg=canvas.toDataURL('image/jpeg',quality);if(jpeg.length<=500000)return jpeg;}throw Error('La foto supera el tamaño permitido.');
  }
  document.addEventListener('change',function(event){var el=event.target;if(el.id==='p230-file'){event.stopImmediatePropagation();if(staff()&&!D.busy){D.file=el.files&&el.files[0]||null;D.requestId='';}}if(el.closest&&el.closest('[data-p230-form]')){D.form[el.name]=el.value;}},true);
  document.addEventListener('input',function(event){var el=event.target;if(el.name&&el.closest&&el.closest('[data-p230-form]')){D.form[el.name]=el.type==='checkbox'?el.checked:el.value;D.requestId='';}});
  async function refreshPublic(){generation++;applyPublic([],null);await publicLoad(true);}
  document.addEventListener('submit',async function(event){if(!event.target.matches('[data-p230-form]'))return;event.preventDefault();if(!staff()||D.busy)return;var held=owner(),epoch=privateEpoch,editing=D.editId;D.busy=true;D.adminLoading=false;adminGeneration++;D.error='';D.message='';
   try{var form=new root.FormData(event.target);ctx.render();
    var image=D.file?await(ctx.prepareImage||prepareImage)(D.file):null;if(!editing&&!image)throw Error('Selecciona la fotografía que quieres publicar.');if(held!==owner()||epoch!==privateEpoch||!staff())throw Error('La cuenta cambió.');if(!D.requestId)D.requestId=root.crypto.randomUUID();
    var payload={request_id:D.requestId,title:String(form.get('title')||'').trim()||'Fotografía Tanabi Sports'};if(image)payload.image=image;
    var result=await edge(editing?{action:'portfolio/update',id:editing,payload:payload}:{action:'portfolio/publish',payload:payload});if(held!==owner()||epoch!==privateEpoch||!staff())return;applyAdmin(result);D.previews={};resetForm();D.message=editing?'Cambios guardados.':'Foto publicada. Puedes elegirla como imagen del inicio.';await refreshPublic();
   }catch(error){if(held===owner()&&epoch===privateEpoch)D.error=error.message;}finally{if(held===owner()&&epoch===privateEpoch){D.busy=false;ctx.render();}}
  });
  document.addEventListener('click',async function(event){var button=event.target.closest&&event.target.closest('[data-p230-revoke],[data-p230-edit],[data-p230-cancel],[data-p230-preview],[data-p230-home]');if(!button||!staff()||D.busy)return;
   if(button.hasAttribute('data-p230-cancel')){resetForm();D.error='';ctx.render();return;}
   if(button.hasAttribute('data-p230-edit')){var item=D.adminItems.find(function(p){return p.id===button.dataset.p230Edit;});if(!item)return;resetForm();D.editId=item.id;D.form={title:item.title};D.error='';D.message='';ctx.render();var title=document.getElementById('p230-title');if(title)title.focus();return;}
   if(button.hasAttribute('data-p230-home')&&!admin())return;
   D.busy=true;D.adminLoading=false;adminGeneration++;D.error='';D.message='';var held=owner(),epoch=privateEpoch;ctx.render();
   try{var result;
    if(button.hasAttribute('data-p230-preview')){result=await edge({action:'portfolio/image',id:button.dataset.p230Preview});if(held!==owner()||epoch!==privateEpoch||!staff())return;if(validImage(result))D.previews[result.id]=publicPhoto(result);else throw Error('La foto ya no está disponible.');}
    else if(button.hasAttribute('data-p230-home')){result=await edge({action:'portfolio/homepage',id:button.dataset.p230Home||null,request_id:root.crypto.randomUUID()});if(held!==owner()||epoch!==privateEpoch||!admin())return;applyAdmin(result);D.message=button.dataset.p230Home?'Imagen del inicio actualizada.':'El inicio vuelve a mostrar el logotipo.';await refreshPublic();}
    else {result=await edge({action:'portfolio/revoke',id:button.dataset.p230Revoke});if(held!==owner()||epoch!==privateEpoch||!staff())return;applyAdmin(result);D.previews={};if(D.editId===button.dataset.p230Revoke)resetForm();D.message='Foto retirada y borrada.';await refreshPublic();}
   }catch(error){if(held===owner()&&epoch===privateEpoch)D.error=error.message;}finally{if(held===owner()&&epoch===privateEpoch){D.busy=false;ctx.render();}}
  });
  function afterRender(){checkOwner();if(!D.publicLoaded&&!D.publicLoading)publicLoad();if(staff()&&S.view==='dash'&&S.tab==='portafolio'&&!D.adminLoaded&&!D.adminLoading&&!D.busy&&!D.error)adminLoad();}
  applyPublic([],null);root.setInterval(function(){if(!document.hidden)publicLoad(true);},60000);
  return {tab:tab,publicLoad:publicLoad,adminLoad:adminLoad,afterRender:afterRender,prepareImage:prepareImage,clearLegacy:function(){generation++;applyPublic([],null);},diagnostics:function(){return {publicCount:D.publicItems.length,homepageId:D.homepage&&D.homepage.id,adminCount:staff()?D.adminItems.length:0,editId:staff()?D.editId:'',busy:D.busy,error:D.error};}};
 }};
})(typeof window!=='undefined'?window:globalThis);
