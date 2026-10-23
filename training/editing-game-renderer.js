(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root, require('./editing-game-model.js'));
  else root.TSIEditingRenderer = factory(root, root.TSIEditingGameModel);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Model) {
  'use strict';

  const MAX_SIDE = 900;
  const CACHE_LIMIT = 4;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const smooth = (low, high, value) => {
    const t = clamp((value - low) / (high - low), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Always transform source pixels. Combining the scene and the player's changes
  // before this step makes recovery a simulation; it does not recreate RAW data.
  function processPixels(input, settings) {
    const controls = settings || {};
    const exposure = clamp(finite(controls.exposure === undefined ? controls.exposureEV : controls.exposure), -6, 6);
    const temperature = clamp(finite(controls.temperature), -200, 200);
    const highlights = clamp(finite(controls.highlights), -200, 200);
    const shadows = clamp(finite(controls.shadows), -200, 200);
    const contrast = clamp(finite(controls.contrast), -100, 100);
    const saturation = clamp(finite(controls.saturation), -140, 140);
    const output = new Uint8ClampedArray(input);
    if (!exposure && !temperature && !highlights && !shadows && !contrast && !saturation) return output;

    const exposureGain = Math.pow(2, exposure);
    const warmGain = Math.pow(2, temperature * 0.0035);
    const coolGain = 1 / warmGain;
    const contrastGain = Math.pow(2, contrast / 60);
    const saturationGain = Math.max(0, 1 + saturation / 100);
    const toneGains = new Float64Array(256);
    for (let level = 0; level < 256; level++) {
      const luminance = level / 255;
      const lightMask = smooth(0.45, 0.95, luminance);
      const shadowMask = 1 - smooth(0.05, 0.6, luminance);
      toneGains[level] = exposureGain * Math.pow(2, highlights * 0.009 * lightMask + shadows * 0.012 * shadowMask);
    }

    for (let index = 0; index + 3 < input.length; index += 4) {
      const sourceLuminance = (0.2126 * input[index] + 0.7152 * input[index + 1] + 0.0722 * input[index + 2]) / 255;
      const gain = toneGains[Math.round(sourceLuminance * 255)];
      let red = input[index] / 255 * gain * warmGain;
      let green = input[index + 1] / 255 * gain;
      let blue = input[index + 2] / 255 * gain * coolGain;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const contrastLuminance = (luminance - 0.5) * contrastGain + 0.5;
      const contrastDelta = contrastLuminance - luminance;
      red += contrastDelta;
      green += contrastDelta;
      blue += contrastDelta;
      output[index] = (contrastLuminance + (red - contrastLuminance) * saturationGain) * 255;
      output[index + 1] = (contrastLuminance + (green - contrastLuminance) * saturationGain) * 255;
      output[index + 2] = (contrastLuminance + (blue - contrastLuminance) * saturationGain) * 255;
      // Alpha is copied unchanged by the constructor, including transparent pixels.
    }
    return output;
  }

  function create(options) {
    if (!Model || !root.document || typeof root.Image !== 'function') {
      throw new Error('No se pudo iniciar la vista de edición. Recarga la página para volver a intentarlo.');
    }
    const imageBase = String(options && options.imageBase || 'photo-game-scenes/').replace(/\/?$/, '/');
    if (/^(?:[a-z]+:|\/\/)/i.test(imageBase) || /[\\\s?#]/.test(imageBase) || imageBase.split('/').includes('..')) {
      throw new Error('Las imágenes del reto deben pertenecer a esta página.');
    }
    const cache = new Map();
    let generations = new WeakMap();
    let destroyed = false;
    let sequence = 0;

    function dimensions(canvas) {
      return { width: Number(canvas && canvas.width) || 0, height: Number(canvas && canvas.height) || 0 };
    }

    function cancelledError() {
      const error = new Error('La carga de la imagen se canceló.');
      error.name = 'AbortError';
      return error;
    }

    function load(asset) {
      if (!/^[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(String(asset || ''))) {
        return Promise.reject(new Error('La imagen de este reto no está disponible. Elige otro reto.'));
      }
      const url = imageBase + asset;
      if (cache.has(url)) {
        const entry = cache.get(url);
        cache.delete(url);
        cache.set(url, entry);
        return entry.promise;
      }
      const entry = { image: new root.Image(), pending: true, cancel: null, promise: null };
      entry.promise = new Promise((resolve, reject) => {
        const image = entry.image;
        const detach = () => { image.onload = null; image.onerror = null; };
        entry.cancel = () => {
          if (!entry.pending) return;
          entry.pending = false;
          detach();
          image.src = '';
          reject(cancelledError());
        };
        image.onload = () => {
          if (!entry.pending) return;
          entry.pending = false;
          detach();
          try {
            const naturalWidth = image.naturalWidth || image.width;
            const naturalHeight = image.naturalHeight || image.height;
            if (!(naturalWidth > 0 && naturalHeight > 0)) throw new Error('invalid-image');
            const scale = Math.min(1, MAX_SIDE / naturalWidth, MAX_SIDE / naturalHeight);
            const width = Math.max(1, Math.round(naturalWidth * scale));
            const height = Math.max(1, Math.round(naturalHeight * scale));
            const workCanvas = root.document.createElement('canvas');
            workCanvas.width = width;
            workCanvas.height = height;
            const context = workCanvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('missing-context');
            context.drawImage(image, 0, 0, width, height);
            const pixels = new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
            // The source pixels and one working canvas are the only retained image data.
            image.src = '';
            entry.image = null;
            resolve({ width, height, pixels, workCanvas, context });
          } catch (_) {
            if (cache.get(url) === entry) cache.delete(url);
            reject(new Error('No se pudo preparar la imagen. Recarga la página o elige otro reto.'));
          }
        };
        image.onerror = () => {
          if (!entry.pending) return;
          entry.pending = false;
          detach();
          if (cache.get(url) === entry) cache.delete(url);
          reject(new Error('No se pudo cargar la foto del reto. Revisa tu conexión y vuelve a intentarlo.'));
        };
        image.src = url;
      });
      cache.set(url, entry);
      while (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        const removed = cache.get(oldest);
        cache.delete(oldest);
        removed.cancel();
      }
      return entry.promise;
    }

    async function draw(canvas, scene, settings, mode) {
      if (destroyed) return dimensions(canvas);
      if (!canvas || typeof canvas.getContext !== 'function') throw new Error('No se encontró la vista de la fotografía.');
      const generation = ++sequence;
      generations.set(canvas, generation);
      const current = () => !destroyed && generations.get(canvas) === generation;
      let source;
      try {
        source = await load(scene && scene.asset);
      } catch (error) {
        if (!current() || error.name === 'AbortError') return dimensions(canvas);
        throw error;
      }
      if (!current()) return dimensions(canvas);
      const original = mode === 'original';
      const effective = Model.effective(scene, original ? Model.DEFAULTS : settings);
      const crop = original ? { x: 0, y: 0, width: source.width, height: source.height }
        : Model.cropRect(source.width, source.height, effective.crop, effective.panX, effective.panY);
      const pixels = processPixels(source.pixels, effective);
      const rendered = source.context.createImageData(source.width, source.height);
      rendered.data.set(pixels);
      source.context.putImageData(rendered, 0, 0);
      canvas.width = Math.max(1, Math.round(crop.width));
      canvas.height = Math.max(1, Math.round(crop.height));
      if (canvas.style) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
      }
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Tu navegador no pudo mostrar la foto. Intenta recargar la página.');
      context.drawImage(source.workCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      return dimensions(canvas);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      generations = new WeakMap();
      cache.forEach(entry => entry.cancel());
      cache.clear();
    }

    return Object.freeze({ draw, destroy });
  }

  return Object.freeze({ create, processPixels });
}));
