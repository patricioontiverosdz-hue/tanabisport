import { createTabiPayments } from './tabi-payments.mjs';
import { answer } from './assistant.mjs';
// Isolated staging endpoint. No customer Auth accounts, email delivery, or gallery authorization.
export const PROJECT = 'nksqpoigywfegcbvfhoa';
export const ORIGIN = 'https://patricioontiverosdz-hue.github.io';
export const CATEGORIES = ['Cotización','Entrega','Tienda','Correcciones','Pagos','FAQ','Humano'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[0-9a-f]{64}$/;
class SupportError extends Error { constructor(status,message){super(message);this.status=status;} }
function fail(status,message){throw new SupportError(status,message);}
function clean(value,max,required=false){if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))fail(400,'Revisa la información enviada.');const s=value.trim();if(required&&!s)fail(400,'Completa los datos requeridos.');return s;}
function requestId(p){if(!UUID.test(p.request_id||''))fail(400,'Falta el identificador de la solicitud.');return p.request_id;}
export function validateContact(p){
 const name=clean(p.name,100,true),email=clean(p.email||'',254).toLowerCase(),raw=clean(p.phone||'',40),phone=raw.replace(/[\s().-]/g,'');
 if(name.length<2||!email&&!phone||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone&&!/^\+?\d{10,15}$/.test(phone))fail(400,'Escribe tu nombre y un correo válido o WhatsApp de 10 a 15 dígitos.');
 if(p.consent!==true)fail(400,'Acepta el uso de estos datos para atender tu solicitud.');return {name,email,phone,consent:true};
}
export function validateAvatar(data){
 if(data==='')return '';
 if(typeof data!=='string'||data.length>355000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))fail(400,'Elige una foto PNG o JPEG de hasta 256 KB.');
 let bytes;try{bytes=Uint8Array.from(atob(data.split(',')[1]),x=>x.charCodeAt(0));}catch{fail(400,'La foto no es válida.');}
 if(bytes.length>262144||bytes.length<32)fail(400,'La foto supera 256 KB o está incompleta.');
 let w=0,h=0;const dv=new DataView(bytes.buffer);
 if(data.startsWith('data:image/png;')){
  if(![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)||dv.getUint32(8)!==13||dv.getUint32(12)!==0x49484452)fail(400,'La foto PNG no es válida.');
  w=dv.getUint32(16);h=dv.getUint32(20);
  if(dv.getUint32(bytes.length-8)!==0x49454e44)fail(400,'La foto PNG está incompleta.');
 }else{
  if(bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)fail(400,'La foto JPEG no es válida.');
  let i=2;while(i+8<bytes.length){if(bytes[i++]!==255)break;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===218||marker===217)break;if(marker===1||marker>=208&&marker<=215)continue;const size=dv.getUint16(i);if(size<2||i+size>bytes.length)break;if([192,193,194].includes(marker)){h=dv.getUint16(i+3);w=dv.getUint16(i+5);break;}i+=size;}
 }
 if(w<16||h<16||w>512||h>512)fail(400,'La foto debe medir entre 16 y 512 píxeles por lado.');return data;
}
export async function hash(value,cryptoApi=globalThis.crypto){return [...new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function bodyOf(req){
 const reader=req.body?.getReader();if(!reader)return {};let size=0,parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>370000){await reader.cancel();fail(413,'La solicitud es demasiado grande.');}parts.push(value);}}finally{reader.releaseLock();}
 const b=new Uint8Array(size);let i=0;for(const p of parts){b.set(p,i);i+=p.length;}
 try{const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));if(!p||typeof p!=='object'||Array.isArray(p))throw Error();return p;}catch{fail(400,'La solicitud no es válida.');}
}
export function createHandler(options={}){
 const env=options.env||(()=>''),fetcher=options.fetch||globalThis.fetch,cryptoApi=options.crypto||globalThis.crypto;
 async function db(path,p,method='POST'){
  const base=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(base!=='https://'+PROJECT+'.supabase.co'||!key||key.length<20)fail(503,'Atención todavía no está disponible. Intenta más tarde.');
  let r;try{r=await fetcher(base+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(p),signal:AbortSignal.timeout(15000)});}catch{fail(503,'No se pudo conectar. Tu mensaje sigue pendiente; vuelve a intentar.');}
  if(!r.ok){let e;try{e=await r.json();}catch{}const m=e?.message||'';
   if(m.includes('SUPPORT_EXPIRED'))fail(401,'Esta sesión de atención venció. Inicia una conversación nueva.');
   if(m.includes('SUPPORT_LIMIT'))fail(429,'Hay muchas solicitudes. Espera un momento antes de intentar.');
   if(m.includes('SUPPORT_FORBIDDEN'))fail(403,'Tu cuenta no tiene acceso a esta atención.');
   if(m.includes('SUPPORT_CONFLICT'))fail(409,'La solicitud cambió. Actualiza e intenta nuevamente.');
   if(m.includes('SUPPORT_PAID'))fail(409,'Esta cobertura ya no tiene un pago pendiente. Actualiza el seguimiento.');
   if(m.includes('SUPPORT_UNAVAILABLE'))fail(409,'Ese partido ya no tiene disponibilidad confirmada. Consulta los partidos de nuevo.');
   if(m.includes('SUPPORT_MINIMUM'))fail(400,'No se alcanza el mínimo del equipo. Puedes elegir el paquete individual.');
   if(m.includes('SUPPORT_DEPOSIT_CONFIG'))fail(409,'Administración debe definir el anticipo individual antes de confirmar este paquete.');
   fail(r.status>=500?503:400,'No pudimos guardar la solicitud. Vuelve a intentar.');
  }return r.json();
 }
 async function staff(req){
  const bearer=req.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(bearer))fail(401,'Entra con tu cuenta de equipo.');
  const base=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');if(base!=='https://'+PROJECT+'.supabase.co'||!key)fail(503,'Atención no está disponible.');
  let r;try{r=await fetcher(base+'/auth/v1/user',{headers:{apikey:key,Authorization:bearer},signal:AbortSignal.timeout(10000)});}catch{fail(503,'No se pudo verificar la sesión.');}
  if(!r.ok)fail(401,'Tu sesión venció. Entra de nuevo.');const u=await r.json();if(!UUID.test(u.id||'')||u.is_anonymous)fail(403,'Se requiere una cuenta de equipo.');
  const rows=await db('/rest/v1/profiles?id=eq.'+u.id+'&select=id,role',null,'GET');if(!['admin','foto','editora'].includes(rows?.[0]?.role))fail(403,'Esta bandeja es solo para el equipo.');return u.id;
 }
 async function staffTools(req){
  const base=env('SUPABASE_URL'),key=env('SUPABASE_ANON_KEY');
  if(base!=='https://'+PROJECT+'.supabase.co'||!key)fail(503,'No se pudo comprobar el acceso a Atención.');
  // The assertion derives auth.uid() from this user's JWT. A service bearer would
  // lose that identity and must never be used for this permission check.
  let r;try{r=await fetcher(base+'/rest/v1/rpc/tsi230_assert_tool_enabled',{method:'POST',headers:{apikey:key,Authorization:req.headers.get('authorization'),'Content-Type':'application/json'},body:JSON.stringify({tool_id:'atencion'}),signal:AbortSignal.timeout(10000)});}catch{fail(503,'No se pudo comprobar el acceso a Atención.');}
  if(!r.ok){let e;try{e=await r.json();}catch{}
   if((e?.message||'').includes('ROLE_TOOLS_DISABLED'))fail(403,'Atención a clientes no está disponible para tu rol.');
   if(r.status===401)fail(401,'Tu sesión venció. Entra de nuevo.');
   fail(503,'No se pudo comprobar el acceso a Atención.');
  }
  let allowed;try{allowed=await r.json();}catch{}
  if(allowed!==true)fail(503,'No se pudo comprobar el acceso a Atención.');
 }
 const payments=createTabiPayments({env,db,fail,stripeFactory:options.stripeFactory,now:options.now});
 return async req=>{
  const origin=req.headers.get('origin');const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-support-token','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
  if(origin&&origin!==ORIGIN)return reply({error:'Origen no permitido.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   if(req.method!=='POST')fail(405,'Usa una solicitud POST.');
   const route=new URL(req.url).pathname.split('/').filter(Boolean).at(-1),p=await bodyOf(req);let actor=null,session_hash=null,payload={};
   if(['staff-list','staff-thread','staff-message','staff-status','staff-claim','staff-resume','staff-booking','staff-slots','profile','avatar'].includes(route))actor=await staff(req);
   else if(['register','history','message','draft','submit','category','quote','confirm','slots','checkout','payment-status','payment-config'].includes(route)){const token=req.headers.get('x-support-token')||'';if(!TOKEN.test(token))fail(401,'Falta la autorización de esta conversación.');session_hash=await hash(token,cryptoApi);}
   else fail(404,'Solicitud no disponible.');
   if(['staff-list','staff-thread','staff-message','staff-status','staff-claim','staff-resume','staff-booking','staff-slots'].includes(route))await staffTools(req);
   if(route==='register'){payload={...validateContact(p),request_id:requestId(p)};if(!payload.phone)fail(400,'Escribe tu WhatsApp para dar seguimiento.');}
   if(['message','staff-message'].includes(route))payload={text:clean(p.text,4000,true),request_id:requestId(p)};
   if(['category','draft','submit'].includes(route)){
    if(!CATEGORIES.includes(p.category))fail(400,'Elige un motivo de atención.');payload={category:p.category,request_id:requestId(p)};
    if(route!=='category'){payload.summary=clean(p.summary,4000,true);}
   }
   if(['staff-thread','staff-message','staff-status','staff-claim','staff-resume','staff-booking','staff-slots'].includes(route)){if(!UUID.test(p.thread_id||''))fail(400,'Selecciona una conversación.');payload.thread_id=p.thread_id;}
   if(route==='staff-status'){if(!['Por atender','En atención','Resuelta'].includes(p.status))fail(400,'Selecciona un estado válido.');payload.status=p.status;payload.request_id=requestId(p);}
   if(route==='staff-list'){payload.offset=Number.isSafeInteger(p.offset)&&p.offset>=0&&p.offset<=100000?p.offset:0;payload.status=['Por atender','En atención','Resuelta'].includes(p.status)?p.status:'';}
   if(route==='quote'){
    if(!['flag','tackle'].includes(p.sport)||!['equipo','individual'].includes(p.package)||!Number.isSafeInteger(p.players)||p.players<1||p.players>100)fail(400,'Revisa deporte, paquete y jugadores.');
    payload={sport:p.sport,package:p.package,players:p.players,team:clean(p.team,120,true),event_date:clean(p.event_date||'',10),event_time:clean(p.event_time||'',5),event_venue:clean(p.event_venue||'',200),request_id:requestId(p)};
   }
   if(route==='quote'){
    if(payload.event_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(payload.event_date)||!Number.isFinite(Date.parse(payload.event_date+'T12:00:00Z'))||new Date(payload.event_date+'T12:00:00Z').toISOString().slice(0,10)!==payload.event_date))fail(400,'Revisa la fecha del evento o déjala por confirmar.');
    if(payload.event_time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.event_time))fail(400,'Revisa la hora del evento o déjala por confirmar.');
   }
   if(route==='confirm'){if(!UUID.test(p.booking_id||'')||p.accept_terms!==true)fail(400,'Acepta las condiciones antes de confirmar.');payload={booking_id:p.booking_id,accept_terms:true,request_id:requestId(p)};}
   if(['staff-claim','staff-resume','staff-booking'].includes(route))payload.request_id=requestId(p);
   if(route==='staff-booking'){
    if(p.match_id!==undefined)payload.match_id=clean(p.match_id,200);
    if(p.paid!==undefined){if(!Number.isFinite(p.paid)||p.paid<0||p.paid>1000000)fail(400,'Revisa el importe recibido.');payload.paid=p.paid;}
    if(p.discount!==undefined){if(!Number.isFinite(p.discount)||p.discount<0||p.discount>1000000)fail(400,'Revisa el descuento.');payload.discount=p.discount;}
    if(p.progress!==undefined){if(!['Programada','En edición','Lista','Entregada'].includes(p.progress))fail(400,'Revisa el avance.');payload.progress=p.progress;}
    if(p.delivery_url!==undefined){payload.delivery_url=clean(p.delivery_url,2000);if(payload.delivery_url){let u;try{u=new URL(payload.delivery_url);}catch{}if(!u||u.protocol!=='https:'||u.username||u.password)fail(400,'Usa un enlace HTTPS válido.');}}
   }
   if(route==='avatar')payload={avatar:validateAvatar(p.avatar)};
   const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown';
   const rateKey=await hash((env('SUPABASE_SERVICE_ROLE_KEY')||'')+':support230:'+ (route==='register'?ip:actor||session_hash||'')+':'+(route==='register'?'register':'request'),cryptoApi);
   await db('/rest/v1/rpc/tsi230_support_rate',{key_hash:rateKey,limit_count:route==='register'?8:120});
   if(route==='checkout'){requestId(p);const paymentKey=await hash((env('SUPABASE_SERVICE_ROLE_KEY')||'')+':tabi-checkout:'+session_hash,cryptoApi);await db('/rest/v1/rpc/tsi230_support_rate',{key_hash:paymentKey,limit_count:10});return reply(await payments.start(session_hash));}
   if(route==='payment-status')return reply(await payments.refresh(session_hash));
   if(route==='payment-config')return reply({ready:payments.ready(),test_mode:true});
   let result=await db('/rest/v1/rpc/tsi231_support_command',{operation:route,payload,session_hash,actor});
   if(['message','submit','category'].includes(route)&&!result.thread?.bot_paused){
    const text=route==='message'?payload.text:route==='submit'?payload.summary:payload.category==='Humano'?'humano':payload.category;
    for(let attempt=0;attempt<2;attempt++){
     const plan=answer(text,result.assistant_state||{},result);
     result=await db('/rest/v1/rpc/tsi231_support_command',{operation:'assist',payload:{...plan,request_id:payload.request_id,expected_version:result.thread.version},session_hash,actor:null});
     if(!result.retry_assistant)break;
    }
   }
   return reply(result);
  }catch(e){return reply({error:e instanceof SupportError?e.message:'Atención no está disponible. Intenta nuevamente.'},e instanceof SupportError?e.status:503);}
 };
}
