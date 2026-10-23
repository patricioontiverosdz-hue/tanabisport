'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../staging/editing-game-model.js');
const scene = id => M.SCENES.find(item => item.id === id);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const settingsFor = item => Object.assign({}, M.DEFAULTS,
  Object.fromEntries(M.CONTROLS.map(control => [control.key, -item.base[control.key]])),
  item.cropGoal ? { crop: item.cropGoal[0], panX: 5 } : {});
const recipePattern = /\b(?:ISO|apertura|obturador|diafragma|EV|usa|sube|baja|abre|cierra|reduce|aumenta|ajusta|recomendaci[oó]n)\b|f\s*\/|\d/i;
const diagnose = result => {
  assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100);
  assert.equal(result.feedback.length, 7);
  assert.deepEqual(result.feedback.map(item => item.kind), ['light', 'color', 'highlights', 'shadows', 'contrast', 'saturation', 'crop']);
  assert.equal(result.passed, result.score >= 85 && result.feedback.every(item => item.ok));
  for (const item of result.feedback) {
    assert.equal(typeof item.ok, 'boolean');
    assert.ok(!recipePattern.test(item.title + ' ' + item.text), `El diagnóstico muestra el efecto sin una receta: ${item.text}`);
  }
  for (const control of M.CONTROLS) {
    assert.ok(Number.isFinite(result.effective[control.key]));
    assert.ok(result.effective[control.key] >= control.min * 2 && result.effective[control.key] <= control.max * 2);
  }
};

assert.equal(M.SCENES.length, 16);
assert.equal(new Set(M.SCENES.map(item => item.id)).size, 16);
assert.equal(new Set(M.SCENES.map(item => item.asset)).size, 16);
const addedScenes = ['detail-track', 'natural-tennis', 'indoor-volleyball', 'sunlit-cycling',
  'pool-color', 'late-baseball', 'night-celebration', 'shade-portrait'];
assert.deepEqual(M.SCENES.slice(8).map(item => item.id), addedScenes, 'La ampliación conserva los encargos anteriores');
const camera = require('../staging/photo-game-model.js');
assert.deepEqual([...new Set(M.SCENES.map(item => item.asset))].sort(),
  [...new Set(camera.SCENES.map(item => item.asset))].sort(), 'Los dos juegos comparten las fotografías nuevas');
assert.deepEqual(M.CROPS, ['original', 'landscape', 'square', 'portrait']);
assert.deepEqual(M.CONTROLS.map(item => [item.key, item.min, item.max, item.step]), [
  ['exposure', -3, 3, 0.1], ['temperature', -100, 100, 5], ['highlights', -100, 100, 5],
  ['shadows', -100, 100, 5], ['contrast', -50, 50, 5], ['saturation', -70, 70, 5]
]);
assert.deepEqual(M.DEFAULTS, { exposure: 0, temperature: 0, highlights: 0, shadows: 0,
  contrast: 0, saturation: 0, crop: 'original', panX: 0, panY: 0 });

// Solutions are private test fixtures, never supplied as player-facing advice.
// Every full-credit interval allows several distinct stylistic choices.
for (const item of M.SCENES) {
  assert.ok(item.goal.length > 50);
  for (const field of ['title', 'subtitle', 'goal', 'imageAlt']) {
    assert.ok(!recipePattern.test(item[field]), `${item.id}.${field} debe describir el resultado visual`);
  }
  for (const forbidden of ['recommended', 'tip', 'target', 'solution', 'answer']) {
    assert.ok(!Object.hasOwn(item, forbidden), 'La escena no expone una receta');
  }
  assert.ok(fs.existsSync(path.join(__dirname, '../staging/photo-game-scenes', item.asset)));
  assert.equal(Object.keys(item.base).length, 6);
  const box = item.subject;
  assert.ok(box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0);
  assert.ok(box.x + box.width <= 1 && box.y + box.height <= 1);
  const original = JSON.stringify(item);
  const winning = settingsFor(item);
  for (const variation of [winning, { ...winning, exposure: winning.exposure + 0.1 },
    { ...winning, temperature: winning.temperature + 5 }, { ...winning, saturation: winning.saturation - 5 }]) {
    const evaluated = M.evaluate(item, variation);
    diagnose(evaluated);
    assert.equal(evaluated.score, 100, `${item.id}: varias ediciones deben obtener puntuación completa`);
    assert.equal(evaluated.passed, true, `${item.id}: una edición coherente debe aprobar`);
  }
  assert.deepEqual(M.evaluate(item.id, winning), M.evaluate(item, winning));
  assert.equal(JSON.stringify(item), original, 'La evaluación no modifica las escenas');
  assert.equal(M.evaluate(item, M.DEFAULTS).passed, false, `${item.id}: la foto inicial sí contiene un problema`);
}

// One stop doubles the modeled linear light. Other correction channels remain
// independent so a change to shadows cannot silently overwrite exposure.
const night = scene('night-detail');
const before = M.effective(night, M.DEFAULTS);
const oneStop = M.effective(night, { ...M.DEFAULTS, exposure: 1 });
near(oneStop.exposure - before.exposure, 1);
near(Math.pow(2, oneStop.exposure) / Math.pow(2, before.exposure), 2);
assert.equal(before.exposure, -1);
assert.equal(before.shadows, -35);
assert.equal(before.temperature, 10);
assert.equal(oneStop.shadows, before.shadows);
assert.equal(oneStop.temperature, before.temperature);
assert.equal(M.evaluate(night, M.DEFAULTS).feedback[0].ok, false);
assert.equal(M.evaluate(night, M.DEFAULTS).feedback[3].ok, false);
const editedNight = M.evaluate(night, settingsFor(night));
assert.equal(editedNight.effective.exposure, 0, 'La noche conserva la luminosidad de la foto fuente nocturna');
const dayLikeNight = M.evaluate(night, { ...settingsFor(night), exposure: 3 });
assert.equal(dayLikeNight.passed, false, 'Una escena nocturna no gana por aclararla indiscriminadamente');
assert.equal(dayLikeNight.feedback[0].ok, false);

// A diagnostic names the visible defect instead of prescribing a slider value.
const defectCases = [
  ['warm-cast', 'temperature', 60, 'color'], ['bright-detail', 'highlights', 60, 'highlights'],
  ['backlight', 'shadows', -60, 'shadows'], ['natural-colors', 'saturation', 65, 'saturation'],
  ['flat-action', 'contrast', -40, 'contrast']
];
for (const [id, key, effectiveValue, kind] of defectCases) {
  const item = scene(id);
  const settings = { ...settingsFor(item), [key]: effectiveValue - item.base[key] };
  const result = M.evaluate(item, settings);
  assert.equal(result.passed, false);
  assert.equal(result.feedback.find(entry => entry.kind === kind).ok, false);
  diagnose(result);
}

// Pixel crops and normalized subject rectangles describe the same geometry.
const cropOriginal = M.cropRect(1400, 788, 'original', 0, 0);
assert.deepEqual(cropOriginal, { x: 0, y: 0, width: 1400, height: 788 });
near(M.cropRect(1400, 788, 'landscape').width / M.cropRect(1400, 788, 'landscape').height, 3 / 2);
near(M.cropRect(1400, 788, 'square').width, M.cropRect(1400, 788, 'square').height);
near(M.cropRect(1400, 788, 'portrait').width / M.cropRect(1400, 788, 'portrait').height, 4 / 5);
for (const [width, height] of [[1400, 788], [900, 900 * 788 / 1400], [600, 900], [250, 250]]) {
  for (const crop of M.CROPS) for (const panX of [-100, 0, 100]) for (const panY of [-100, 0, 100]) {
    const rect = M.cropRect(width, height, crop, panX, panY);
    assert.ok(rect.x >= -1e-8 && rect.y >= -1e-8 && rect.width > 0 && rect.height > 0);
    assert.ok(rect.x + rect.width <= width + 1e-8 && rect.y + rect.height <= height + 1e-8);
    const scaled = M.cropRect(width * 0.5, height * 0.5, crop, panX, panY);
    for (const key of ['x', 'y', 'width', 'height']) near(scaled[key], rect[key] * 0.5);
  }
}
const left = M.cropRect(1400, 788, 'portrait', -100, 0);
const right = M.cropRect(1400, 788, 'portrait', 100, 0);
near(left.x, 0);
near(right.x + right.width, 1400);
const tallTop = M.cropRect(600, 900, 'landscape', 0, -100);
const tallBottom = M.cropRect(600, 900, 'landscape', 0, 100);
near(tallTop.y, 0);
near(tallBottom.y + tallBottom.height, 900);

const vertical = scene('vertical-action');
const verticalGood = settingsFor(vertical);
assert.equal(M.evaluate(vertical, verticalGood).passed, true, 'El atleta y el balón caben en el encuadre vertical');
assert.equal(M.evaluate(vertical, { ...verticalGood, crop: 'original' }).passed, false, 'El objetivo de formato también se evalúa');
assert.equal(M.evaluate(vertical, { ...verticalGood, panX: -100 }).feedback.at(-1).ok, false, 'Cortar al sujeto no puede aprobar');
assert.equal(M.evaluate(vertical, { ...verticalGood, panX: 100 }).feedback.at(-1).ok, false);
for (const id of ['bright-detail', 'flat-action']) {
  const item = scene(id);
  assert.equal(M.evaluate(item, { ...settingsFor(item), crop: 'portrait' }).passed, false, 'El grupo completo y la atajada requieren conservar todos sus extremos');
}
for (const item of M.SCENES.slice(8)) {
  assert.ok(!item.cropGoal, 'Los nuevos encargos admiten distintos formatos cuando conservan al protagonista');
  assert.equal(M.evaluate(item, settingsFor(item)).passed, true, 'La composición completa es una entrega válida');
  assert.ok(item.subject.width<1, 'Cada imagen nueva tiene una región del protagonista revisada');
}
for(const id of ['pool-color','indoor-volleyball'])assert.equal(M.evaluate(scene(id),{...settingsFor(scene(id)),crop:'portrait'}).passed,false,'El recorte conserva manos y participantes: '+id);

// Invalid values fail consistently in both the renderer API and scoring API.
for (const bad of [null, undefined, '', {}, [], 'unknown', { id: 'unknown' }]) {
  assert.throws(() => M.evaluate(bad, M.DEFAULTS), RangeError);
  assert.throws(() => M.effective(bad, M.DEFAULTS), RangeError);
}
for (const bad of [null, undefined, [], 'editor']) {
  assert.throws(() => M.evaluate(night, bad), TypeError);
  assert.throws(() => M.effective(night, bad), TypeError);
}
for (const control of M.CONTROLS) {
  for (const bad of [NaN, Infinity, -Infinity, null, '0', control.min - control.step,
    control.max + control.step, control.min + control.step / 2]) {
    assert.throws(() => M.effective(night, { ...M.DEFAULTS, [control.key]: bad }), RangeError);
  }
  const missing = { ...M.DEFAULTS };
  delete missing[control.key];
  assert.throws(() => M.evaluate(night, missing), RangeError);
}
for (const bad of [null, undefined, 'wide', 0, []]) {
  assert.throws(() => M.effective(night, { ...M.DEFAULTS, crop: bad }), RangeError);
}
for (const key of ['panX', 'panY']) for (const bad of [null, undefined, '0', NaN, Infinity, -105, 105, 2]) {
  assert.throws(() => M.effective(night, { ...M.DEFAULTS, [key]: bad }), RangeError);
}
for (const [width, height] of [[0, 100], [-1, 100], [100, NaN], [Infinity, 100], ['100', 100]]) {
  assert.throws(() => M.cropRect(width, height, 'original'), RangeError);
}

// Extremes and mixed channels must remain finite; panning and format cannot be
// bypassed by a high score in the other dimensions.
let evaluatedCount = 0;
function* combinations(index = 0, current = { ...M.DEFAULTS }) {
  if (index === M.CONTROLS.length) { yield current; return; }
  const control = M.CONTROLS[index];
  for (const value of [control.min, 0, control.max]) {
    yield* combinations(index + 1, { ...current, [control.key]: value });
  }
}
for (const item of M.SCENES) for (const settings of combinations()) {
  const result = M.evaluate(item, settings);
  diagnose(result);
  evaluatedCount++;
}

assert.ok(Object.isFrozen(M) && Object.isFrozen(M.SCENES) && Object.isFrozen(M.DEFAULTS));
assert.ok(M.CONTROLS.every(Object.isFrozen));
assert.ok(M.SCENES.every(item => Object.isFrozen(item) && Object.isFrozen(item.base) && Object.isFrozen(item.subject)));
assert.deepEqual(M.evaluate({ id: night.id, base: { exposure: 500 }, subject: {} }, M.DEFAULTS),
  M.evaluate(night, M.DEFAULTS), 'Los objetos inyectados no cambian las reglas');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../staging/editing-game-model.js'), 'utf8'), context);
assert.equal(typeof context.TSIEditingGameModel.evaluate, 'function', 'El navegador expone el modelo UMD');
assert.equal(context.TSIEditingGameModel.evaluate(night.id, settingsFor(night)).passed, true);
for(const [id,crop,panX] of [['detail-track','square',0],['natural-tennis','portrait',0],['indoor-volleyball','square',0],['sunlit-cycling','portrait',0],['late-baseball','square',35],['shade-portrait','portrait',0]]){
 const scene=M.SCENES.find(item=>item.id===id);
 assert.equal(M.evaluate(scene,{...settingsFor(scene),crop,panX}).score,100,'Un recorte que conserva al protagonista es válido: '+id);
}
console.log(`Juego de edición: dieciséis retos sin recetas, varias ediciones válidas, luz, color, validación y encuadres aprobados; ${evaluatedCount} combinaciones comprobadas.`);
