'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Renderer = require('../staging/editing-game-renderer.js');
const Model = require('../staging/editing-game-model.js');
const pixel = (red, green = red, blue = red, alpha = 255) => new Uint8ClampedArray([red, green, blue, alpha]);
const process = (input, settings) => Renderer.processPixels(input, settings);
const light = input => 0.2126 * input[0] + 0.7152 * input[1] + 0.0722 * input[2];

const source = new Uint8ClampedArray([0, 14, 255, 0, 80, 120, 170, 87, 255, 255, 255, 255]);
const untouched = source.slice();
const identity = process(source, Model.DEFAULTS);
assert.deepEqual(identity, source, 'Los controles neutros conservan exactamente la imagen');
assert.notEqual(identity, source, 'La salida es una copia independiente');
assert.deepEqual(source, untouched, 'El procesamiento no muta los píxeles originales');

const gray = pixel(100);
assert.ok(light(process(gray, { exposure: 1 })) > light(gray), 'Más exposición ilumina');
assert.ok(light(process(gray, { exposure: -1 })) < light(gray), 'Menos exposición oscurece');
assert.ok(light(process(gray, { exposure: 2 })) > light(process(gray, { exposure: 1 })), 'La exposición crece de forma monótona');
assert.deepEqual(process(gray, { exposureEV: 1 }), process(gray, { exposure: 1 }), 'El helper acepta el alias de exposición');
const warm = process(gray, { temperature: 70 });
const cool = process(gray, { temperature: -70 });
assert.ok(warm[0] > warm[2] && cool[2] > cool[0], 'La temperatura cambia el balance rojo/azul');
assert.equal(warm[1], gray[1], 'La temperatura conserva el canal verde sin otros controles');

const dark = pixel(40);
const bright = pixel(210);
const highlightEffect = input => Math.abs(light(process(input, { highlights: -70 })) - light(input));
const shadowEffect = input => Math.abs(light(process(input, { shadows: 70 })) - light(input));
assert.ok(highlightEffect(bright) > highlightEffect(dark) * 4, 'Las luces actúan principalmente en las zonas claras');
assert.ok(shadowEffect(dark) > shadowEffect(bright) * 4, 'Las sombras actúan principalmente en las zonas oscuras');
assert.ok(light(process(dark, { contrast: 30 })) < light(dark), 'El contraste profundiza las zonas oscuras');
assert.ok(light(process(bright, { contrast: 30 })) > light(bright), 'El contraste separa las zonas claras');
const color = pixel(180, 100, 60);
const grayColor = process(color, { saturation: -100 });
assert.equal(grayColor[0], grayColor[1]);
assert.equal(grayColor[1], grayColor[2]);
const saturated = process(color, { saturation: 40 });
assert.ok(saturated[0] - saturated[2] > color[0] - color[2], 'La saturación separa los canales de color');
assert.ok(process(pixel(240), { exposure: 6 })[0] === 255, 'Las luces se limitan al máximo representable');
assert.ok(process(pixel(0), { contrast: 100 })[0] === 0, 'Los valores negativos se limitan a negro');
for (const controls of [
  { exposure: 6, temperature: 200, highlights: 200, shadows: 200, contrast: 100, saturation: 140 },
  { exposure: -6, temperature: -200, highlights: -200, shadows: -200, contrast: -100, saturation: -140 },
  { exposure: NaN, temperature: Infinity, contrast: 'no válido' }
]) {
  const result = process(source, controls);
  assert.equal(result.length, source.length);
  for (let index = 3; index < result.length; index += 4) assert.equal(result[index], source[index], 'El alfa permanece intacto');
  assert.ok(Array.from(result).every(value => value >= 0 && value <= 255));
}
assert.deepEqual(source, untouched, 'Ningún control acumula cambios sobre la fuente');
const recoverScene = Model.SCENES[0];
const recoverSettings = { ...Model.DEFAULTS,
  ...Object.fromEntries(Object.entries(recoverScene.base).map(([key, value]) => [key, -value])) };
assert.deepEqual(process(source, Model.effective(recoverScene, recoverSettings)), source,
  'Una corrección inversa recupera la referencia virtual antes de recortar canales');

// A small browser double exercises asynchronous image races and lifecycle without
// needing a graphics package or a network connection.
async function browserChecks() {
  const pending = new Map();
  const images = [];
  class FakeImage {
    constructor() { this.naturalWidth = 1400; this.naturalHeight = 788; images.push(this); }
    set src(value) { this.url = value; if (value) pending.set(value, this); }
    get src() { return this.url; }
  }
  class FakeCanvas {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.style = {};
      this.context = {
        data: null,
        draws: 0,
        drawImage: image => {
          this.context.draws++;
          const value = image instanceof FakeImage ? image.value || 100 : image.context.data[0];
          this.context.data = new Uint8ClampedArray(this.width * this.height * 4).fill(value);
        },
        getImageData: () => ({ data: this.context.data }),
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: data => { this.context.data = data.data.slice(); }
      };
    }
    getContext() { return this.context; }
  }
  const context = vm.createContext({
    Uint8ClampedArray,
    Float64Array,
    Image: FakeImage,
    document: { createElement: () => new FakeCanvas() },
    TSIEditingGameModel: Model
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../staging/editing-game-renderer.js'), 'utf8'), context);
  const browserRenderer = context.TSIEditingRenderer;
  assert.equal(typeof browserRenderer.create, 'function', 'El script también expone el API de navegador');
  assert.throws(() => browserRenderer.create({ imageBase: 'https://otro-sitio.example/' }), /pertenecer/);
  assert.throws(() => browserRenderer.create({ imageBase: '\\\\otro-sitio.example\\' }), /pertenecer/);
  const renderer = browserRenderer.create({ imageBase: 'photo-game-scenes/' });
  const canvas = new FakeCanvas();
  const scene = asset => ({ ...recoverScene, asset });
  const neutral = recoverSettings;
  function resolve(asset, value) {
    const image = pending.get('photo-game-scenes/' + asset);
    assert.ok(image, `La imagen ${asset} fue solicitada`);
    image.value = value;
    image.onload();
  }

  const slow = renderer.draw(canvas, scene('slow.jpg'), neutral, 'edited');
  const fast = renderer.draw(canvas, scene('fast.jpg'), neutral, 'edited');
  resolve('fast.jpg', 170);
  const fastSize = await fast;
  assert.equal(fastSize.width, 900);
  assert.equal(fastSize.height, 507);
  const currentDraws = canvas.context.draws;
  resolve('slow.jpg', 40);
  await slow;
  assert.equal(canvas.context.draws, currentDraws, 'Una imagen anterior no reemplaza un reto más reciente');
  assert.equal(canvas.context.data[0], 170);
  assert.equal(canvas.style.width, '100%');
  assert.equal(canvas.style.height, '100%');

  const imageCount = images.length;
  await renderer.draw(canvas, scene('fast.jpg'), { ...neutral, exposure: neutral.exposure - 1 }, 'edited');
  assert.equal(images.length, imageCount, 'Reutiliza la imagen ya cargada');
  assert.ok(canvas.context.data[0] < 170, 'Los ajustes modifican los píxeles del lienzo');
  await renderer.draw(canvas, scene('fast.jpg'), neutral, 'edited');
  assert.equal(canvas.context.data[0], 170, 'Volver a cero usa la fuente y no la edición anterior');
  const square = await renderer.draw(canvas, scene('fast.jpg'), { ...neutral, crop: 'square' }, 'edited');
  assert.equal(square.width, square.height, 'El recorte cambia las proporciones reales del lienzo');
  const full = await renderer.draw(canvas, scene('fast.jpg'), { ...Model.DEFAULTS, crop: 'square', exposure: -2 }, 'original');
  assert.equal(full.width, 900, 'El antes muestra todo el encuadre');
  assert.equal(full.height, 507);
  assert.equal(canvas.context.data[0], process(pixel(170), Model.effective(recoverScene, Model.DEFAULTS))[0],
    'El antes aplica el defecto inicial y no los controles del jugador');

  const failed = renderer.draw(canvas, scene('missing.jpg'), neutral, 'edited');
  pending.get('photo-game-scenes/missing.jpg').onerror();
  await assert.rejects(failed, /No se pudo cargar la foto/);
  const retry = renderer.draw(canvas, scene('missing.jpg'), neutral, 'edited');
  resolve('missing.jpg', 90);
  await retry;
  const waiting = renderer.draw(canvas, scene('waiting.jpg'), neutral, 'edited');
  const waitingImage = pending.get('photo-game-scenes/waiting.jpg');
  const beforeDestroy = canvas.context.draws;
  renderer.destroy();
  renderer.destroy();
  await waiting;
  assert.equal(waitingImage.src, '', 'Destruir cancela las cargas pendientes');
  assert.equal(waitingImage.onload, null);
  await renderer.draw(canvas, scene('another.jpg'), Model.DEFAULTS, 'edited');
  assert.equal(canvas.context.draws, beforeDestroy, 'Un renderizador destruido no vuelve a pintar');

  const bounded = browserRenderer.create();
  const requests = [];
  for (let index = 0; index < 5; index++) {
    requests.push(bounded.draw(new FakeCanvas(), scene(`cache-${index}.jpg`), neutral, 'edited'));
  }
  assert.equal(pending.get('photo-game-scenes/cache-0.jpg').src, '', 'La caché retiene como máximo cuatro cargas');
  for (let index = 1; index < 5; index++) resolve(`cache-${index}.jpg`, 100 + index);
  await Promise.all(requests);
  bounded.destroy();
}

browserChecks().then(() => console.log('Editing game renderer checks passed.')).catch(error => {
  console.error(error);
  global.process.exitCode = 1;
});
