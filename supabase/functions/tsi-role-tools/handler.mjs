// This endpoint deliberately runs only against the isolated staging project.
export const PROJECT='nksqpoigywfegcbvfhoa';
export const ORIGIN='https://patricioontiverosdz-hue.github.io';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class RoleToolsError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
function fail(status,code,message){throw new RoleToolsError(status,code,message);}
const invalid=()=>fail(400,'ROLE_TOOLS_INVALID','Revisa las herramientas y vuelve a intentar.');
async function bodyOf(req){
 const reader=req.body?.getReader();if(!reader)invalid();let chunks=[],size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();fail(413,'ROLE_TOOLS_INVALID','La solicitud es demasiado grande.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let off=0;for(const part of chunks){bytes.set(part,off);off+=part.byteLength;}
 try{const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!p||typeof p!=='object'||Array.isArray(p))invalid();return p;}catch(e){if(e instanceof RoleToolsError)throw e;invalid();}
}
export function validateSave(p){
 const keys=['role','enabled','expected_version','request_id'];
 if(Object.keys(p).length!==keys.length||!keys.every(k=>Object.hasOwn(p,k))||!['foto','editora'].includes(p.role)
 ||!Array.isArray(p.enabled)||p.enabled.length>100||!p.enabled.every(x=>typeof x==='string'&&/^[a-z][a-z0-9]{0,39}$/.test(x))
 ||new Set(p.enabled).size!==p.enabled.length||!p.enabled.includes('resumen')||!Number.isSafeInteger(p.expected_version)||p.expected_version<1
 ||!UUID.test(p.request_id||''))invalid();
 return {role:p.role,enabled:p.enabled,expected_version:p.expected_version,request_id:p.request_id};
}
export function createHandler(options={}){
 const env=options.env||(()=>''),send=options.fetch||globalThis.fetch;
 return async req=>{
  const origin=req.headers.get('origin'),headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try{
   if(origin&&origin!==ORIGIN)fail(403,'ROLE_TOOLS_FORBIDDEN','Origen no permitido.');
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(req.method!=='POST')fail(405,'ROLE_TOOLS_INVALID','Usa una solicitud POST.');
   const base=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
   if(base!=='https://'+PROJECT+'.supabase.co'||typeof secret!=='string'||secret.length<20)fail(503,'ROLE_TOOLS_UNAVAILABLE','La configuración no está disponible.');
   const auth=req.headers.get('authorization')||'';
   if(!/^Bearer \S+$/i.test(auth)||auth.length>8192)fail(401,'ROLE_TOOLS_UNAUTHENTICATED','Entra con tu cuenta de equipo.');
   const route=new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
   if(!['config','save'].includes(route))fail(404,'ROLE_TOOLS_INVALID','Solicitud no disponible.');
   if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail(415,'ROLE_TOOLS_INVALID','Usa el formato de la aplicación.');
   const p=await bodyOf(req);if(route==='config'&&Object.keys(p).length)invalid();const payload=route==='save'?validateSave(p):{};
   const call=(path,init)=>send(base+path,{...init,signal:AbortSignal.timeout(12000)});
   const authenticated=await call('/auth/v1/user',{headers:{apikey:secret,Authorization:auth}});
   if(!authenticated.ok)fail(401,'ROLE_TOOLS_UNAUTHENTICATED','Tu sesión venció. Entra de nuevo.');
   const user=await authenticated.json();if(!UUID.test(user?.id||'')||user.is_anonymous===true)fail(403,'ROLE_TOOLS_FORBIDDEN','Se requiere una cuenta de equipo.');
   const serverHeaders={apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'};
   const profile=await call('/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=id,role&limit=1',{headers:serverHeaders});
   if(!profile.ok)fail(503,'ROLE_TOOLS_UNAVAILABLE','No pudimos comprobar tu cuenta.');
   const rows=await profile.json(),role=rows?.[0]?.role;
   if(!['admin','foto','editora'].includes(role)||route==='save'&&role!=='admin')fail(403,'ROLE_TOOLS_FORBIDDEN','Solo administración puede cambiar estas herramientas.');
   const result=await call('/rest/v1/rpc/tsi230_role_tools_command',{method:'POST',headers:serverHeaders,body:JSON.stringify({actor_id:user.id,operation:route,payload})});
   if(!result.ok){let err;try{err=await result.json();}catch{}const message=err?.message||'';
    if(message.includes('ROLE_TOOLS_CONFLICT'))fail(409,'ROLE_TOOLS_CONFLICT','Otra sesión cambió estas herramientas. Actualiza antes de guardar.');
    if(message.includes('ROLE_TOOLS_FORBIDDEN'))fail(403,'ROLE_TOOLS_FORBIDDEN','Tu cuenta ya no puede cambiar estas herramientas.');
    if(message.includes('ROLE_TOOLS_INVALID'))invalid();
    fail(503,'ROLE_TOOLS_UNAVAILABLE','No pudimos confirmar el cambio. Puedes reintentar.');
   }
   return reply(await result.json());
  }catch(e){return reply({error:e instanceof RoleToolsError?e.message:'No pudimos conectar. Puedes reintentar.',code:e instanceof RoleToolsError?e.code:'ROLE_TOOLS_UNAVAILABLE'},e instanceof RoleToolsError?e.status:503);}
 };
}
