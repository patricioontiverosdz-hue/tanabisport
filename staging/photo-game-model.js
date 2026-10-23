(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TSIPhotoGameModel = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SHUTTERS = Object.freeze([30, 60, 125, 250, 500, 1000, 2000, 4000]);
  const APERTURES = Object.freeze([2.8, 4, 5.6, 8, 11, 16]);
  const ISOS = Object.freeze([100, 200, 400, 800, 1600, 3200, 6400, 12800]);
  const SCENES = Object.freeze([
    {
      id: 'daylight-action',
      title: 'Acción a pleno sol',
      subtitle: 'Un instante decisivo en la cancha',
      goal: 'Equilibra la exposición y congela la acción con 1/1000 s o más rápido y f/5.6 o más abierto para separar al sujeto.',
      lighting: 'Sol de día · EV 14',
      ev: 14,
      asset: 'daylight-action.jpg',
      imageAlt: 'Futbolista en plena carrera en una cancha iluminada por el sol.',
      minShutter: 1000,
      maxAperture: 5.6,
      preferredISO: 400,
      recommended: { shutter: 1000, aperture: 4, iso: 100 },
      tip: 'Empieza por una velocidad que congele al jugador. Ajusta después apertura e ISO para equilibrar la exposición.'
    },
    {
      id: 'night-action',
      title: 'Partido bajo reflectores',
      subtitle: 'Velocidad cuando la luz escasea',
      goal: 'Equilibra la exposición y congela la acción con 1/1000 s o más rápido y f/4 o más abierto.',
      lighting: 'Cancha nocturna · EV 8',
      ev: 8,
      asset: 'night-action.jpg',
      imageAlt: 'Futbolista en acción durante un partido nocturno bajo los reflectores de la cancha.',
      minShutter: 1000,
      maxAperture: 4,
      preferredISO: 6400,
      recommended: { shutter: 1000, aperture: 2.8, iso: 3200 },
      tip: 'El ISO alto puede ser necesario de noche. Prioriza congelar la acción y exponer bien; después busca reducir ruido si la luz lo permite.'
    },
    {
      id: 'team-portrait',
      title: 'Retrato de equipo',
      subtitle: 'Cada rostro cuenta',
      goal: 'Equilibra la exposición y mantén nítidas las dos filas: usa f/8 o más cerrado y 1/125 s o más rápido.',
      lighting: 'Luz de día suave · EV 12',
      ev: 12,
      asset: 'team-portrait.jpg',
      imageAlt: 'Equipo de fútbol posando en dos filas para una fotografía de grupo.',
      minShutter: 125,
      minAperture: 8,
      preferredISO: 800,
      recommended: { shutter: 125, aperture: 8, iso: 200 },
      tip: 'Cerrar a f/8 ayuda a cubrir ambas filas. Si falta luz, compensa con ISO sin bajar de la velocidad del reto.'
    },
    {
      id: 'golden-hour-portrait',
      title: 'Retrato al atardecer',
      subtitle: 'El protagonista y un fondo suave',
      goal: 'Equilibra la exposición y suaviza el fondo usando f/2.8 y 1/125 s o más rápido.',
      lighting: 'Atardecer · EV 10',
      ev: 10,
      asset: 'golden-hour-portrait.jpg',
      imageAlt: 'Retrato de una futbolista al atardecer con la cancha al fondo.',
      minShutter: 125,
      maxAperture: 2.8,
      preferredISO: 800,
      recommended: { shutter: 125, aperture: 2.8, iso: 100 },
      tip: 'Abre a f/2.8 para un fondo suave. Puedes combinar distintas velocidades e ISO manteniendo la exposición.'
    }
  ].map(function (scene) {
    Object.freeze(scene.recommended);
    return Object.freeze(scene);
  }));

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function stopText(value) { return Math.abs(value).toFixed(1).replace('.', ','); }
  function fText(value) { return 'f/' + String(value).replace('.', ','); }

  function resolveScene(scene) {
    const id = typeof scene === 'string' ? scene : scene && scene.id;
    const found = SCENES.find(function (candidate) { return candidate.id === id; });
    if (!found) throw new RangeError('Elige una escena válida del juego.');
    // All calculations use the scenario's authored light and objectives.
    return found;
  }

  function validateSetting(settings, field, options) {
    const value = settings[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || options.indexOf(value) === -1) {
      throw new RangeError('El ajuste de ' + field + ' debe ser una opción válida de la cámara.');
    }
    return value;
  }

  function evaluate(scene, settings) {
    scene = resolveScene(scene);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new TypeError('Selecciona velocidad, apertura e ISO.');
    }
    const shutter = validateSetting(settings, 'shutter', SHUTTERS);
    const aperture = validateSetting(settings, 'aperture', APERTURES);
    const iso = validateSetting(settings, 'iso', ISOS);

    // EV at ISO 100; shutter is the denominator of an exposure in seconds.
    // One positive exposure stop doubles the simulated brightness. These are
    // teaching approximations, not camera-specific RAW or optical rendering.
    const cameraEV = Math.log2(aperture * aperture * shutter) - Math.log2(iso / 100);
    const exposure = scene.ev - cameraEV;
    const exposureOk = Math.abs(exposure) <= 0.65;
    const shutterOk = shutter >= scene.minShutter;
    const depthOk = (!scene.minAperture || aperture >= scene.minAperture) &&
      (!scene.maxAperture || aperture <= scene.maxAperture);
    const motionBlur = clamp(1 - shutter / scene.minShutter, 0, 1);
    let depthStops = 0;
    if (scene.minAperture && aperture < scene.minAperture) depthStops = Math.log2(scene.minAperture / aperture);
    if (scene.maxAperture && aperture > scene.maxAperture) depthStops = Math.log2(aperture / scene.maxAperture);
    const depthMiss = clamp(depthStops / 2, 0, 1);
    const noise = clamp(Math.log2(iso / 100) / 7, 0, 1);
    const brightness = clamp(Math.pow(2, exposure), 0.18, 2.5);

    // Exposure, movement and the stated depth goal decide the score. ISO is an
    // independent visual indicator so necessary night sensitivity is not a fault.
    // Nominal camera steps (f/2.8, f/5.6, 1/125 s) are rounded values.
    // Ignore their tiny EV difference when scoring an otherwise ideal shot.
    const exposurePenalty = Math.min(60, Math.max(0, Math.abs(exposure) - 0.10) * 20);
    const motionPenalty = shutterOk ? 0 : 18 + 12 * motionBlur;
    const depthPenalty = depthOk ? 0 : 18 + 10 * depthMiss;
    const score = Math.round(clamp(100 - exposurePenalty - motionPenalty - depthPenalty, 0, 100));
    const passed = exposureOk && shutterOk && depthOk && score >= 85;

    const feedback = [{
      kind: 'exposure',
      ok: exposureOk,
      title: exposureOk ? 'Exposición equilibrada' : exposure > 0 ? 'Demasiada luz' : 'Falta luz',
      text: exposureOk
        ? 'La exposición cumple el reto. Hay varias combinaciones de velocidad, apertura e ISO que pueden conseguirlo.'
        : exposure > 0
          ? 'La foto queda aproximadamente ' + stopText(exposure) + ' pasos sobreexpuesta. Baja el ISO, acelera el obturador o cierra la apertura, conservando el objetivo del reto.'
          : 'La foto queda aproximadamente ' + stopText(exposure) + ' pasos subexpuesta. Sube el ISO o abre la apertura si el reto lo permite. Baja la velocidad solo sin perder la nitidez requerida.'
    }, {
      kind: 'motion',
      ok: shutterOk,
      title: shutterOk ? 'Velocidad suficiente' : 'Riesgo de movimiento',
      text: shutterOk
        ? '1/' + shutter + ' s cumple la velocidad mínima de este reto. Puedes compensar los cambios de velocidad con apertura o ISO.'
        : 'Usa 1/' + scene.minShutter + ' s o más rápido para ' + (scene.minShutter >= 1000 ? 'congelar la acción.' : 'mantener nítidos a los sujetos.') + ' Compensa la pérdida de luz con apertura o ISO.'
    }, {
      kind: 'depth',
      ok: depthOk,
      title: depthOk ? 'Apertura adecuada al objetivo' : scene.minAperture ? 'Falta profundidad de campo' : 'Fondo demasiado definido',
      text: scene.minAperture
        ? (depthOk ? 'La apertura ayuda a mantener ambas filas nítidas.' : 'Cierra a ' + fText(scene.minAperture) + ' o más para cubrir las dos filas; compensa la luz con ISO o velocidad dentro del reto.') + ' En una cámara real también influyen la distancia, la focal y el punto de enfoque.'
        : (depthOk ? 'La apertura cumple el objetivo de separar al sujeto del fondo.' : 'Abre a ' + fText(scene.maxAperture) + ' o más para suavizar el fondo y ajusta la exposición.') + ' El desenfoque mostrado es orientativo; en una cámara real también depende de la focal y las distancias.'
    }, {
      kind: 'noise',
      ok: iso <= scene.preferredISO,
      title: iso <= scene.preferredISO ? 'ISO dentro de la referencia' : 'Atención al ruido',
      text: (iso <= scene.preferredISO
        ? 'El ISO ' + iso + ' está dentro de la referencia de esta escena.'
        : 'El ISO ' + iso + ' puede aumentar el ruido. Redúcelo solo si puedes conservar exposición, velocidad y apertura del reto.') + ' Es una simulación orientativa: el ruido real depende de la cámara y la luz. El ISO no resta puntos por sí solo.'
    }];

    return {
      sceneId: scene.id,
      settings: { shutter: shutter, aperture: aperture, iso: iso },
      score: score,
      passed: passed,
      cameraEV: cameraEV,
      exposure: exposure,
      exposureOk: exposureOk,
      shutterOk: shutterOk,
      depthOk: depthOk,
      brightness: brightness,
      motionBlur: motionBlur,
      depthMiss: depthMiss,
      noise: noise,
      feedback: feedback
    };
  }

  return Object.freeze({ SHUTTERS: SHUTTERS, APERTURES: APERTURES, ISOS: ISOS, SCENES: SCENES, evaluate: evaluate });
}));
