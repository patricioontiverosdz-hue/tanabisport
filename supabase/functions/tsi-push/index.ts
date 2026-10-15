import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import { CATEGORIES, TABS, validEndpoint, validSubscription, validatePreferences, quietNow, nextAllowed } from './rules.mjs';

let runtime:Record<string,string>={};
let runtimeLoaded=0;
const env = (key: string) => Deno.env.get(key) || runtime[key] || '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth:{ persistSession:false, autoRefreshToken:false } });
const defaults = { enabled:true, categories:CATEGORIES, quiet_enabled:true, quiet_start:22, quiet_end:8, timezone:'America/Monterrey' };
function check<T extends { error: unknown }>(r:T):T { if(r.error) throw new Error('No se pudo completar la operación en TSI.'); return r; }
async function loadRuntimeConfig() {
  if(runtimeLoaded && Date.now()-runtimeLoaded<300_000)return;
  // Sólo service_role puede leer esta configuración cifrada en Supabase Vault.
  const r=check(await db.rpc('tsi_push_server_config'));
  if(!r.data || typeof r.data.VAPID_PRIVATE_KEY!=='string')throw new Error('Servicio sin configurar.');
  runtime=r.data;runtimeLoaded=Date.now();
}
async function secretMatches(a:string,b:string) {
  if (!a || !b) return false;
  const digest = async (s:string) => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [x,y]=await Promise.all([digest(a),digest(b)]); let diff=0;
  for(let i=0;i<x.length;i++) diff |= x[i]^y[i];
  return diff===0;
}
async function dispatch() {
  if(!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY') || !env('VAPID_SUBJECT')) throw new Error('Configura las claves de notificaciones.');
  webpush.setVapidDetails(env('VAPID_SUBJECT'),env('VAPID_PUBLIC_KEY'),env('VAPID_PRIVATE_KEY'));
  // Un lease agotado en el quinto intento debe quedar visible como fallido.
  check(await db.from('tsi_push_events').update({state:'failed',last_error:'Se agotaron los reintentos.'}).eq('state','sending').gte('attempts',5).lt('leased_until',new Date().toISOString()));
  const events=check(await db.rpc('tsi_push_claim',{batch_size:5})).data || [];
  let sent=0,skipped=0,failed=0;
  for(const e of events) {
    const update = async (patch:Record<string,unknown>) => check(await db.from('tsi_push_events').update({leased_until:null,...patch}).eq('id',e.id));
    try {
      const profile=check(await db.from('profiles').select('role').eq('id',e.user_id).maybeSingle()).data;
      const pref=check(await db.from('tsi_push_preferences').select('*').eq('user_id',e.user_id).maybeSingle()).data || defaults;
      if(!profile || !['foto','editora','admin'].includes(profile.role) || !pref.enabled || !pref.categories.includes(e.category) || e.read_at) {
        await update({state:'skipped'}); skipped++; continue;
      }
      if(quietNow(pref)) {
        // Esperar al fin del silencio no cuenta como un fallo de entrega.
        await update({state:'pending',attempts:Math.max(0,e.attempts-1),available_at:nextAllowed(pref)}); continue;
      }
      if(Date.now()-new Date(e.created_at).getTime()>24*60*60*1000) {
        await update({state:'skipped',last_error:'Aviso antiguo; disponible en el historial.'}); skipped++; continue;
      }
      const subs=check(await db.from('tsi_push_subscriptions').select('*').eq('user_id',e.user_id)).data || [];
      const receipts=check(await db.from('tsi_push_receipts').select('subscription_id').eq('event_id',e.id)).data || [];
      const done=new Set(receipts.map((r:{subscription_id:string})=>r.subscription_id));
      let retry=false;
      await Promise.all(subs.map(async sub => {
        if(done.has(sub.id)) return;
        if(!validSubscription(sub.subscription)) { check(await db.from('tsi_push_subscriptions').delete().eq('id',sub.id)); return; }
        try {
          await webpush.sendNotification(sub.subscription,JSON.stringify({id:e.id,title:e.title,body:e.body,tab:TABS.includes(e.tab)?e.tab:'notif'}),{TTL:3600,urgency:'normal',timeout:10_000});
          check(await db.from('tsi_push_receipts').upsert({event_id:e.id,subscription_id:sub.id},{onConflict:'event_id,subscription_id'}));
        } catch(err) {
          const status=(err as {statusCode?:number}).statusCode;
          if(status===404 || status===410) check(await db.from('tsi_push_subscriptions').delete().eq('id',sub.id));
          else retry=true;
        }
      }));
      if(retry) throw new Error('Entrega pendiente.');
      await update({state:subs.length?'sent':'skipped',last_error:null}); sent++;
    } catch {
      await update({state:e.attempts>=5?'failed':'pending',last_error:'No se completó la entrega. Revisa las claves y el servicio.',available_at:new Date(Date.now()+Math.min(60,2**e.attempts)*60_000).toISOString()}); failed++;
    }
  }
  return {processed:events.length,sent,skipped,failed};
}
Deno.serve(async req => {
  try{await loadRuntimeConfig();}catch{return new Response(JSON.stringify({error:'El servicio de avisos todavía no está configurado.'}),{status:503,headers:{'Content-Type':'application/json'}});}
  const origin=req.headers.get('origin');
  const allowed=env('TSI_ALLOWED_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean);
  const headers:Record<string,string>={'Content-Type':'application/json','Vary':'Origin'};
  if(origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin']=origin;
  const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin && !allowed.includes(origin)) return reply({error:'Origen no autorizado.'},403);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type'}});
  if(req.method!=='POST') return reply({error:'Método no permitido.'},405);
  try {
    const raw=await req.text();
    if(raw.length>12_000) return reply({error:'Solicitud demasiado grande.'},413);
    const body=JSON.parse(raw || '{}');
    if(body.action==='dispatch') {
      if(origin || !(await secretMatches(req.headers.get('x-tsi-cron') || '',env('TSI_CRON_SECRET')))) return reply({error:'Acceso denegado.'},401);
      return reply(await dispatch());
    }
    const token=(req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'');
    if(!token) return reply({error:'Inicia sesión.'},401);
    const auth=await db.auth.getUser(token);
    if(auth.error || !auth.data.user) return reply({error:'Tu sesión venció. Vuelve a entrar.'},401);
    const uid=auth.data.user.id;
    const profile=check(await db.from('profiles').select('role').eq('id',uid).maybeSingle()).data;
    if(!profile || !['foto','editora','admin'].includes(profile.role)) return reply({error:'Cuenta sin acceso al equipo.'},403);
    if(body.action==='status') {
      const preferences=check(await db.from('tsi_push_preferences').select('*').eq('user_id',uid).maybeSingle()).data || defaults;
      const events=check(await db.from('tsi_push_events').select('id,category,title,body,tab,created_at,read_at,state').eq('user_id',uid).order('created_at',{ascending:false}).limit(60)).data;
      const endpoint=body.endpoint;
      const registered=endpoint ? !!check(await db.from('tsi_push_subscriptions').select('id').eq('user_id',uid).eq('endpoint',endpoint).maybeSingle()).data : false;
      return reply({publicKey:env('VAPID_PUBLIC_KEY'),preferences,events,registered});
    }
    if(body.action==='subscribe') {
      if(!validSubscription(body.subscription)) return reply({error:'Dispositivo de notificaciones no válido.'},400);
      if(!env('VAPID_PUBLIC_KEY')) return reply({error:'Falta configurar el servicio de notificaciones.'},503);
      const count=check(await db.from('tsi_push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',uid)).count || 0;
      const existing=check(await db.from('tsi_push_subscriptions').select('id').eq('endpoint',body.subscription.endpoint).maybeSingle()).data;
      if(count>=10 && !existing) return reply({error:'Límite de 10 dispositivos alcanzado.'},409);
      check(await db.from('tsi_push_subscriptions').upsert({user_id:uid,endpoint:body.subscription.endpoint,subscription:body.subscription,updated_at:new Date().toISOString()},{onConflict:'endpoint'}));
      return reply({ok:true});
    }
    if(body.action==='unsubscribe') {
      if(!validEndpoint(body.endpoint)) return reply({error:'Dispositivo no válido.'},400);
      check(await db.from('tsi_push_subscriptions').delete().eq('user_id',uid).eq('endpoint',body.endpoint));
      return reply({ok:true});
    }
    if(body.action==='preferences') {
      if(!validatePreferences(body.preferences)) return reply({error:'Revisa las categorías, zona horaria y horario de silencio.'},400);
      const p=body.preferences;
      check(await db.from('tsi_push_preferences').upsert({user_id:uid,enabled:p.enabled,categories:p.categories,quiet_enabled:p.quiet_enabled,quiet_start:p.quiet_start,quiet_end:p.quiet_end,timezone:p.timezone}));
      return reply({ok:true});
    }
    if(body.action==='read') {
      if(!Array.isArray(body.ids) || body.ids.length>60 || body.ids.some((id:unknown)=>typeof id!=='string')) return reply({error:'Selección no válida.'},400);
      if(body.ids.length) check(await db.from('tsi_push_events').update({read_at:new Date().toISOString()}).eq('user_id',uid).in('id',body.ids));
      return reply({ok:true});
    }
    if(body.action==='test') {
      const recent=check(await db.from('tsi_push_events').select('id',{count:'exact',head:true}).eq('user_id',uid).like('event_key','test:%').gte('created_at',new Date(Date.now()-600_000).toISOString())).count || 0;
      if(recent>=3) return reply({error:'Ya solicitaste tres pruebas. Espera diez minutos.'},429);
      const subscribed=check(await db.from('tsi_push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',uid)).count || 0;
      if(!subscribed) return reply({error:'Primero activa este dispositivo.'},409);
      check(await db.from('tsi_push_events').insert({user_id:uid,event_key:'test:'+crypto.randomUUID(),category:'avisos',title:'Prueba de Tanabi Sports',body:'Las notificaciones de este dispositivo están configuradas.',tab:'notif'}));
      return reply({ok:true,message:'Prueba en cola. Respeta tus preferencias y horario de silencio; aparecerá cuando el envío programado la procese.'});
    }
    return reply({error:'Acción no disponible.'},400);
  } catch {
    // No exponer tokens, endpoints ni respuestas de proveedores al navegador.
    return reply({error:'No se pudo completar. Revisa la configuración del servicio y vuelve a intentar.'},500);
  }
});
