export const STAGING_URL='https://nksqpoigywfegcbvfhoa.supabase.co';
const ORIGIN='https://patricioontiverosdz-hue.github.io';
const ROLES=new Set(['admin','foto','editora']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS={camera:['shutter','aperture','iso'],editing:['exposure','temperature','highlights','shadows','contrast','saturation','crop','panX','panY']};
function exactKeys(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
async function boundedJson(request){
 if(Number(request.headers.get('content-length'))>4096)throw Error('size');
 const reader=request.body?.getReader();if(!reader)throw Error('body');let chunks=[],size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw Error('size');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export function createHandler({url,anonKey,serviceKey,models,fetch:send=globalThis.fetch}){
 return async function handle(request){
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin===ORIGIN)Object.assign(headers,{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'});
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&origin!==ORIGIN)return reply(403,{error:'Origen no permitido.'});
  if(String(url).replace(/\/$/,'')!==STAGING_URL||!anonKey||!serviceKey)return reply(503,{error:'Entrenamiento no disponible.'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{error:'Método no permitido.'});
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer \S+$/i.test(authorization)||authorization.length>8192)return reply(401,{error:'Inicia sesión para participar.'});
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(415,{error:'Formato no admitido.'});
  const call=(path,init)=>send(STAGING_URL+path,{...init,signal:AbortSignal.timeout(10000)});
  try{
   const auth=await call('/auth/v1/user',{headers:{apikey:anonKey,Authorization:authorization}});
   if(!auth.ok)return reply(401,{error:'La sesión no es válida.'});
   const user=await auth.json();
   if(!UUID.test(user?.id||'')||user.is_anonymous===true)return reply(401,{error:'La sesión no es válida.'});
   const serverHeaders={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
   const profile=await call('/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role&limit=1',{headers:serverHeaders});
   if(!profile.ok)return reply(502,{error:'No pudimos comprobar la cuenta.'});
   const rows=await profile.json();if(!Array.isArray(rows)||!ROLES.has(rows[0]?.role))return reply(403,{error:'Acceso exclusivo del equipo.'});
   let payload,result,scene;
   try{
    payload=await boundedJson(request);
    if(!exactKeys(payload,['game','sceneId','settings'])||typeof payload.game!=='string'||!Object.hasOwn(KEYS,payload.game)||typeof payload.sceneId!=='string'||!exactKeys(payload.settings,KEYS[payload.game]))throw Error('payload');
    const model=models[payload.game];scene=model.SCENES.find(candidate=>candidate.id===payload.sceneId);if(!scene)throw Error('scene');
    result=model.evaluate(scene,payload.settings);
    if(!Number.isInteger(result.score)||result.score<0||result.score>100||typeof result.passed!=='boolean')throw Error('score');
   }catch{return reply(400,{error:'El reto o los ajustes no son válidos.'});}
   const saved=await call('/rest/v1/rpc/tsi_game_save_result',{method:'POST',headers:serverHeaders,body:JSON.stringify({p_user_id:user.id,p_game:payload.game,p_scene_id:scene.id,p_score:result.score,p_passed:result.passed,p_settings:payload.settings})});
   if(!saved.ok)return reply(502,{error:'No pudimos guardar el intento. Puedes reintentarlo.'});
   const row=await saved.json();if(!Number.isInteger(row?.best_score)||row.best_score<result.score||row.best_score>100)return reply(502,{error:'El guardado no se pudo confirmar.'});
   return reply(200,{accepted:true,game:payload.game,sceneId:scene.id,score:result.score,passed:result.passed,best_score:row.best_score});
  }catch{return reply(502,{error:'El ranking no está disponible. Puedes reintentarlo.'});}
 };
}
