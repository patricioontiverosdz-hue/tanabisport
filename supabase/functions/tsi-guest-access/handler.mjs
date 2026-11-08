// No Auth signup/sign-in is used for guests. All private operations use opaque,
// revocable credentials and a fresh database permission check.
import { validatePortfolioInput } from './portfolio.mjs';
export const STAGING_PROJECT = 'nksqpoigywfegcbvfhoa';
export const ALLOWED_ORIGIN = 'https://patricioontiverosdz-hue.github.io';
const TOKEN = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2,'0')).join('');
export async function sha256(value, cryptoApi = globalThis.crypto) { return hex(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',encoder.encode(value)))); }
async function hmac(secret,value,cryptoApi) {
  const key = await cryptoApi.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await cryptoApi.subtle.sign('HMAC',key,encoder.encode(value))));
}
class GuestError extends Error { constructor(status,code,message) { super(message); this.status=status;this.code=code; } }
/** @returns {never} */
function fail(status,code,message) { throw new GuestError(status,code,message); }
function object(value) { return value && typeof value==='object' && !Array.isArray(value); }
function only(body,keys) { return object(body) && Object.keys(body).every(key=>keys.includes(key)); }
function validIds(ids) { return Array.isArray(ids) && ids.length<=50 && ids.every(x=>typeof x==='string' && x.length>0 && x.length<=160) && new Set(ids).size===ids.length; }

/** Reuse from a service-only checkout handler. The RPC never trusts folder IDs
 * supplied by the browser. A false result must block photo quotes/checkout. */
export async function validateGuestItems(token,ids,{rpc,crypto:cryptoApi=globalThis.crypto}) {
  if (!TOKEN.test(token||'') || !validIds(ids)) return {allowed:false};
  const permission=await rpc('tsi230_guest_verify_items',{session_hash:await sha256(token,cryptoApi),item_ids:ids});
  return permission?.allowed===true ? permission : {allowed:false};
}

export function createHandler(options={}) {
  const env=options.env||(()=>undefined), fetcher=options.fetch||globalThis.fetch, cryptoApi=options.crypto||globalThis.crypto, now=options.now||Date.now;
  function config() {
    const url=env('SUPABASE_URL')||'',service=env('SUPABASE_SERVICE_ROLE_KEY')||'';
    return {url:'https://'+STAGING_PROJECT+'.supabase.co',service,ready:url.replace(/\/$/,'')==='https://'+STAGING_PROJECT+'.supabase.co' && service.length>=20,
      // This handler is hard-gated to the isolated staging project. Admin-only
      // test codes work there without another secret; false explicitly closes it.
      testMode:env('TSI_GUEST_TEST_MODE')!=='false',emailReady:typeof options.sendEmail==='function' && typeof options.background==='function' && options.emailConfigured===true};
  }
  function randomToken() { return hex(cryptoApi.getRandomValues(new Uint8Array(32))); }
  function code() {
    // Rejection sampling avoids modulo bias for the six decimal digits.
    const bytes=new Uint32Array(1); do { cryptoApi.getRandomValues(bytes); } while(bytes[0]>=4294000000);
    return String(bytes[0]%1000000).padStart(6,'0');
  }
  async function rpc(name,payload) {
    const cfg=config(); if (!cfg.ready) fail(503,'guest_unavailable','El acceso invitado todavía no está disponible.');
    let response;
    try { response=await fetcher(cfg.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:cfg.service,Authorization:'Bearer '+cfg.service,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)}); }
    catch { fail(503,'guest_unavailable','No se pudo confirmar el permiso. Intenta nuevamente.'); }
    if (!response.ok) fail(response.status>=500?503:409,'guest_conflict','No se pudo completar la solicitud con este permiso. Actualiza e intenta nuevamente.');
    try { return await response.json(); } catch { fail(503,'guest_unavailable','No se pudo confirmar el permiso.'); }
  }
  async function identity(request) {
    const cfg=config(),auth=request.headers.get('authorization')||'';
    if (!/^Bearer [A-Za-z0-9_.-]{30,8192}$/.test(auth)) fail(403,'admin_required','Se requiere administración.');
    let response,data;
    try { response=await fetcher(cfg.url+'/auth/v1/user',{headers:{apikey:cfg.service,Authorization:auth},signal:AbortSignal.timeout(10000)}); data=await response.json(); } catch { fail(403,'admin_required','Se requiere administración.'); }
    if (!response.ok || !UUID.test(data?.id||'') || data.is_anonymous===true) fail(403,'admin_required','Se requiere administración.');
    return data.id;
  }
  async function admin(request) {
    const actor=await identity(request);
    // The admin RPC checks the current profiles.role from the database.
    await rpc('tsi230_guest_admin',{actor_id:actor,operation:'state',payload:{}});
    return actor;
  }
  async function quota(request,scope,limit=30,seconds=600) {
    const cfg=config(),address=(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown').slice(0,128);
    const day=new Date(now()).toISOString().slice(0,10),bucket=await hmac(cfg.service,'guest-rate:'+day+':'+address+':'+scope,cryptoApi);
    if (await rpc('tsi230_guest_rate',{bucket,window_seconds:seconds,max_hits:limit})!==true) fail(429,'rate_limit','Espera unos minutos antes de intentarlo de nuevo.');
  }
  async function grant(request,ids=[]) {
    const token=request.headers.get('x-tsi-guest-token');
    const permission=await validateGuestItems(token,ids,{rpc,crypto:cryptoApi});
    if (!permission.allowed) fail(403,'guest_permission','La invitación venció o ya no tiene permiso. Solicita acceso a administración.');
    return {permission,session_hash:await sha256(token,cryptoApi)};
  }
  async function issue(challengeId,otp) { return hmac(config().service,'guest-otp:'+challengeId+':'+otp,cryptoApi); }
  async function bodyJSON(request) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'invalid_request','Formato de solicitud inválido.');
    if (Number(request.headers.get('content-length')||0)>550000) fail(413,'invalid_request','Solicitud demasiado grande.');
    let size=0,chunks=[],reader=request.body?.getReader();
    if (!reader) fail(400,'invalid_request','Solicitud inválida.');
    try { for (;;) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>550000){await reader.cancel();fail(413,'invalid_request','Solicitud demasiado grande.');}chunks.push(value); } } finally {reader.releaseLock();}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    let parsed;try {parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(400,'invalid_request','Solicitud inválida.');}
    if(!object(parsed))fail(400,'invalid_request','Solicitud inválida.');return parsed;
  }
  return async function handler(request) {
    const origin=request.headers.get('origin'),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(origin===ALLOWED_ORIGIN)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-tsi-guest-token','Access-Control-Allow-Methods':'POST, OPTIONS'});
    function reply(value,status=200){return new Response(JSON.stringify(value),{status,headers});}
    try {
      if(origin!==ALLOWED_ORIGIN)fail(403,'origin_denied','Origen no permitido.');
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(request.method!=='POST')fail(405,'method_not_allowed','Solicitud no permitida.');
      const url=new URL(request.url);
      // Credentials never travel in query strings, fragments, redirects or logs.
      if(url.search)fail(400,'invalid_request','Usa la entrada privada de invitado.');
      if(!config().ready)fail(503,'guest_unavailable','El acceso invitado todavía no está disponible.');
      await quota(request,'all',120,60);
      const body=await bodyJSON(request),action=body.action;
      if(typeof action!=='string')fail(400,'invalid_request','Solicitud inválida.');
      if(!['portfolio/publish','portfolio/update'].includes(action)&&JSON.stringify(body).length>12000)fail(413,'invalid_request','Solicitud demasiado grande.');
      if(action==='portfolio/list'||action==='portfolio/image') {
        if(!only(body,action==='portfolio/list'?['action']:['action','id'])||(action==='portfolio/image'&&!UUID.test(body.id||'')))fail(400,'invalid_request','Fotografía inválida.');
        await quota(request,'portfolio-public',90,60);
        const result=await rpc('tsi230_portfolio_read',{item_id:action==='portfolio/image'?body.id:null});
        if(result?.unavailable)fail(404,'portfolio_unavailable','Esta fotografía ya no está disponible.');
        return reply(result);
      }
      if(['portfolio/admin-state','portfolio/publish','portfolio/update','portfolio/homepage','portfolio/revoke'].includes(action)) {
        const actor=await identity(request);
        await rpc('tsi230_portfolio_admin',{actor_id:actor,operation:'state',payload:{}});
        await quota(request,'portfolio-staff',20,60);
        if(action==='portfolio/admin-state') {
          if(!only(body,['action']))fail(400,'invalid_request','Solicitud inválida.');
          return reply(await rpc('tsi230_portfolio_admin',{actor_id:actor,operation:'state',payload:{}}));
        }
        if(action==='portfolio/revoke') {
          if(!only(body,['action','id'])||!UUID.test(body.id||''))fail(400,'invalid_request','Fotografía inválida.');
          return reply(await rpc('tsi230_portfolio_admin',{actor_id:actor,operation:'revoke',payload:{id:body.id}}));
        }
        if(action==='portfolio/homepage') {
          if(!only(body,['action','id','request_id'])||!Object.hasOwn(body,'id')||(body.id!==null&&!UUID.test(body.id||''))||!UUID.test(body.request_id||''))fail(400,'invalid_request','Selecciona una imagen de inicio publicada.');
          return reply(await rpc('tsi230_portfolio_admin',{actor_id:actor,operation:'homepage',payload:{id:body.id,request_id:body.request_id}}));
        }
        const updating=action==='portfolio/update',payload=body.payload;
        if(!only(body,updating?['action','id','payload']:['action','payload'])||updating&&!UUID.test(body.id||''))fail(400,'invalid_request','Fotografía inválida.');
        try {validatePortfolioInput(payload,{update:updating,now:now()});}catch(error){fail(400,'portfolio_input',error.message);}
        return reply(await rpc('tsi230_portfolio_admin',{actor_id:actor,operation:updating?'update':'publish',payload:updating?{...payload,id:body.id}:payload}));
      }
      if(action==='config')return reply({email_ready:config().emailReady,test_mode:config().testMode,accounts_created:false});
      if(action==='request') {
        if(!only(body,['action','invitation','email'])||!TOKEN.test(body.invitation||'')||typeof body.email!=='string'||body.email.length>254||!EMAIL.test(body.email.trim()))fail(400,'invalid_request','Revisa tu invitación y correo.');
        await quota(request,'request',5);
        // Configuration errors have exactly the same response for every identity.
        if(!config().emailReady)fail(503,'email_not_configured','El correo de invitados aún no está habilitado. Administración puede facilitar una prueba identificada.');
        const challenge_id=cryptoApi.randomUUID(),otp=code(),email=body.email.trim().toLowerCase();
        const hash=await sha256(body.invitation,cryptoApi);
        const identityBucket=await hmac(config().service,'guest-identity:'+hash+':'+email,cryptoApi);
        if(await rpc('tsi230_guest_rate',{bucket:identityBucket,window_seconds:600,max_hits:3})!==true)return reply({accepted:true,challenge_id});
        const accepted=await rpc('tsi230_guest_challenge',{challenge_id,invitation_hash:hash,email_address:email,code_hash:await issue(challenge_id,otp),test_invitation_id:null});
        // Transport latency cannot distinguish an approved email. EdgeRuntime
        // retains the task after the indistinguishable HTTP response is sent.
        if(accepted) options.background(Promise.resolve().then(()=>options.sendEmail({to:email,code:otp,expiresMinutes:5})).catch(()=>{}));
        return reply({accepted:true,challenge_id});
      }
      if(action==='verify') {
        if(!only(body,['action','challenge_id','code'])||!UUID.test(body.challenge_id||'')||!/^\d{6}$/.test(body.code||''))fail(400,'invalid_code','Revisa el código de seis dígitos.');
        await quota(request,'verify',15);
        const token=randomToken(),result=await rpc('tsi230_guest_redeem',{challenge_id:body.challenge_id,code_hash:await issue(body.challenge_id,body.code),session_hash:await sha256(token,cryptoApi)});
        if(!result?.allowed)fail(403,'invalid_code','El código no es válido o venció. Solicita otro a administración.');
        return reply({token,expires_at:result.expires_at});
      }
      if(['status','list','preview','original','validate','logout'].includes(action)) {
        if(!only(body,['action','id','ids']))fail(400,'invalid_request','Solicitud inválida.');
        if(['preview','original'].includes(action) && (typeof body.id!=='string'||!body.id||body.id.length>160))fail(400,'invalid_request','Fotografía inválida.');
        if(action==='validate'&&!validIds(body.ids))fail(400,'invalid_request','Fotografías inválidas.');
        const ids=action==='validate'?body.ids:['preview','original'].includes(action)?[body.id]:[];
        const access=await grant(request,ids);
        await quota(request,'read',250,60);
        if(action==='logout'){await rpc('tsi230_guest_logout',{session_hash:access.session_hash});return reply({closed:true});}
        if(action==='status'||action==='validate')return reply(access.permission);
        if(action==='original')fail(403,'original_delivery_required','La entrega de originales se confirma con el pedido y su permiso vigente.');
        const result=await rpc('tsi230_guest_catalog',{session_hash:access.session_hash,item_key:action==='preview'?body.id:null,original:false});
        if(!result?.allowed)fail(403,'guest_permission','El permiso dejó de estar vigente.');
        return reply(result);
      }
      if(action==='admin'||action==='admin-test-code') {
        const actor=await admin(request);await quota(request,'admin',60,60);
        if(action==='admin-test-code') {
          if(!only(body,['action','invitation_id'])||!UUID.test(body.invitation_id||''))fail(400,'invalid_request','Invitación inválida.');
          if(!config().testMode)fail(403,'test_disabled','Las pruebas de invitados están deshabilitadas.');
          await quota(request,'test-code',5,600);
          const challenge_id=cryptoApi.randomUUID(),otp=code();
          const accepted=await rpc('tsi230_guest_challenge',{challenge_id,invitation_hash:null,email_address:null,code_hash:await issue(challenge_id,otp),test_invitation_id:body.invitation_id});
          if(!accepted)fail(409,'test_unavailable','La invitación de prueba no está vigente.');
          return reply({test_only:true,challenge_id,code:otp,expires_minutes:5,notice:'PRUEBA: código obtenido exclusivamente por administración; no se envió correo.'});
        }
        if(!only(body,['action','operation','payload'])||!object(body.payload)||!['state','folder-create','folder-sync','contact-create','invite-create','revoke'].includes(body.operation))fail(400,'invalid_request','Operación inválida.');
        let payload={...body.payload},invitation;
        const fields={'state':[],'folder-create':['label','season_end'],'folder-sync':['folder_id'],'contact-create':['folder_id','name','email','relationship','approved'],'invite-create':['contact_id','expires_at','test_mode'],'revoke':['kind','id']};
        if(!only(payload,fields[body.operation]))fail(400,'invalid_request','Los datos de la operación no son válidos.');
        if(body.operation==='invite-create') {
          if(payload.test_mode!==undefined && typeof payload.test_mode!=='boolean')fail(400,'invalid_request','Modo de invitación inválido.');
          if(payload.test_mode===true && !config().testMode)fail(403,'test_disabled','Las pruebas de invitados están deshabilitadas.');
          if(payload.test_mode!==true && !config().emailReady)fail(503,'email_not_configured','No hay un transporte de correo habilitado. Usa únicamente invitaciones marcadas PRUEBA.');
          invitation=randomToken();payload.token_hash=await sha256(invitation,cryptoApi);
        }
        const result=await rpc('tsi230_guest_admin',{actor_id:actor,operation:body.operation,payload});
        return reply({...result,email_ready:config().emailReady,test_mode:config().testMode,...(invitation?{invitation}: {})});
      }
      fail(400,'invalid_request','Operación inválida.');
    } catch(error) {
      // Deliberately no request/exception logging: credentials and PII stay out.
      return reply({error:error instanceof GuestError?error.code:'guest_unavailable',message:error instanceof GuestError?error.message:'No se pudo completar el acceso. Intenta nuevamente.'},error instanceof GuestError?error.status:503);
    }
  };
}
