(function(root){'use strict';
 root.TSI230Portfolio={install:function(ctx){
  var S=ctx.state,D={publicItems:[],publicLoaded:false,publicLoading:false,adminItems:[],adminLoaded:false,adminLoading:false,busy:false,error:'',message:'',file:null,requestId:'',form:{}},generation=0,privateEpoch=0,expiryTimer;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function staff(){var u=ctx.me&&ctx.me();return !!u&&['admin','editora'].includes(u.role);}
  function owner(){var u=ctx.me&&ctx.me();return u?u.id+':'+u.role:'';}
  var lastOwner=owner();
  function checkOwner(){var next=owner();if(next!==lastOwner){privateEpoch++;D.busy=false;D.adminItems=[];D.adminLoaded=false;D.adminLoading=false;D.file=null;D.form={};D.requestId='';D.error='';D.message='';lastOwner=next;}}
  async function edge(body){if(ctx.edge)return ctx.edge(body);if(ctx.server!=='https://nksqpoigywfegcbvfhoa.supabase.co')throw Error('Portafolio disponible solo en staging.');var headers={'Content-Type':'application/json',apikey:ctx.publicKey||''},token=ctx.accessToken&&await ctx.accessToken();if(token)headers.Authorization='Bearer '+token;var response=await root.fetch(ctx.server+'/functions/v1/tsi-guest-access',{method:'POST',headers:headers,body:JSON.stringify(body),cache:'no-store',referrerPolicy:'no-referrer'}),result=await response.json();if(!response.ok)throw Error(result.message||'No se pudo confirmar la autorización.');return result;}
  function applyPublic(items){
   var now=Date.now();D.publicItems=items.filter(function(p){return /^data:image\/jpeg;base64,/.test(p.image||'')&&Date.parse(p.expires_at)>now;});
   S.portfolio=D.publicItems.map(function(p){return {id:p.id,title:p.title,url:p.image,expires_at:p.expires_at};});S.photos=D.publicItems.map(function(p){return p.image;});
   root.clearTimeout(expiryTimer);if(D.publicItems.length)expiryTimer=root.setTimeout(function(){applyPublic(D.publicItems);ctx.render();},Math.min(2147483000,Math.max(1,Math.min.apply(null,D.publicItems.map(function(p){return Date.parse(p.expires_at)-Date.now();}))))+5);
  }
  async function publicLoad(force){if(D.publicLoading&&!force||D.publicLoaded&&!force)return;D.publicLoading=true;var held=++generation;
   try{var listing=await edge({action:'portfolio/list'}),items=Array.isArray(listing.items)?listing.items.slice(0,12):[],photos=[];
    for(var at=0;at<items.length;at+=3){var loaded=await Promise.allSettled(items.slice(at,at+3).map(function(p){return edge({action:'portfolio/image',id:p.id});}));loaded.forEach(function(result){if(result.status==='fulfilled')photos.push(result.value);});}
    if(held===generation)applyPublic(photos);
   }catch(error){if(held===generation)applyPublic([]);}finally{if(held===generation){D.publicLoaded=true;D.publicLoading=false;ctx.render();}}
  }
  async function adminLoad(){checkOwner();if(!staff()||D.adminLoading)return;var held=owner(),epoch=privateEpoch;D.adminLoading=true;
   try{var result=await edge({action:'portfolio/admin-state'});if(held!==owner()||epoch!==privateEpoch||!staff())return;D.adminItems=result.items||[];D.adminLoaded=true;D.error='';}
   catch(error){if(held===owner()&&epoch===privateEpoch)D.error=error.message;}finally{if(held===owner()&&epoch===privateEpoch){D.adminLoading=false;ctx.render();}}
  }
  function field(name,label,type,extra){return '<label for="p230-'+name+'">'+esc(label)+'</label><input id="p230-'+name+'" name="'+name+'" type="'+(type||'text')+'" value="'+esc(D.form[name]||'')+'" '+(extra||'')+'>';}
  function tab(){checkOwner();if(!staff())return '<p>Solo administración y editora gestionan el portafolio.</p>';
   return '<section class="card p230"><h3>Portafolio público autorizado</h3><p>Publica únicamente fotos con autorización documentada para este portafolio público. Si aparecen menores, confirma también la autorización de quien ejerce su representación.</p><p>Se retirará al vencer la autorización, terminar la temporada o cumplirse 56 días, lo que ocurra primero. Las imágenes solo se muestran mientras su autorización esté vigente.</p>'+
    '<form data-p230-form><fieldset'+(D.busy?' disabled':'')+'>'+field('title','Título público, sin datos personales','text','required maxlength="80"')+
    '<label for="p230-file">Foto (JPEG, PNG o WebP, hasta 10 MB)</label><input id="p230-file" type="file" accept="image/jpeg,image/png,image/webp"'+(!D.file?' required':'')+'>'+(D.file?'<p>'+esc(D.file.name)+'</p>':'')+
    field('season_end','Fin de temporada','datetime-local','required')+field('consent_until','Vigencia de la autorización','datetime-local','required')+
    field('consent_reference','Referencia interna del documento de autorización','text','required pattern="[A-Za-z0-9][A-Za-z0-9._/-]{2,159}" maxlength="160" placeholder="AUT-2026-001"')+
    '<p class="hint">Registra una referencia interna; no pegues documentos, datos de personas ni enlaces de acceso.</p><label for="p230-contains_minors">¿Aparecen menores de edad?</label><select id="p230-contains_minors" name="contains_minors" required><option value="">Selecciona</option><option value="yes"'+(D.form.contains_minors==='yes'?' selected':'')+'>Sí</option><option value="no"'+(D.form.contains_minors==='no'?' selected':'')+'>No</option></select>'+
    '<div'+(D.form.contains_minors!=='yes'?' hidden':'')+' data-p230-guardian>'+field('guardian_reference','Referencia de la autorización del representante','text','maxlength="160" pattern="[A-Za-z0-9][A-Za-z0-9._/-]{2,159}"')+
    '<label><input type="checkbox" name="guardian_confirmed"'+(D.form.guardian_confirmed?' checked':'')+'> Revisé la autorización documentada del representante para esta publicación pública.</label></div>'+
    '<label><input type="checkbox" name="consent_confirmed" required'+(D.form.consent_confirmed?' checked':'')+'> Revisé el documento y confirmo que autoriza esta foto en el portafolio público durante la vigencia indicada.</label><button class="btn primary" type="submit">Publicar foto autorizada</button></fieldset></form>'+
    (D.error?'<p class="err" role="alert">'+esc(D.error)+'</p>':'')+(D.message?'<p class="hint" role="status">'+esc(D.message)+'</p>':'')+
    '<h4>Publicaciones y caducidad</h4>'+(D.adminLoading?'<p>Cargando…</p>':D.adminItems.length?D.adminItems.map(function(p){return '<div class="match"><strong>'+esc(p.title)+'</strong><p>Caduca '+esc(new Date(p.expires_at).toLocaleString('es-MX'))+' · '+(p.contains_minors?'Con autorización de representante':'Sin menores')+'</p><button type="button" class="btn small danger" data-p230-revoke="'+esc(p.id)+'"'+(D.busy?' disabled':'')+'>Retirar y borrar foto</button></div>';}).join(''):'<p>No hay publicaciones autorizadas. Las fotos sin documentación permanecen fuera del portafolio.</p>')+'</section>';
  }
  function readFile(file){return new Promise(function(resolve,reject){var reader=new root.FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=function(){reject(Error('No se pudo leer la foto.'));};reader.readAsDataURL(file);});}
  async function prepareImage(file){
   if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10*1024*1024)throw Error('Selecciona una foto JPEG, PNG o WebP de hasta 10 MB.');
   var source=await readFile(file),image=await new Promise(function(resolve,reject){var img=new root.Image();img.onload=function(){if(!img.width||!img.height||img.width*img.height>30000000)reject(Error('La foto es demasiado grande.'));else resolve(img);};img.onerror=function(){reject(Error('La foto no es válida.'));};img.src=source;});
   var scale=Math.min(1,1280/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));var context=canvas.getContext('2d');if(!context)throw Error('No se pudo preparar la foto.');context.drawImage(image,0,0,canvas.width,canvas.height);
   for(var quality of [.75,.6,.45,.3]){var jpeg=canvas.toDataURL('image/jpeg',quality);if(jpeg.length<=500000)return jpeg;}throw Error('La foto supera el tamaño permitido.');
  }
  document.addEventListener('change',function(event){var el=event.target;if(el.id==='p230-file'){event.stopImmediatePropagation();if(staff()&&!D.busy){D.file=el.files&&el.files[0]||null;D.requestId='';}}if(el.closest&&el.closest('[data-p230-form]')){D.form[el.name]=el.type==='checkbox'?el.checked:el.value;if(el.name==='contains_minors'){var guardian=document.querySelector('[data-p230-guardian]');if(guardian)guardian.hidden=el.value!=='yes';}}},true);
  document.addEventListener('input',function(event){var el=event.target;if(el.name&&el.closest&&el.closest('[data-p230-form]')){D.form[el.name]=el.type==='checkbox'?el.checked:el.value;D.requestId='';}});
  document.addEventListener('submit',async function(event){if(!event.target.matches('[data-p230-form]'))return;event.preventDefault();if(!staff()||D.busy)return;var held=owner(),epoch=privateEpoch;D.busy=true;D.error='';D.message='';
   try{var form=new root.FormData(event.target),minors=form.get('contains_minors');if(!['yes','no'].includes(minors)||!form.has('consent_confirmed')||minors==='yes'&&!form.has('guardian_confirmed'))throw Error('Confirma las autorizaciones documentadas que corresponden.');
    var image=await(ctx.prepareImage||prepareImage)(D.file);if(held!==owner()||epoch!==privateEpoch||!staff())throw Error('La cuenta cambió.');if(!D.requestId)D.requestId=root.crypto.randomUUID();
    var payload={request_id:D.requestId,title:String(form.get('title')||'').trim(),image:image,season_end:new Date(String(form.get('season_end'))).toISOString(),consent_until:new Date(String(form.get('consent_until'))).toISOString(),consent_reference:String(form.get('consent_reference')||'').trim(),contains_minors:minors==='yes',guardian_reference:minors==='yes'?String(form.get('guardian_reference')||'').trim():null,consent_confirmed:true,guardian_confirmed:minors==='yes'};
    var result=await edge({action:'portfolio/publish',payload:payload});if(held!==owner()||epoch!==privateEpoch||!staff())return;D.adminItems=result.items||[];D.adminLoaded=true;D.file=null;D.form={};D.requestId='';D.message='Foto publicada con autorización y caducidad.';await publicLoad(true);
   }catch(error){if(held===owner()&&epoch===privateEpoch)D.error=error.message;}finally{if(held===owner()&&epoch===privateEpoch){D.busy=false;ctx.render();}}
  });
  document.addEventListener('click',async function(event){var button=event.target.closest&&event.target.closest('[data-p230-revoke]');if(!button||!staff()||D.busy)return;D.busy=true;var held=owner(),epoch=privateEpoch;try{var result=await edge({action:'portfolio/revoke',id:button.dataset.p230Revoke});if(held!==owner()||epoch!==privateEpoch)return;D.adminItems=result.items||[];D.message='Foto retirada y borrada.';applyPublic([]);await publicLoad(true);}catch(error){if(held===owner()&&epoch===privateEpoch)D.error=error.message;}finally{if(held===owner()&&epoch===privateEpoch){D.busy=false;ctx.render();}}});
  function afterRender(){checkOwner();if(!D.publicLoaded&&!D.publicLoading)publicLoad();if(staff()&&S.view==='dash'&&S.tab==='portafolio'&&!D.adminLoaded&&!D.adminLoading&&!D.error)adminLoad();}
  applyPublic([]);root.setInterval(function(){if(!document.hidden)publicLoad(true);},60000);
  return {tab:tab,publicLoad:publicLoad,adminLoad:adminLoad,afterRender:afterRender,prepareImage:prepareImage,clearLegacy:function(){applyPublic([]);},diagnostics:function(){return {publicCount:D.publicItems.length,adminCount:staff()?D.adminItems.length:0,busy:D.busy,error:D.error};}};
 }};
})(typeof window!=='undefined'?window:globalThis);
