'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../staging/photo-game-model.js');
const scene = id => M.SCENES.find(item => item.id === id);
const evaluate = (id, settings) => M.evaluate(scene(id), settings);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, message || `${actual} != ${expected}`);

assert.equal(M.SCENES.length, 4);
assert.deepEqual(M.SHUTTERS, [30, 60, 125, 250, 500, 1000, 2000, 4000]);
assert.deepEqual(M.APERTURES, [2.8, 4, 5.6, 8, 11, 16]);
assert.deepEqual(M.ISOS, [100, 200, 400, 800, 1600, 3200, 6400, 12800]);
for (const item of M.SCENES) {
  assert.ok(item.goal.includes('exposición'));
  assert.ok(item.asset.endsWith('.jpg'));
  const result = M.evaluate(item, item.recommended);
  assert.equal(result.passed, true, `La solución de referencia debe aprobar: ${item.id}`);
  assert.equal(result.score, 100, `El redondeo nominal de los ajustes no resta puntos: ${item.id}`);
  assert.equal(result.feedback.length, 4);
  assert.deepEqual(result.feedback.map(f => f.kind), ['exposure', 'motion', 'depth', 'noise']);
  assert.deepEqual(M.evaluate(item.id, item.recommended), result, 'Admite el id y el objeto de escena');
}

// Stops: doubling ISO doubles light; doubling shutter denominator halves it.
const baseline = evaluate('daylight-action', { shutter: 1000, aperture: 4, iso: 100 });
const twiceISO = evaluate('daylight-action', { shutter: 1000, aperture: 4, iso: 200 });
const twiceSpeed = evaluate('daylight-action', { shutter: 2000, aperture: 4, iso: 100 });
const open = evaluate('daylight-action', { shutter: 1000, aperture: 2.8, iso: 100 });
near(twiceISO.exposure - baseline.exposure, 1);
near(twiceISO.brightness / baseline.brightness, 2);
near(twiceSpeed.exposure - baseline.exposure, -1);
near(twiceSpeed.brightness / baseline.brightness, 0.5);
near(open.exposure - baseline.exposure, Math.log2(16 / 7.84));
assert.ok(open.cameraEV < baseline.cameraEV, 'Abrir el diafragma deja entrar más luz');

// Equivalent settings must pass without forcing a single predetermined answer.
for (const [id, settings] of [
  ['daylight-action', { shutter: 2000, aperture: 4, iso: 200 }],
  ['daylight-action', { shutter: 1000, aperture: 5.6, iso: 200 }],
  ['daylight-action', { shutter: 4000, aperture: 5.6, iso: 800 }],
  ['night-action', { shutter: 1000, aperture: 4, iso: 6400 }],
  ['night-action', { shutter: 2000, aperture: 2.8, iso: 6400 }],
  ['team-portrait', { shutter: 250, aperture: 8, iso: 400 }],
  ['team-portrait', { shutter: 125, aperture: 11, iso: 400 }],
  ['golden-hour-portrait', { shutter: 250, aperture: 2.8, iso: 200 }]
]) {
  const result = evaluate(id, settings);
  assert.equal(result.passed, true, `${id}: ${JSON.stringify(settings)} debe aprobar`);
  assert.equal(result.score, 100, `${id}: una combinación equivalente también puede lograr 100`);
}
assert.ok(twiceISO.score < 100, 'Un paso de sobreexposición sí resta puntos');
assert.ok(twiceSpeed.score < 100, 'Un paso de subexposición sí resta puntos');
near(baseline.exposure, 14 - Math.log2(16000), 'La tolerancia de puntuación no cambia la exposición física');

const dark = evaluate('night-action', { shutter: 1000, aperture: 2.8, iso: 100 });
assert.equal(dark.passed, false);
assert.equal(dark.exposureOk, false);
assert.ok(dark.exposure < -4);
assert.ok(dark.feedback[0].text.includes('subexpuesta'));
const blown = evaluate('daylight-action', { shutter: 1000, aperture: 4, iso: 800 });
assert.equal(blown.passed, false);
assert.ok(blown.exposure > 3);
assert.ok(blown.feedback[0].text.includes('sobreexpuesta'));
const motion = evaluate('night-action', { shutter: 500, aperture: 2.8, iso: 1600 });
assert.equal(motion.exposureOk, true);
assert.equal(motion.shutterOk, false);
assert.equal(motion.passed, false);
assert.ok(motion.motionBlur > 0);
assert.ok(motion.score < 85);
const group = evaluate('team-portrait', { shutter: 500, aperture: 4, iso: 200 });
assert.equal(group.exposureOk, true);
assert.equal(group.depthOk, false);
assert.equal(group.passed, false);
assert.ok(group.depthMiss > 0);
assert.ok(group.feedback[2].text.includes('dos filas'));
const background = evaluate('golden-hour-portrait', { shutter: 125, aperture: 5.6, iso: 400 });
assert.equal(background.exposureOk, true);
assert.equal(background.depthOk, false);
assert.equal(background.passed, false);
assert.ok(background.depthMiss > 0);

// ISO is a visible tradeoff, never an automatic penalty for low-light action.
const lowISO = evaluate('night-action', { shutter: 1000, aperture: 2.8, iso: 3200 });
const highISO = evaluate('night-action', { shutter: 2000, aperture: 2.8, iso: 6400 });
near(highISO.exposure, lowISO.exposure);
assert.equal(highISO.score, lowISO.score);
assert.equal(highISO.passed, true);
assert.ok(highISO.noise > lowISO.noise);
const highISODaylight = evaluate('daylight-action', { shutter: 4000, aperture: 5.6, iso: 800 });
assert.equal(highISODaylight.passed, true);
assert.equal(highISODaylight.feedback[3].ok, false);
assert.ok(highISODaylight.feedback[3].text.includes('solo si puedes conservar'));

for (const bad of [null, undefined, '', {}, 'unknown', { id: 'unknown', ev: 0 }]) {
  assert.throws(() => M.evaluate(bad, scene('night-action').recommended), RangeError);
}
for (const bad of [null, undefined, [], 'camera']) {
  assert.throws(() => M.evaluate('night-action', bad), TypeError);
}
for (const [field, values] of Object.entries({
  shutter: [0, -1, 1 / 1000, 999, NaN, Infinity, '1000', null],
  aperture: [0, -2.8, 1.4, NaN, Infinity, '2.8', null],
  iso: [0, -100, 50, 25600, NaN, Infinity, '3200', null]
})) {
  for (const value of values) {
    assert.throws(() => M.evaluate('night-action', { shutter: 1000, aperture: 2.8, iso: 3200, [field]: value }), RangeError);
  }
  const missing = { shutter: 1000, aperture: 2.8, iso: 3200 };
  delete missing[field];
  assert.throws(() => M.evaluate('night-action', missing), RangeError);
}

// Exhaustive combinations protect visual bounds and passing rules, including
// very dark, very bright, narrow-aperture and slow-shutter edge cases.
let passingCombinations = 0;
for (const item of M.SCENES) {
  let scenePasses = 0;
  for (const shutter of M.SHUTTERS) for (const aperture of M.APERTURES) for (const iso of M.ISOS) {
    const result = M.evaluate(item, { shutter, aperture, iso });
    assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100);
    assert.ok(Number.isFinite(result.exposure));
    assert.ok(result.brightness >= 0.18 && result.brightness <= 2.5);
    for (const field of ['motionBlur', 'depthMiss', 'noise']) assert.ok(result[field] >= 0 && result[field] <= 1);
    assert.equal(result.passed, result.exposureOk && result.shutterOk && result.depthOk && result.score >= 85);
    if (result.passed) scenePasses++;
  }
  assert.ok(scenePasses > 1, `La escena ${item.id} debe admitir varias soluciones`);
  passingCombinations += scenePasses;
}

const authored = scene('night-action');
const original = JSON.stringify(authored);
M.evaluate(authored, authored.recommended);
assert.equal(JSON.stringify(authored), original, 'Evaluar no cambia la escena');
assert.ok(Object.isFrozen(M) && Object.isFrozen(M.SCENES) && Object.isFrozen(authored.recommended));
assert.deepEqual(M.evaluate({ id: authored.id, ev: 1000 }, authored.recommended), M.evaluate(authored, authored.recommended), 'Las reglas de una escena no dependen de propiedades inyectadas');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../staging/photo-game-model.js'), 'utf8'), context);
assert.equal(typeof context.TSIPhotoGameModel.evaluate, 'function', 'El navegador expone el modelo UMD');
assert.equal(context.TSIPhotoGameModel.evaluate('night-action', { shutter: 1000, aperture: 2.8, iso: 3200 }).passed, true);
console.log(`Juego fotográfico: física de exposición, objetivos, validación, límites y UMD aprobados; ${passingCombinations} combinaciones válidas.`);
