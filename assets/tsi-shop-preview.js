(function (root) {
  'use strict';
  root.TSIShopPreviewInstall = function (api) {
    var S = api.state, esc = api.esc;
    var legacyDefaults = { bw: true, motion: false, watermark: true, watermark_data: null, version: 0 };
    var paused = Object.create(null);
    function defaults() { return Object.assign({}, legacyDefaults); }
    function fresh(owner, settings) { return { owner: owner, settings: settings || defaults(), draft: null, sources: [], form: {}, loaded: false, loading: false, publicLoaded: false, publicLoading: false, publicError: '', busy: false, dirty: false, error: '', message: '', pending: null }; }
    var D = fresh('');
    function staff() { var u = api.me(); return !!u && (u.role === 'admin' || u.role === 'editora'); }
    function owner() { var u = api.me(); return u ? String(u.id) + ':' + u.role : ''; }
    function sameSession(state) { return state === D && state.owner === owner(); }
    function assertSession(state) { if (!sameSession(state)) throw Error('La sesión cambió. Abre Tienda de nuevo.'); }
    function normalize(value) {
      var v = value || {};
      return { bw: typeof v.bw === 'boolean' ? v.bw : true, motion: typeof v.motion === 'boolean' ? v.motion : false, watermark: typeof v.watermark === 'boolean' ? v.watermark : true, watermark_data: typeof v.watermark_data === 'string' && /^data:image\/png;base64,/.test(v.watermark_data) && v.watermark_data.length <= 300000 ? v.watermark_data : null, version: Number(v.version) || 0 };
    }
    function beforeRender(capture) {
      var key = owner();
      if (key !== D.owner) D = fresh(key, D.settings);
      else if (capture !== false && staff()) { var folder = document.getElementById('shopfolder'), price = document.getElementById('shopprice'); if (folder) D.form.folder = folder.value; if (price) D.form.price = price.value; }
    }
    function updateSettings(state, value) {
      var next = normalize(value);
      if (next.version >= state.settings.version) state.settings = next;
    }
    async function publicLoad(force) {
      beforeRender(); var state = D;
      if (state.publicLoading || state.publicLoaded && !force) return;
      state.publicLoading = true;
      try {
        var rows = await api.sb('GET', '/rest/v1/tsi224_shop_preview?id=eq.shop&select=*');
        if (!sameSession(state)) return;
        if (!Array.isArray(rows) || !rows.length) throw Error('Los controles de vistas previas todavía no están disponibles en este servidor.');
        updateSettings(state, rows[0]); if (state.loaded && !state.dirty && !state.busy) state.draft = Object.assign({}, state.settings); state.publicError = '';
      } catch (error) {
        if (sameSession(state)) state.publicError = 'No se pudieron actualizar las vistas previas: ' + error.message;
      } finally {
        if (sameSession(state)) { state.publicLoading = false; state.publicLoaded = true; api.render(); }
      }
    }
    async function load(force) {
      beforeRender(); var state = D;
      if (!staff() || state.loading || state.loaded && !force) return;
      state.loading = true; state.error = ''; api.render();
      try {
        var result = await api.sb('POST', '/rest/v1/rpc/tsi224_shop_state', {});
        if (!sameSession(state)) return;
        if (!result || !result.settings || !Array.isArray(result.sources)) throw Error('El servidor no devolvió las opciones y las fuentes de las fotos.');
        updateSettings(state, result.settings); state.sources = result.sources; state.loaded = true;
        state.publicLoaded = true; state.publicError = '';
        if (!state.dirty || force) { state.draft = Object.assign({}, state.settings); state.dirty = false; }
      } catch (error) {
        if (sameSession(state)) { state.loaded = false; state.error = 'No se pudieron cargar los controles: ' + error.message; }
      } finally {
        if (sameSession(state)) { state.loading = false; api.render(); }
      }
    }
    function statusHtml() {
      return '<div class="s224-status" aria-live="polite">' +
        (D.error ? '<p class="err" role="alert">' + esc(D.error) + '</p>' : '') +
        (D.message ? '<p class="note" role="status">' + esc(D.message) + '</p>' : '') +
        (D.loading ? '<p role="status">Cargando opciones de la tienda…</p>' : '') +
        (D.busy ? '<p role="status">' + esc(D.progress || 'Preparando y guardando vistas previas…') + '</p>' : '') +
        (D.pending && !D.busy ? '<p>Hay un cambio pendiente de confirmar. <button type="button" class="btn small" data-224-action="retry">Reintentar</button> <button type="button" class="btn small" data-224-action="discard">Descartar reintento y actualizar</button></p>' : '') + '</div>';
    }
    function toggle(key, label, detail, value, disabled) {
      return '<label class="s224-option" for="s224-' + key + '"><input id="s224-' + key + '" type="checkbox" data-224-option="' + key + '"' + (value ? ' checked' : '') + disabled + '><span><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></span></label>';
    }
    function tab(baseHtml) {
      beforeRender(); if (!staff()) return baseHtml || '';
      var f = D.draft || D.settings, disabled = D.busy || D.pending || !D.loaded ? ' disabled' : '';
      var html = '<section class="card s224-controls" aria-labelledby="s224-title"><h3 id="s224-title">Protección de vistas previas</h3><p>Estos ajustes se aplican a todas las fotos de la tienda. Administración y editora pueden modificarlos.</p>' + statusHtml() + '<fieldset class="s224-options"' + disabled + '><legend>Vista previa en:</legend>' +
        toggle('bw', 'Blanco y negro', 'Mostrar las fotos sin color.', f.bw, disabled) +
        toggle('motion', 'Movimiento nítido', 'Un tercio nítido recorre la imagen; los otros dos tercios quedan difuminados.', f.motion, disabled) +
        toggle('watermark', 'Marca de agua', 'Grabar una marca sobre las miniaturas antes de mostrarlas al público.', f.watermark, disabled) +
        '<div class="s224-mark"' + (!f.watermark ? ' hidden' : '') + '><label for="s224-watermark-file">Subir mi propia marca de agua</label><input id="s224-watermark-file" type="file" accept="image/png,image/jpeg"' + disabled + '><p class="hint">PNG o JPEG de hasta 5 MB. Un PNG transparente conserva el fondo de la foto.</p>' +
        (f.watermark_data ? '<img class="s224-mark-thumb" src="' + esc(f.watermark_data) + '" alt="Marca de agua seleccionada"><button type="button" class="btn small" data-224-action="remove-watermark"' + disabled + '>Quitar marca propia y usar Tanabi Sports</button>' : '<p class="hint">Se usará la marca Tanabi Sports.</p>') + '</div></fieldset>' +
        '<p class="hint" data-224-dirty>' + (D.dirty ? 'Hay cambios sin aplicar.' : 'Los ajustes guardados son los que ven los clientes.') + '</p>' +
        '<div class="s224-actions"><button type="button" class="btn primary" data-224-action="save"' + disabled + '>Guardar y aplicar a toda la tienda</button><button type="button" class="btn" data-224-action="reload"' + (D.busy ? ' disabled' : '') + '>Actualizar opciones</button></div>' +
        '<p class="hint">La franja en movimiento dificulta una captura completa, pero una grabación puede reunir las partes visibles. La copia de trabajo de las nuevas fotos se conserva privada y reducida; los originales siguen fuera de la tienda.</p></section>';
      var legacy = D.sources.filter(function (s) { return s.legacy; });
      if (legacy.length) html += '<section class="card s224-legacy"><h3>Fotos de cargas anteriores</h3><p>El blanco y negro y la marca antigua quedaron grabados en ' + legacy.length + ' foto(s). Los interruptores no pueden recuperar su color ni borrar esa marca. Vuelve a cargar la foto para que todos los ajustes sean reversibles.</p>' + legacy.map(function (source) {
        var item = (S.shop.items || []).find(function (it) { return String(it.id) === String(source.id); });
        return item ? '<div class="s224-replace"><label for="s224-replace-' + esc(String(item.id)) + '">Actualizar foto: ' + esc(item.title) + '</label><input id="s224-replace-' + esc(String(item.id)) + '" type="file" accept="image/jpeg,image/png,image/webp" data-224-replace="' + esc(String(item.id)) + '"' + disabled + '></div>' : '';
      }).join('') + '</section>';
      return html + '<fieldset class="s224-shop-fields"' + disabled + '>' + (baseHtml || '') + '</fieldset>';
    }
    function reducedMotion() { return !!root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function preview(item) {
      var id = String(item.id), motion = D.settings.motion, isPaused = Object.prototype.hasOwnProperty.call(paused, id) ? paused[id] : reducedMotion();
      var image = item.img ? '<img loading="lazy" draggable="false" class="s224-image' + (motion ? ' s224-scan' : '') + '" src="' + esc(item.img) + '" alt="Vista previa de ' + esc(item.title) + '">' : '';
      var blurred = motion && item.img ? '<img loading="lazy" draggable="false" class="s224-blurred" src="' + esc(item.img) + '" alt="" aria-hidden="true">' : '';
      return '<div class="s224-photo"><div class="tile shop-preview s224-preview' + (motion ? ' s224-motion' : '') + (isPaused ? ' s224-paused' : ' s224-user-motion') + (!item.img ? ' t1' : '') + '" data-224-preview="' + esc(id) + '">' + blurred + image + '<span class="shop-title">' + esc(item.title) + '</span></div>' +
        (motion && item.img ? '<button type="button" class="btn small s224-motion-control" data-224-motion="' + esc(id) + '" aria-pressed="' + String(isPaused) + '">' + (isPaused ? 'Reanudar movimiento' : 'Pausar movimiento') + '</button>' : '') + '</div>';
    }
    function imageFrom(source) {
      return new Promise(function (resolve, reject) {
        var img = new root.Image();
        img.onload = function () { if (!img.width || !img.height || img.width * img.height > 50000000) reject(Error('La imagen tiene dimensiones no compatibles.')); else resolve(img); };
        img.onerror = function () { reject(Error('No se pudo leer la imagen. Usa un archivo JPEG, PNG o WebP válido.')); };
        img.src = source;
      });
    }
    function readFile(file) {
      return new Promise(function (resolve, reject) { var reader = new root.FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(Error('No se pudo leer el archivo.')); }; reader.readAsDataURL(file); });
    }
    function canvasFor(image, max) {
      var scale = Math.min(1, max / Math.max(image.width, image.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(image.width * scale)); c.height = Math.max(1, Math.round(image.height * scale));
      var x = c.getContext('2d'); if (!x) throw Error('Este navegador no pudo preparar la vista previa.');
      x.drawImage(image, 0, 0, c.width, c.height); return { canvas: c, context: x };
    }
    function jpeg(canvas, startQuality) {
      var qualities = [startQuality, .55, .4, .3];
      for (var i = 0; i < qualities.length; i++) { var data = canvas.toDataURL('image/jpeg', qualities[i]); if (data.length <= 500000 && /^data:image\/jpeg;base64,/.test(data)) return data; }
      throw Error('La miniatura supera el tamaño permitido. Usa una imagen más pequeña.');
    }
    async function processFile(file) {
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) throw Error('Selecciona una foto JPEG, PNG o WebP de hasta 20 MB.');
      var decoded = await imageFrom(await readFile(file)), prepared = canvasFor(decoded, 720);
      return jpeg(prepared.canvas, .8);
    }
    async function watermarkFile(file) {
      if (!file || !/^image\/(png|jpeg)$/.test(file.type) || file.size > 5 * 1024 * 1024) throw Error('Selecciona una marca PNG o JPEG de hasta 5 MB.');
      var decoded = await imageFrom(await readFile(file)), prepared = canvasFor(decoded, 360), data = prepared.canvas.toDataURL('image/png');
      if (!/^data:image\/png;base64,/.test(data) || data.length > 300000) throw Error('La marca de agua es demasiado grande. Usa un logo más sencillo o de menor tamaño.');
      return data;
    }
    async function renderImage(source, settings) {
      if (!source) return '';
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(source)) throw Error('Falta una copia de trabajo válida. Vuelve a cargar la foto.');
      var image = await imageFrom(source), prepared = canvasFor(image, 720), c = prepared.canvas, x = prepared.context, w = c.width, h = c.height;
      if (settings.bw) {
        var pixels = x.getImageData(0, 0, w, h), d = pixels.data;
        for (var i = 0; i < d.length; i += 4) { var gray = Math.round(d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114); d[i] = gray; d[i + 1] = gray; d[i + 2] = gray; }
        x.putImageData(pixels, 0, 0);
      }
      if (settings.watermark) {
        if (settings.watermark_data) {
          var mark = await imageFrom(settings.watermark_data), scale = Math.min(w * .72 / mark.width, h * .22 / mark.height), mw = mark.width * scale, mh = mark.height * scale;
          x.save(); x.globalAlpha = .6;
          [.22, .5, .78].forEach(function (at) { x.drawImage(mark, (w - mw) / 2, h * at - mh / 2, mw, mh); });
          x.restore();
        } else {
          x.save(); x.translate(w / 2, h / 2); x.rotate(-Math.PI / 6); x.font = '900 ' + Math.max(16, Math.round(w / 17)) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 2;
          x.strokeStyle = 'rgba(0,0,0,.65)'; x.fillStyle = 'rgba(255,255,255,.65)';
          var step = Math.max(130, Math.round(w * .46));
          for (var yy = -h * 2; yy < h * 2; yy += step) for (var xx = -w * 2; xx < w * 2; xx += step) { x.strokeText('TANABI SPORTS', xx, yy); x.fillText('TANABI SPORTS', xx, yy); }
          x.restore();
        }
      }
      return jpeg(c, .62);
    }
    function canBegin() {
      if (!staff()) throw Error('Estos controles requieren administración o editora.');
      if (D.busy || D.loading) throw Error('Espera a que termine el cambio anterior.');
      if (D.pending) throw Error('Reintenta o descarta la solicitud pendiente antes de hacer otro cambio.');
      if (api.syncIdle && !api.syncIdle()) throw Error('Espera a que terminen de guardarse los cambios anteriores.');
    }
    async function submit(state, operation, payload) {
      assertSession(state);
      state.pending = { operation: operation, payload: payload, request_id: root.crypto.randomUUID() };
      return runPending(state);
    }
    async function runPending(state) {
      assertSession(state); var pending = state.pending;
      var result = await api.sb('POST', '/rest/v1/rpc/tsi224_shop_command', pending);
      assertSession(state); state.pending = null;
      if (result && result.settings) updateSettings(state, result.settings);
      state.message = pending.operation === 'settings' ? 'Opciones aplicadas a toda la tienda.' : 'Fotos guardadas con las opciones de la tienda.';
      state.dirty = false;
      try { await api.loadShop(); assertSession(state); await load(true); if (state.error) throw Error(state.error); }
      catch (error) { assertSession(state); state.error = 'El cambio se guardó, pero no se pudo actualizar la vista. Usa Actualizar opciones. ' + error.message; }
      return result;
    }
    async function task(work) {
      beforeRender(); var state = D;
      try { canBegin(); state.busy = true; state.error = ''; state.message = ''; api.render(); await work(state); }
      catch (error) {
        if (sameSession(state)) { if (error.status >= 400 && error.status < 500) state.pending = null; state.error = error.message + (state.pending ? ' Reintenta para confirmar el mismo cambio.' : ''); }
      } finally { if (sameSession(state)) { state.busy = false; state.progress = ''; api.render(); } }
    }
    async function save() {
      return task(async function (state) {
        if (!state.loaded || !state.draft) throw Error('Actualiza las opciones de la tienda antes de guardar.');
        var settings = normalize(state.draft), expectedVersion = settings.version, rendered = [];
        for (var i = 0; i < state.sources.length; i++) {
          state.progress = 'Preparando foto ' + (i + 1) + ' de ' + state.sources.length + '…'; api.render();
          var source = state.sources[i], img = await renderImage(source.img, settings); assertSession(state);
          rendered.push({ id: String(source.id), img: img, source_version: Number(source.version) || 0 });
        }
        await submit(state, 'settings', { expected_version: expectedVersion, settings: { bw: settings.bw, motion: settings.motion, watermark: settings.watermark, watermark_data: settings.watermark_data }, items: rendered });
      });
    }
    async function upload(files, folder, price, replaceId) {
      return task(async function (state) {
        if (state.dirty) throw Error('Guarda y aplica las opciones a toda la tienda antes de subir o reemplazar fotos.');
        files = Array.prototype.slice.call(files || []);
        if (!files.length || files.length > 10 || replaceId != null && files.length !== 1) throw Error('Selecciona entre 1 y 10 fotos; para reemplazar una foto selecciona un solo archivo.');
        folder = String(folder || '').replace(/\s+/g, ' ').trim();
        if (!folder || folder.length > 60) throw Error('Indica una carpeta de hasta 60 caracteres.');
        if (!state.loaded) { await load(true); assertSession(state); if (!state.loaded) throw Error('No se pudieron consultar las opciones. Actualiza y vuelve a intentar.'); }
        var settings = Object.assign({}, state.settings), rows = [];
        for (var i = 0; i < files.length; i++) {
          state.progress = 'Preparando foto ' + (i + 1) + ' de ' + files.length + '…'; api.render();
          var sourceImg = await processFile(files[i]); assertSession(state);
          var img = await renderImage(sourceImg, settings); assertSession(state);
          var previous = replaceId == null ? null : (S.shop.items || []).find(function (it) { return String(it.id) === String(replaceId); });
          if (replaceId != null && !previous) throw Error('La foto a reemplazar ya no está disponible. Actualiza la tienda.');
          var oldSource = previous && state.sources.find(function (row) { return String(row.id) === String(previous.id); });
          rows.push({ id: previous ? previous.id : api.nid(), title: previous ? previous.title : String(files[i].name || 'Fotografía').replace(/\.[^.]+$/, '').trim().slice(0, 60) || 'Fotografía', folder: previous ? previous.folder : folder, price: previous ? previous.price : api.me().role === 'admin' ? Math.max(0, Number(price) || 0) : 50, img: img, source_img: sourceImg, source_version: oldSource ? Number(oldSource.version) || 0 : 0 });
        }
        await submit(state, 'upload', { settings_version: settings.version, items: rows });
      });
    }
    function dirty() { D.dirty = true; D.error = ''; D.message = ''; var el = document.querySelector('[data-224-dirty]'); if (el) el.textContent = 'Hay cambios sin aplicar.'; }
    document.addEventListener('change', function (event) {
      var el = event.target; beforeRender();
      if (el.dataset && el.dataset['224Option']) {
        if (!staff() || D.busy || D.pending || !D.loaded || !D.draft) return;
        D.draft[el.dataset['224Option']] = el.checked; dirty();
        var mark = document.querySelector('.s224-mark'); if (mark) mark.hidden = !D.draft.watermark;
      } else if (el.id === 's224-watermark-file') {
        if (!staff() || D.busy || D.pending || !D.loaded) return;
        var file = el.files && el.files[0], state = D; if (!file) return;
        state.busy = true; state.error = ''; api.render();
        watermarkFile(file).then(function (data) { if (sameSession(state)) { state.draft.watermark_data = data; dirty(); } }).catch(function (error) { if (sameSession(state)) state.error = error.message; }).finally(function () { if (sameSession(state)) { state.busy = false; api.render(); } });
      } else if (el.dataset && el.dataset['224Replace']) {
        if (!staff() || D.busy || D.pending) return;
        var item = (S.shop.items || []).find(function (it) { return String(it.id) === el.dataset['224Replace']; });
        if (item && el.files && el.files.length) upload(el.files, item.folder || 'Sin carpeta', item.price, item.id);
      }
    });
    document.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('[data-224-action],[data-224-motion]'); if (!button) return;
      beforeRender();
      if (button.hasAttribute('data-224-motion')) {
        var id = button.dataset['224Motion'], current = Object.prototype.hasOwnProperty.call(paused, id) ? paused[id] : reducedMotion(); paused[id] = !current;
        var tile = button.parentElement.querySelector('[data-224-preview]');
        if (tile) { tile.classList.toggle('s224-paused', paused[id]); tile.classList.toggle('s224-user-motion', !paused[id]); }
        button.textContent = paused[id] ? 'Reanudar movimiento' : 'Pausar movimiento'; button.setAttribute('aria-pressed', String(paused[id])); return;
      }
      if (!staff() || D.busy) return;
      var action = button.dataset['224Action'];
      if (action === 'save') save();
      else if (action === 'remove-watermark' && D.draft && !D.pending) { D.draft.watermark_data = null; dirty(); api.render(); }
      else if (action === 'reload' && !D.pending) { if (!D.dirty || root.confirm('Hay opciones sin aplicar. ¿Descartarlas y actualizar?')) { D.dirty = false; load(true); } }
      else if (action === 'retry' && D.pending) {
        if (api.syncIdle && !api.syncIdle()) { D.error = 'Espera a que terminen de guardarse los cambios anteriores.'; api.render(); return; }
        var state = D; state.busy = true; state.error = ''; api.render();
        runPending(state).catch(function (error) { if (sameSession(state)) { if (error.status >= 400 && error.status < 500) state.pending = null; state.error = error.message; } }).finally(function () { if (sameSession(state)) { state.busy = false; api.render(); } });
      } else if (action === 'discard' && D.pending && root.confirm('Descartar el reintento no revierte un cambio ya guardado. ¿Actualizar las opciones y descartar?')) { D.pending = null; D.dirty = false; load(true); }
    });
    function afterRender() {
      beforeRender(false);
      if (staff() && S.view === 'dash' && S.tab === 'tienda') { var folder = document.getElementById('shopfolder'), price = document.getElementById('shopprice'); if (folder && D.form.folder !== undefined) folder.value = D.form.folder; if (price && D.form.price !== undefined) price.value = D.form.price; }
      if (!D.publicLoaded && !D.publicLoading) publicLoad();
      if (staff() && S.view === 'dash' && S.tab === 'tienda' && !D.loaded && !D.loading && !D.error) load();
    }
    return { tab: tab, preview: preview, beforeRender: beforeRender, afterRender: afterRender, upload: upload, publicLoad: publicLoad, load: load, save: save, processFile: processFile, renderImage: renderImage, diagnostics: function () { return D; } };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
