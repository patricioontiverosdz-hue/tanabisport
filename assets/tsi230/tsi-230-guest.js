(function (root) {
  'use strict';
  var api, ctx, secret = '', expires = 0, expiryTimer, pending = [], modal, modalEpoch = 0, returnFocus, adminData, transient = '', nextView = 'shop', challenge = '';
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function isAdmin() { var u = ctx && ctx.me && ctx.me(); return !!u && u.role === 'admin'; }
  function emit(name) { root.dispatchEvent(new root.CustomEvent(name)); }
  function settle(ok) { pending.splice(0).forEach(function (resolve) { resolve(ok); }); }
  function panel() {
    if (!modal) { modal = document.createElement('div'); modal.className = 'g230-backdrop'; modal.setAttribute('data-g230-modal', ''); document.body.appendChild(modal); }
    return modal;
  }
  function shell(title, html) { return '<section class="g230-dialog" role="dialog" aria-modal="true" aria-labelledby="g230-title"><header><h2 id="g230-title">' + esc(title) + '</h2><button type="button" data-g230="close" aria-label="Cerrar">×</button></header><div class="g230-content">' + html + '</div><p id="g230-message" role="status" aria-live="polite"></p></section>'; }
  function message(text, error) { var el = document.getElementById('g230-message'); if (el) { el.textContent = text || ''; el.classList.toggle('g230-error', !!error); } }
  function close() { modalEpoch++; if (modal) { modal.remove(); modal = null; } transient = ''; challenge = ''; adminData = null; settle(false); if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  function clear() {
    modalEpoch++; secret = ''; expires = 0; root.clearTimeout(expiryTimer);
    if (ctx && ctx.state && ctx.state.shop) ctx.state.shop.items = [];
    document.querySelectorAll('[data-g230-preview]').forEach(function (el) { el.removeAttribute('src'); });
    emit('tsi230:guest-cleared'); if (ctx && ctx.onCleared) ctx.onCleared();
  }
  async function request(body, token) {
    if (!ctx) throw Error('El acceso invitado todavía no está listo.');
    if (ctx.edge) return ctx.edge(body, token || '');
    if (ctx.server !== 'https://tantlgswituiwkxfgmsr.supabase.co') throw Error('La conexión de acceso a fotografías no está configurada.');
    var headers = {'Content-Type':'application/json', apikey:ctx.publicKey || ''}, access = ctx.accessToken && await ctx.accessToken();
    if (access) headers.Authorization = 'Bearer ' + access;
    if (token) headers['x-tsi-guest-token'] = token;
    var response = await root.fetch(ctx.server + '/functions/v1/tsi-guest-access', {method:'POST',headers:headers,body:JSON.stringify(body),cache:'no-store',referrerPolicy:'no-referrer'});
    var result = await response.json();
    if (!response.ok) { var error = Error(result.message || 'No se pudo confirmar el acceso.'); error.status = response.status; throw error; }
    return result;
  }
  function authorized() { if (secret && expires <= Date.now()) clear(); return !!secret && expires > Date.now(); }
  async function scoped(body) {
    if (!authorized()) throw Error('Solicita acceso a tu carpeta para continuar.');
    var held = secret;
    try { var result = await request(body, held); if (held !== secret) throw Error('El permiso cambió. Vuelve a entrar.'); return result; }
    catch (error) { if (held === secret && (error.status === 401 || error.status === 403)) clear(); throw error; }
  }
  async function status() { var result = await scoped({action:'status'}); if (!result.allowed) { clear(); throw Error('El permiso ya no está vigente.'); } return result; }
  function entry() {
    modalEpoch++; returnFocus = document.activeElement;
    panel().innerHTML = shell('Entrar como invitado', '<p>Consulta únicamente la carpeta que administración autorizó para tu correo. No necesitas crear una cuenta.</p><form data-g230-form="request"><label for="g230-invitation">Invitación individual</label><input id="g230-invitation" name="invitation" autocomplete="off" spellcheck="false" required maxlength="64" pattern="[a-f0-9]{64}"><label for="g230-email">Correo aprobado</label><input id="g230-email" name="email" type="email" autocomplete="email" required maxlength="254"><button class="btn" type="submit">Recibir código por correo</button></form>');
    document.getElementById('g230-invitation').focus();
  }
  function codeForm(test) { return '<form data-g230-form="verify">' + (test ? '<label for="g230-challenge">Clave de acceso</label><input id="g230-challenge" name="challenge_id" autocomplete="off" spellcheck="false" required maxlength="36">' : '') + '<label for="g230-code">Código de seis dígitos</label><input id="g230-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button class="btn" type="submit">Abrir mi carpeta</button></form>'; }
  function open(options) {
    nextView = options && options.next || 'shop'; var epoch=++modalEpoch,originalFocus=document.activeElement; returnFocus=originalFocus;
    panel().innerHTML=shell('Acceso a fotografías','<p role="status">Comprobando disponibilidad…</p>');
    var waiting=new Promise(function(resolve){pending.push(resolve);});
    function unavailable(){if(epoch!==modalEpoch||!modal)return;panel().innerHTML=shell('Acceso a fotografías','<p>El acceso por correo todavía no está disponible. Habla con TABI para recibir ayuda con tus fotografías.</p><button type="button" data-g230="contact">Hablar con TABI</button>');settle(false);}
    request({action:'config'}).then(function(config){if(epoch!==modalEpoch||!modal)return;if(config.email_ready===true){entry();returnFocus=originalFocus;return;}if(config.manual_codes===true){panel().innerHTML=shell('Código de acceso facilitado por Tanabi','<p>Ingresa los dos datos que Tanabi te entregó para consultar únicamente tu carpeta autorizada.</p>'+codeForm(true));document.getElementById('g230-challenge').focus();return;}unavailable();}).catch(unavailable);return waiting;
  }
  async function ensureAccess(options) { if (authorized()) { try { await status(); return true; } catch (ignore) {} } return open(options); }
  async function list() { var result = await scoped({action:'list'}); return result.items || []; }
  async function preview(id) { var result = await scoped({action:'preview',id:String(id)}); if (typeof result.image !== 'string' || !/^data:image\/jpeg;base64,/.test(result.image)) return ''; return result.image; }
  async function loadShop() {
    var held = secret, items = await list();
    // Each image request checks the grant again; no direct shop_items query.
    for (var at = 0; at < items.length; at += 4) await Promise.all(items.slice(at, at + 4).map(async function (item) { item.img = await preview(item.id); item.folder = 'Mi carpeta autorizada'; }));
    if (held !== secret || !authorized()) throw Error('El permiso cambió.');
    if (ctx.state && ctx.state.shop) ctx.state.shop.items = items;
    return items;
  }
  async function logout() { var held = secret; clear(); try { if (held) await request({action:'logout'}, held); } catch (ignore) {} if (ctx.render) ctx.render(); }
  function active(row) { return !row.revoked_at && new Date(row.expires_at || '9999-01-01').getTime() > Date.now(); }
  function option(rows, value, label) { return rows.map(function (row) { return '<option value="' + esc(row[value]) + '">' + esc(label(row)) + '</option>'; }).join(''); }
  function revoke(kind, id) { return '<button type="button" class="btn small" data-g230="revoke" data-kind="' + kind + '" data-id="' + esc(id) + '">Revocar</button>'; }
  function date(value) { return value ? new Date(value).toLocaleString('es-MX') : ''; }
  function adminHTML() {
    var data = adminData, folders = data.folders || [], contacts = data.contacts || [], invites = data.invitations || [], sessions = data.sessions || [];
    function folderName(id) { var row = folders.find(function (f) { return f.id === id; }); return row ? row.label : 'Carpeta'; }
    function contactName(id) { var row = contacts.find(function (c) { return c.id === id; }); return row ? row.name : 'Contacto'; }
    return '<p class="g230-notice">Galerías privadas. Las invitaciones no crean cuentas. Acceso máximo de 56 días o fin de temporada, lo que ocurra primero.</p>' +
      (!data.email_ready ? '<p class="g230-notice">El correo no está configurado. ' + (data.manual_codes ? 'Puedes crear accesos por código y entregarlos únicamente al contacto aprobado.' : 'Los accesos están cerrados hasta habilitar el correo o los códigos de acceso.') + '</p>' : '') +
      '<section><h3>1. Registrar carpeta privada</h3><form data-g230-form="folder-create"><label for="g230-folder-label">Carpeta existente</label><select id="g230-folder-label" name="label" required><option value="">Selecciona</option>' + (data.available_folders || []).map(function (label) { return '<option>' + esc(label) + '</option>'; }).join('') + '</select><label for="g230-season">Fin de temporada</label><input id="g230-season" name="season_end" type="datetime-local" required><button class="btn" type="submit">Registrar con caducidad</button></form><ul class="g230-rows">' + folders.map(function (f) { return '<li><strong>' + esc(f.label) + '</strong><span>' + Number(f.item_count) + ' fotos · caduca ' + esc(date(f.expires_at)) + '</span>' + (active(f) ? '<button type="button" class="btn small" data-g230="sync" data-id="' + esc(f.id) + '">Autorizar fotos nuevas</button>' + revoke('folder', f.id) : '<span>Acceso cerrado</span>') + '</li>'; }).join('') + '</ul></section>' +
      '<section><h3>2. Aprobar jugador o familiar</h3><form data-g230-form="contact-create"><label for="g230-contact-folder">Carpeta autorizada</label><select id="g230-contact-folder" name="folder_id" required><option value="">Selecciona</option>' + option(folders.filter(active), 'id', function (f) { return f.label; }) + '</select><label for="g230-contact-name">Nombre del contacto</label><input id="g230-contact-name" name="name" required maxlength="80"><label for="g230-contact-email">Correo aprobado</label><input id="g230-contact-email" name="email" type="email" required maxlength="254"><label for="g230-relationship">Relación</label><select id="g230-relationship" name="relationship"><option value="jugador">Jugador</option><option value="familiar">Familiar</option></select><label class="g230-check"><input name="approved" type="checkbox" required> Verifiqué que es jugador o familiar autorizado, confirmé su correo y las autorizaciones de imagen vigentes; si hay menores, cuento con autorización válida de su madre, padre o tutor. Autorizo únicamente esta carpeta.</label><button class="btn" type="submit">Guardar contacto aprobado</button></form><ul class="g230-rows">' + contacts.map(function (c) { return '<li><strong>' + esc(c.name) + ' · ' + esc(c.relationship) + '</strong><span>' + esc(c.email) + ' · ' + esc(folderName(c.folder_id)) + '</span>' + (c.approved && !c.revoked_at ? revoke('contact', c.id) : '<span>Revocado</span>') + '</li>'; }).join('') + '</ul></section>' +
      '<section><h3>3. Invitación individual</h3><form data-g230-form="invite-create"><label for="g230-invite-contact">Contacto aprobado</label><select id="g230-invite-contact" name="contact_id" required><option value="">Selecciona</option>' + option(contacts.filter(function (c) { return c.approved && !c.revoked_at && folders.some(function (f) { return f.id === c.folder_id && active(f); }); }), 'id', function (c) { return c.name + ' · ' + folderName(c.folder_id); }) + '</select><label for="g230-invite-expiry">Caducidad (máximo siete días)</label><input id="g230-invite-expiry" name="expires_at" type="datetime-local" required>' + (data.manual_codes ? '<label class="g230-check"><input name="manual_code" type="checkbox"' + (!data.email_ready ? ' checked' : '') + '> Código de acceso facilitado por Tanabi</label>' : '') + '<button class="btn" type="submit"' + (!data.email_ready && !data.manual_codes ? ' disabled' : '') + '>Crear invitación</button></form><div id="g230-transient">' + transient + '</div><ul class="g230-rows">' + invites.map(function (i) { return '<li><strong>' + esc(contactName(i.contact_id)) + (i.manual_code ? ' · Código de acceso' : '') + '</strong><span>Caduca ' + esc(date(i.expires_at)) + '</span>' + (active(i) ? (i.manual_code ? '<button type="button" class="btn small" data-g230="access-code" data-id="' + esc(i.id) + '">Obtener código de acceso</button>' : '') + revoke('invitation', i.id) : '<span>Cerrada</span>') + '</li>'; }).join('') + '</ul></section>' +
      '<section><h3>Sesiones temporales</h3><ul class="g230-rows">' + sessions.map(function (s) { return '<li><span>Sesión ' + esc(s.id.slice(0, 8)) + ' · caduca ' + esc(date(s.expires_at)) + '</span>' + (active(s) ? revoke('session', s.id) : '<span>Cerrada</span>') + '</li>'; }).join('') + '</ul></section>';
  }
  async function adminCommand(operation, payload) {
    if (!isAdmin()) throw Error('Se requiere administración.');
    var owner = ctx.me().id, data = await request({action:'admin',operation:operation,payload:payload || {}});
    if (!isAdmin() || ctx.me().id !== owner) throw Error('La cuenta cambió.');
    adminData = data; return data;
  }
  async function openAdmin() {
    if (!isAdmin()) throw Error('Se requiere administración.');
    var epoch = ++modalEpoch; returnFocus = document.activeElement;
    panel().innerHTML = shell('Invitados y galerías privadas', '<p>Cargando permisos…</p>');
    try { await adminCommand('state'); if (epoch === modalEpoch && modal && isAdmin()) modal.innerHTML = shell('Invitados y galerías privadas', adminHTML()); } catch (error) { if (epoch === modalEpoch) message(error.message, true); }
  }
  async function busy(form, work) { var epoch = modalEpoch, buttons = (form || modal).querySelectorAll('button'); buttons.forEach(function (b) { b.disabled = true; }); try { await work(); } catch (error) { if (epoch === modalEpoch) message(error.message, true); } finally { buttons.forEach(function (b) { b.disabled = false; }); } }
  document.addEventListener('submit', function (event) {
    var form = event.target; if (!form.matches('[data-g230-form]')) return; event.preventDefault();
    var type = form.dataset.g230Form, values = new root.FormData(form), epoch = modalEpoch;
    busy(form, async function () {
      if (type === 'request') {
        var result = await request({action:'request',invitation:String(values.get('invitation')).trim(),email:String(values.get('email')).trim().toLowerCase()}); if (epoch !== modalEpoch || !modal) return; challenge = result.challenge_id;
        panel().innerHTML = shell('Confirma tu correo', '<p>Si los datos coinciden con una invitación vigente, recibirás un código que dura cinco minutos.</p>' + codeForm(false));
      } else if (type === 'verify') {
        var result = await request({action:'verify',challenge_id:String(values.get('challenge_id') || challenge).trim(),code:String(values.get('code')).trim()});
        if (epoch !== modalEpoch || !modal) return;
        if (!/^[a-f0-9]{64}$/.test(result.token) || !Number.isFinite(new Date(result.expires_at).getTime()) || new Date(result.expires_at).getTime() <= Date.now()) throw Error('No se pudo confirmar una sesión vigente.');
        secret = result.token; expires = new Date(result.expires_at).getTime(); root.clearTimeout(expiryTimer); expiryTimer = root.setTimeout(function () { clear(); if (ctx.render) ctx.render(); }, expires - Date.now());
        settle(true); var destination = nextView; close(); emit('tsi230:guest-authorized'); if (ctx.onAuthorized) await ctx.onAuthorized({next:destination});
      } else {
        if (!isAdmin()) throw Error('Se requiere administración.'); var payload = {};
        values.forEach(function (value, key) { payload[key] = String(value); });
        if (payload.season_end) payload.season_end = new Date(payload.season_end).toISOString();
        if (payload.expires_at) payload.expires_at = new Date(payload.expires_at).toISOString();
        if (type === 'contact-create') payload.approved = values.has('approved');
        if (type === 'invite-create') payload.manual_code = values.has('manual_code');
        var result = await adminCommand(type, payload);
        if (epoch !== modalEpoch || !modal) return;
        transient = result.invitation ? '<p>Invitación privada: se muestra una sola vez. Compártela únicamente con el contacto aprobado.</p><textarea readonly aria-label="Invitación individual">' + esc(result.invitation) + '</textarea>' : '';
        panel().innerHTML = shell('Invitados y galerías privadas', adminHTML()); message('Guardado.');
      }
    });
  });
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-g230],[data-tsi230-guest]'); if (!button) return;
    var action = button.dataset.g230 || button.dataset.tsi230Guest;
    if (action === 'contact') { close(); if(root.TSI230Support&&root.TSI230Support.open)root.TSI230Support.open(); return; } if (action === 'open') { open(); return; } if (action === 'admin') { openAdmin(); return; } if (action === 'close') { close(); return; } if (action === 'logout') { logout(); return; }
    if (!isAdmin() || !modal) return;
    var epoch = modalEpoch; busy(modal, async function () {
      if (action === 'access-code') {
        var result = await request({action:'admin-access-code',invitation_id:button.dataset.id});
        if (epoch !== modalEpoch || !modal) return;
        if (!isAdmin()) throw Error('La cuenta cambió.');
        transient = '<p class="g230-notice">Acceso autorizado: entrega estos datos únicamente al contacto aprobado. Caducan en cinco minutos.</p><label>Clave de acceso</label><textarea readonly>' + esc(result.challenge_id) + '</textarea><label>Código de acceso</label><input readonly value="' + esc(result.code) + '">';
      } else if (action === 'revoke') { await adminCommand('revoke', {kind:button.dataset.kind,id:button.dataset.id}); transient = ''; }
      else if (action === 'sync') { await adminCommand('folder-sync', {folder_id:button.dataset.id}); transient = ''; }
      else return;
      if (epoch === modalEpoch && modal && isAdmin()) modal.innerHTML = shell('Invitados y galerías privadas', adminHTML());
    });
  });
  document.addEventListener('keydown', function (event) {
    if (!modal) return; if (event.key === 'Escape') { close(); return; }
    if (event.key === 'Tab') { var focusable = Array.from(modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea, summary')).filter(function (el) { return !el.closest('details:not([open])') || el.tagName === 'SUMMARY'; }); var first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && authorized()) status().catch(function () { if (ctx.render) ctx.render(); }); });
  root.setInterval(function () { if (authorized() && !document.hidden) status().catch(function () { if (ctx.render) ctx.render(); }); if (modal && modal.textContent.includes('Invitados y galerías privadas') && !isAdmin()) close(); }, 30000);
  api = root.TSI230Guest = {
    install:function (options) { ctx = options; return api; }, open:open, ensureAccess:ensureAccess, token:function () { return authorized() ? secret : ''; }, authorized:authorized,
    status:status, list:list, preview:preview, loadShop:loadShop, logout:logout, clear:clear, openAdmin:openAdmin,
    adminPanel:function () { return isAdmin() ? '<button type="button" class="btn" data-tsi230-guest="admin">Invitados y galerías privadas</button>' : ''; }, afterRender:function () { if (!authorized() && ctx && ctx.state && ctx.state.shop && !(ctx.me && ctx.me())) ctx.state.shop.items = []; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
