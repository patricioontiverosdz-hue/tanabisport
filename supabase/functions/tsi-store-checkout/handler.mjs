// Pure Web API handler. Runtime secrets and the Stripe SDK are injected by index.ts.
export const STRIPE_API_VERSION = '2026-08-26.dahlia';
export const STAGING_PROJECT = 'nksqpoigywfegcbvfhoa';
export const STRIPE_TEST_ACCOUNT = 'acct_1UVH3OQ9WFCZJIYG';
export const STORE_ORIGIN = 'https://patricioontiverosdz-hue.github.io';
export const RETURN_URL = STORE_ORIGIN + '/tanabisport/staging/?store_return=1&session_id={CHECKOUT_SESSION_ID}';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;
const ORDER_REFERENCE = /^TS-[0-9A-F]{16}$/;
const SESSION = /^cs_test_[A-Za-z0-9_]{8,240}$/;
const EVENTS = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired']);
const encoder = new TextEncoder();

export class StoreError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
/** @returns {never} */
function fail(status, code, message) { throw new StoreError(status, code, message); }
function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function only(value, names) { return record(value) && Object.keys(value).every(key => names.includes(key)); }
function integer(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max; }
function text(value, max) { return typeof value === 'string' ? value.slice(0, max) : null; }
function phoneNumber(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^\+?[\d\s().-]+$/.test(value.trim())) fail(400,'invalid_checkout','Escribe un teléfono de 10 a 15 dígitos para tu pedido.');
  const trimmed = value.trim(), digits = trimmed.replace(/\D/g,'');
  if (!/^\d{10,15}$/.test(digits)) fail(400,'invalid_checkout','Escribe un teléfono de 10 a 15 dígitos para tu pedido.');
  return (trimmed.startsWith('+') ? '+' : '') + digits;
}
function hex(bytes) { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
export async function sha256(value, cryptoApi = globalThis.crypto) { return hex(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', encoder.encode(value)))); }

export function validateCart(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) fail(400,'invalid_cart','Selecciona entre 1 y 50 artículos distintos.');
  const seen = new Set(), quantities = new Map();
  return input.map(row => {
    if (!only(row,['kind','id','quantity','customization']) || !['photo','variant'].includes(row.kind) || typeof row.id !== 'string' || row.id.length < 1 || row.id.length > 128 || /[\s\x00-\x1f]/.test(row.id) || !integer(row.quantity,1,20) || row.kind === 'photo' && row.quantity !== 1) fail(400,'invalid_cart','Revisa los artículos y sus cantidades.');
    const customization = typeof row.customization === 'string' ? row.customization.trim() : '';
    const key = row.kind + ':' + row.id + ':' + customization;
    if (seen.has(key)) fail(400,'invalid_cart','Un artículo aparece repetido en el carrito.');
    seen.add(key);
    if (row.customization != null && (typeof row.customization !== 'string' || row.customization.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(row.customization))) fail(400,'invalid_cart','La personalización admite hasta 500 caracteres.');
    const result = {kind:row.kind,id:row.id,quantity:row.quantity};
    const stockKey = row.kind + ':' + row.id, totalQuantity = (quantities.get(stockKey) || 0) + row.quantity;
    if (totalQuantity > (row.kind === 'photo' ? 1 : 20)) fail(400,'invalid_cart','La cantidad total de un artículo supera el límite permitido.');
    quantities.set(stockKey,totalQuantity);
    if (row.customization) result.customization = row.customization.trim();
    return result;
  });
}

async function readBytes(request, maximum) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) fail(413,'body_too_large','La solicitud es demasiado grande.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > maximum) { await reader.cancel(); fail(413,'body_too_large','La solicitud es demasiado grande.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk,at); at += chunk.byteLength; } return bytes;
}
function decode(bytes) { try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { fail(400,'invalid_json','La solicitud no tiene un formato válido.'); } }
function parseJSON(value) { try { const result = JSON.parse(value); if (!record(result)) throw Error(); return result; } catch { fail(400,'invalid_json','La solicitud no tiene un formato válido.'); } }

// Stripe signs exact bytes. Check every v1 signature without early equality exits.
export async function verifyStripeSignature(raw, header, secret, now = Date.now(), cryptoApi = globalThis.crypto) {
  if (typeof header !== 'string' || header.length > 4096) fail(400,'invalid_signature','La firma del evento no es válida.');
  const timestamps = [], signatures = [];
  for (const part of header.split(',')) { const [key,value] = part.trim().split('='); if (key === 't' && /^\d{1,12}$/.test(value || '')) timestamps.push(Number(value)); if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value || '')) signatures.push(value.toLowerCase()); }
  if (timestamps.length !== 1 || signatures.length < 1 || signatures.length > 8 || Math.abs(Math.floor(now / 1000) - timestamps[0]) > 300) fail(400,'invalid_signature','La firma del evento no es válida o venció.');
  const prefix = encoder.encode(timestamps[0] + '.'), payload = new Uint8Array(prefix.length + raw.length); payload.set(prefix); payload.set(raw,prefix.length);
  const key = await cryptoApi.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected = new Uint8Array(await cryptoApi.subtle.sign('HMAC',key,payload)); let matches = 0;
  for (const candidate of signatures) { let difference = 0; for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ parseInt(candidate.slice(i * 2,i * 2 + 2),16); matches |= Number(difference === 0); }
  if (!matches) fail(400,'invalid_signature','La firma del evento no es válida.');
  return parseJSON(decode(raw));
}

function safeOrder(order) {
  if (!record(order)) fail(404,'order_unavailable','No se encontró el pedido con esta autorización.');
  const result = {};
  for (const key of ['id','reference','status','fulfillment','fulfillment_status','items','subtotal_cents','shipping_cents','total_cents','currency','requires_shipping','created_at','tracking','tracking_carrier','tracking_number','tracking_url','needs_review']) if (order[key] !== undefined) result[key] = order[key];
  if (order.status === 'paid' && typeof order.delivery_link === 'string' && /^https:\/\//.test(order.delivery_link)) result.delivery_link = order.delivery_link;
  return result;
}
function customerFrom(session) {
  const source = session.customer_details || {};
  return {email:text(source.email || session.customer_email,254),name:text(source.name,200),phone:text(source.phone,50)};
}
function shippingFrom(session) {
  const source = session.collected_information?.shipping_details || session.shipping_details;
  if (!record(source) || !record(source.address)) return {};
  const address = {}; for (const key of ['line1','line2','city','state','postal_code','country']) address[key] = text(source.address[key],key === 'country' ? 2 : 200);
  if (address.country !== 'MX') fail(409,'shipping_country','La dirección de entrega debe estar en México.');
  return {name:text(source.name,200),address};
}

export function createHandler(options = {}) {
  const env = options.env || (() => undefined), fetcher = options.fetch || globalThis.fetch, now = options.now || Date.now, cryptoApi = options.crypto || globalThis.crypto;
  const rate = new Map(); let client, checkedAccountAt = 0;
  function credentials() {
    const url = env('SUPABASE_URL') || '', service = env('SUPABASE_SERVICE_ROLE_KEY') || '', secret = env('STRIPE_SECRET_KEY') || '', publishable = env('STRIPE_PUBLISHABLE_KEY') || '', webhook = env('STRIPE_WEBHOOK_SECRET') || '';
    let validProject = false; try { const parsed = new URL(url); validProject = parsed.href === 'https://' + STAGING_PROJECT + '.supabase.co/' && !parsed.username && !parsed.password; } catch {}
    const databaseReady = validProject && service.length >= 20;
    const stripeReady = databaseReady && /^(sk|rk)_test_[A-Za-z0-9]{12,}$/.test(secret) && /^pk_test_[A-Za-z0-9]{12,}$/.test(publishable) && /^whsec_[A-Za-z0-9]{12,}$/.test(webhook);
    return {url:'https://' + STAGING_PROJECT + '.supabase.co',service,secret,publishable,webhook,databaseReady,stripeReady};
  }
  function limited(request, action) {
    const at = now(), address = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
    const key = address.slice(0,128) + ':' + action, limit = action === 'create-session' ? 8 : action === 'lookup' ? 20 : action === 'config' ? 120 : 60;
    let entry = rate.get(key); if (!entry || at - entry.at >= 60000) { entry = {at,count:0}; rate.set(key,entry); }
    entry.count++; if (entry.count > limit) fail(429,'rate_limit','Hay demasiadas solicitudes. Espera un momento e intenta de nuevo.');
    if (rate.size > 4096) { for (const [id,row] of rate) if (at - row.at > 60000) rate.delete(id); if (rate.size > 4096) rate.delete(rate.keys().next().value); }
    return address;
  }
  async function rpc(name, payload, errorStatus = 409) {
    const cfg = credentials(); if (!cfg.databaseReady) fail(503,'store_unavailable','La tienda todavía no está lista para procesar esta solicitud.');
    let response;
    try { response = await fetcher(cfg.url + '/rest/v1/rpc/' + name,{method:'POST',headers:{apikey:cfg.service,Authorization:'Bearer ' + cfg.service,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)}); }
    catch { fail(503,'store_unavailable','No se pudo conectar con la tienda. Intenta nuevamente.'); }
    if (!response.ok && name === 'tsi224_store_order_lookup') fail(response.status >= 500 ? 503 : 404,'order_unavailable',response.status >= 500 ? 'No se pudo consultar el pedido. Intenta nuevamente.' : 'No encontramos un pedido con ese número y correo. Revisa ambos datos.');
    if (!response.ok && name === 'tsi224_store_lookup_rate') fail(503,'store_unavailable','No se pudo consultar el pedido. Intenta nuevamente.');
    if (!response.ok) fail(errorStatus,'store_conflict',name === 'tsi224_store_checkout_status' ? 'No se encontró el pedido con esta autorización.' : 'Los artículos, sus precios o la disponibilidad cambiaron. Actualiza la tienda e intenta nuevamente.');
    try { return await response.json(); } catch { fail(502,'invalid_store_response','La tienda no pudo confirmar esta solicitud.'); }
  }
  async function storeConfig() {
    const cfg = credentials(); if (!cfg.databaseReady) return null;
    try { const response = await fetcher(cfg.url + '/rest/v1/tsi224_store_config?id=eq.shop&select=payments_enabled,country,shipping_fee_cents',{headers:{apikey:cfg.service,Authorization:'Bearer ' + cfg.service},signal:AbortSignal.timeout(15000)}); if (!response.ok) return null; const rows = await response.json(); return Array.isArray(rows) ? rows[0] || null : null; } catch { return null; }
  }
  function stripe() {
    const cfg = credentials(); if (!cfg.stripeReady || typeof options.stripeFactory !== 'function') fail(503,'payments_not_configured','Los pagos de prueba todavía no están configurados.');
    if (!client) client = options.stripeFactory(cfg.secret,{apiVersion:STRIPE_API_VERSION}); return client;
  }
  async function accountReady() {
    const sdk = stripe();
    if (!checkedAccountAt || now() - checkedAccountAt > 300000) {
      let account; try { account = await sdk.accounts.retrieve(); } catch { fail(503,'payments_unavailable','No se pudo confirmar la conexión de pagos de prueba.'); }
      if (account?.id !== STRIPE_TEST_ACCOUNT) fail(503,'wrong_test_account','La conexión de pagos no corresponde al entorno de prueba de esta tienda.');
      checkedAccountAt = now();
    }
    return sdk;
  }
  function validateSession(session, expectedOrder) {
    const id = session?.metadata?.tsi_order_id;
    if (session?.object !== 'checkout.session' || !SESSION.test(session.id || '') || session.livemode !== false || session.mode !== 'payment' || !UUID.test(id || '') || session.metadata?.tsi_environment !== 'staging' || session.client_reference_id !== id || !integer(session.amount_total,1000,99999999) || session.currency !== 'mxn' || !['open','complete','expired'].includes(session.status) || !['paid','unpaid','no_payment_required'].includes(session.payment_status)) fail(409,'session_mismatch','No se pudo verificar la sesión de pago.');
    if (expectedOrder && (id !== expectedOrder.id || expectedOrder.stripe_session_id && session.id !== expectedOrder.stripe_session_id || session.amount_total !== expectedOrder.total_cents || expectedOrder.currency.toLowerCase() !== session.currency)) fail(409,'session_mismatch','El pago no coincide con el pedido.');
    return id;
  }
  async function retrieve(id, expectedOrder) {
    if (!SESSION.test(id || '')) fail(409,'session_mismatch','La sesión de pago no es válida.');
    let session; try { session = await stripe().checkout.sessions.retrieve(id); } catch { fail(503,'payments_unavailable','No se pudo consultar el pago. Intenta nuevamente.'); }
    validateSession(session,expectedOrder); return session;
  }
  async function recordSession(session, eventId, type = '') {
    const orderId = validateSession(session);
    const failed = type === 'checkout.session.async_payment_failed' && session.status === 'complete' && session.payment_status === 'unpaid';
    return rpc('tsi224_store_checkout_event',{event_id:eventId,order_id:orderId,session_id:session.id,payment_status:failed ? 'failed' : session.payment_status,session_status:session.status,amount_total:session.amount_total,currency:session.currency,customer:customerFrom(session),shipping:shippingFrom(session)});
  }
  function identity(body) {
    if (!UUID.test(body.order_id || '') || !TOKEN.test(body.access_token || '')) fail(400,'invalid_order_access','Falta la autorización para consultar el pedido.');
  }
  async function status(body) {
    if (!only(body,['action','order_id','access_token'])) fail(400,'invalid_request','La solicitud no es válida.'); identity(body);
    const accessHash = await sha256(body.access_token,cryptoApi);
    let order = await rpc('tsi224_store_checkout_status',{order_id:body.order_id,access_hash:accessHash},404);
    if (order?.stripe_session_id && credentials().stripeReady) {
      const session = await retrieve(order.stripe_session_id,order);
      await recordSession(session,'reconcile:' + session.id + ':' + session.status + ':' + session.payment_status);
      order = await rpc('tsi224_store_checkout_status',{order_id:body.order_id,access_hash:accessHash},404);
    }
    return {order:safeOrder(order)};
  }
  async function lookup(body, address) {
    if (!only(body,['action','order_reference','email']) || typeof body.order_reference !== 'string' || body.order_reference.length > 40 || typeof body.email !== 'string' || body.email.length > 254) fail(400,'invalid_order_lookup','Escribe el número de pedido completo y el correo de la compra.');
    const reference = body.order_reference.trim().toUpperCase(), email = body.email.trim().toLowerCase();
    if (!ORDER_REFERENCE.test(reference) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) fail(400,'invalid_order_lookup','Escribe el número de pedido completo y el correo de la compra.');
    const day = new Date(now()).toISOString().slice(0,10), secret = credentials().service;
    // Both scopes are durable across isolates; neither stores raw addresses or contact data.
    for (const scope of ['ip:' + address, 'order:' + reference]) {
      const key = await sha256(secret + ':tsi224-lookup:' + day + ':' + scope,cryptoApi);
      const quota = await rpc('tsi224_store_lookup_rate',{key_hash:key});
      if (!quota?.allowed) fail(429,'rate_limit','Hay demasiadas consultas. Espera unos minutos e intenta nuevamente.');
    }
    const identity = {order_reference:reference,email};
    let order = await rpc('tsi224_store_order_lookup',identity,404);
    if (!record(order) || order.reference !== reference) fail(404,'order_unavailable','No encontramos un pedido con ese número y correo. Revisa ambos datos.');
    if (order.stripe_session_id && credentials().stripeReady) {
      const session = await retrieve(order.stripe_session_id,order);
      await recordSession(session,'reconcile:' + session.id + ':' + session.status + ':' + session.payment_status);
      order = await rpc('tsi224_store_order_lookup',identity,404);
      if (!record(order) || order.reference !== reference) fail(404,'order_unavailable','No encontramos un pedido con ese número y correo. Revisa ambos datos.');
    }
    return {order:safeOrder(order)};
  }
  function snapshot(order) {
    if (!record(order) || !UUID.test(order.id || '') || !integer(order.total_cents,1000,99999999) || !integer(order.subtotal_cents,1,99999999) || !integer(order.shipping_cents,0,99999999) || order.total_cents !== order.subtotal_cents + order.shipping_cents || order.currency?.toLowerCase() !== 'mxn' || !Array.isArray(order.items) || !order.items.length || order.items.length > 50 || typeof order.requires_shipping !== 'boolean') fail(502,'invalid_store_response','La tienda no pudo confirmar el importe del pedido.');
    let subtotal = 0;
    for (const item of order.items) { if (!integer(item.quantity,1,20) || !integer(item.unit_price_cents,1,99999999) || item.line_total_cents !== item.quantity * item.unit_price_cents || typeof item.title !== 'string' || item.title.length > 300) fail(502,'invalid_store_response','La tienda no pudo confirmar los artículos.'); subtotal += item.line_total_cents; }
    if (subtotal !== order.subtotal_cents || !order.requires_shipping && order.shipping_cents !== 0) fail(502,'invalid_store_response','La tienda no pudo confirmar los importes.');
    return order;
  }
  async function createSession(body, address) {
    if (!only(body,['action','cart','request_id','access_token','email','phone']) || !UUID.test(body.request_id || '') || !TOKEN.test(body.access_token || '') || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.email.trim())) fail(400,'invalid_checkout','Revisa el correo y los artículos antes de pagar.');
    // Older open checkout pages remain compatible while the new form is being deployed.
    const phone = body.phone === undefined ? null : phoneNumber(body.phone);
    const cart = validateCart(body.cart), sdk = await accountReady(), config = await storeConfig();
    if (!config?.payments_enabled || config.country !== 'MX') fail(503,'payments_disabled','Los pagos están deshabilitados en esta tienda.');
    const accessHash = await sha256(body.access_token,cryptoApi);
    const rateDay = new Date(now()).toISOString().slice(0,10);
    const rateKey = await sha256(credentials().service + ':tsi224-checkout:' + rateDay + ':' + address,cryptoApi);
    const quota = await rpc('tsi224_store_checkout_rate',{key_hash:rateKey});
    if (!quota?.allowed) fail(429,'rate_limit','Espera unos minutos antes de iniciar otro pedido.');
    const prepare = {request_id:body.request_id,access_hash:accessHash,cart,email:body.email.trim().toLowerCase()};
    if (phone !== null) prepare.phone = phone;
    const order = snapshot(await rpc(phone === null ? 'tsi224_store_checkout_prepare' : 'tsi224_store_checkout_prepare_contact',prepare));
    if (!order.stripe_session_id && !['pending','awaiting_payment'].includes(order.status)) fail(409,'checkout_closed','Este pedido ya no admite una nueva sesión de pago. Revisa su estado antes de iniciar otro.');
    let session;
    if (order.stripe_session_id) session = await retrieve(order.stripe_session_id,order);
    else {
      const createdAt = Date.parse(order.created_at), expiresAt = Math.floor(createdAt / 1000) + 45 * 60;
      if (!Number.isFinite(createdAt) || expiresAt - Math.floor(now() / 1000) < 1800) fail(409,'checkout_needs_review','Este pedido necesita revisión antes de iniciar otra sesión. No se ha confirmado ningún cobro.');
      const digest = await sha256(order.id,cryptoApi), suffix = Array.from({length:8},(_,i)=>String.fromCharCode(97 + parseInt(digest.slice(i * 2,i * 2 + 2),16) % 26)).join('');
      const params = {mode:'payment',ui_mode:'embedded_page',redirect_on_completion:'if_required',return_url:RETURN_URL,customer_email:order.email,client_reference_id:order.id,expires_at:expiresAt,integration_identifier:'tsi_store_staging_' + suffix,metadata:{tsi_order_id:order.id,tsi_environment:'staging'},line_items:order.items.map(item=>({quantity:item.quantity,price_data:{currency:'mxn',unit_amount:item.unit_price_cents,product_data:{name:item.kind === 'photo' ? 'Fotografía deportiva' : item.title + (item.variant ? ' · ' + item.variant : '')}}}))};
      // Dynamic payment methods are selected by Stripe's Dashboard configuration.
      if (order.requires_shipping) { params.shipping_address_collection = {allowed_countries:['MX']}; params.phone_number_collection = {enabled:true}; params.shipping_options = [{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:order.shipping_cents,currency:'mxn'},display_name:'Entrega a domicilio en México'}}]; }
      try { session = await sdk.checkout.sessions.create(params,{idempotencyKey:'tsi224-order-' + order.id}); }
      catch (error) {
        // Only explicit pre-creation rejection can release an unlinked reservation.
        // Network failures, rate limits, 5xx and idempotency errors remain reserved for reconciliation.
        const definitive = ['StripeInvalidRequestError','StripeAuthenticationError','StripePermissionError'].includes(error?.type) && [400,401,403,404,422].includes(error.statusCode);
        if (definitive) { await rpc('tsi224_store_checkout_abort',{order_id:order.id,access_hash:accessHash}); fail(409,'checkout_rejected','No se pudo crear la sesión de pago. El pedido se canceló sin confirmar ningún cobro.'); }
        fail(503,'payments_unavailable','No se pudo iniciar el pago. Reintenta el mismo pedido para evitar duplicados.');
      }
      validateSession(session,order);
      await rpc('tsi224_store_checkout_link',{order_id:order.id,session_id:session.id});
      // A Stripe idempotent replay can contain the original response, so retrieve current status.
      session = await retrieve(session.id,{...order,stripe_session_id:session.id});
    }
    if (session.status !== 'open') { await recordSession(session,'reconcile:' + session.id + ':' + session.status + ':' + session.payment_status); return {order_id:order.id,reference:order.reference,session_id:session.id,client_secret:null,publishable_key:credentials().publishable,status:session.payment_status === 'paid' ? 'paid' : session.status}; }
    if (typeof session.client_secret !== 'string' || !session.client_secret.startsWith(session.id + '_secret_')) fail(502,'invalid_session','No se pudo abrir el formulario de pago.');
    return {order_id:order.id,reference:order.reference,session_id:session.id,client_secret:session.client_secret,publishable_key:credentials().publishable,status:'awaiting_payment'};
  }
  async function webhook(request) {
    const cfg = credentials(); if (!cfg.stripeReady) fail(503,'payments_not_configured','Los pagos de prueba todavía no están configurados.');
    const raw = await readBytes(request,262144), signature = request.headers.get('stripe-signature');
    const event = await verifyStripeSignature(raw,signature,cfg.webhook,now(),cryptoApi);
    if (event.livemode !== false || !/^evt_[A-Za-z0-9_]{1,240}$/.test(event.id || '')) fail(400,'invalid_event','El evento no corresponde al entorno de prueba.');
    if (!EVENTS.has(event.type)) return {received:true,ignored:true};
    const sdk = stripe();
    // The runtime supplies the pinned SDK's SubtleCrypto verifier in addition to the raw-byte check.
    if (typeof sdk.webhooks?.constructEventAsync === 'function') {
      try { const verified = await sdk.webhooks.constructEventAsync(decode(raw),signature,cfg.webhook,300); if (verified.id !== event.id) throw Error(); } catch { fail(400,'invalid_signature','La firma del evento no es válida.'); }
    }
    const session = await retrieve(event.data?.object?.id);
    await recordSession(session,event.id,event.type); return {received:true};
  }
  return async function handler(request) {
    const origin = request.headers.get('origin'), headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
    if (origin === STORE_ORIGIN) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, apikey, X-Client-Info'});
    const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
    try {
      const url = new URL(request.url), leaf = url.pathname.split('/').filter(Boolean).at(-1), route = url.searchParams.get('action') || (['config','quote','create-session','status','lookup','webhook'].includes(leaf) ? leaf : '');
      if (request.method === 'OPTIONS') { if (origin !== STORE_ORIGIN) fail(403,'origin_not_allowed','Este origen no está autorizado.'); return new Response(null,{status:204,headers}); }
      if (route === 'webhook') { if (request.method !== 'POST') fail(405,'method_not_allowed','Método no permitido.'); return json(await webhook(request)); }
      if (origin !== STORE_ORIGIN) fail(403,'origin_not_allowed','Este origen no está autorizado.');
      if (request.method === 'GET' && route === 'config') {
        limited(request,'config'); const cfg = credentials();
        if (!cfg.stripeReady) return json({provider:'stripe',environment:'staging',currency:'MXN',ready:false,publishable_key:null,reason:'Los pagos de prueba todavía no están configurados.'});
        const config = await storeConfig(), ready = !!config?.payments_enabled && config.country === 'MX';
        return json({provider:'stripe',environment:'staging',currency:'MXN',ready,publishable_key:ready ? cfg.publishable : null,reason:ready ? '' : 'Los pagos están deshabilitados o pendientes de configurar en la tienda.'});
      }
      if (request.method !== 'POST') fail(405,'method_not_allowed','Método no permitido.');
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail(415,'json_required','Envía una solicitud válida.');
      const body = parseJSON(decode(await readBytes(request,65536))), action = route || body.action;
      if (route && body.action && body.action !== route) fail(400,'invalid_action','La solicitud no es válida.');
      const address = limited(request,action);
      if (action === 'quote') { if (!only(body,['action','cart'])) fail(400,'invalid_request','La solicitud no es válida.'); return json(await rpc('tsi224_store_quote',{cart:validateCart(body.cart)},400)); }
      if (action === 'create-session') return json(await createSession(body,address));
      if (action === 'status') return json(await status(body));
      if (action === 'lookup') return json(await lookup(body,address));
      fail(404,'not_found','La operación no está disponible.');
    } catch (error) {
      if (error instanceof StoreError) return json({error:error.message,code:error.code},error.status);
      return json({error:'No se pudo confirmar la solicitud. Intenta nuevamente.',code:'internal_error'},500);
    }
  };
}
