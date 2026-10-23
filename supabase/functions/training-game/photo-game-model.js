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
      goal: 'Captura la carrera con la jugadora y el balón bien definidos, luz equilibrada y el fondo en segundo plano.',
      lighting: 'Sol de día',
      ev: 14,
      asset: 'daylight-action.jpg',
      imageAlt: 'Jugadora de flag football corriendo con el balón en una cancha soleada.',
      minShutter: 1000,
      maxAperture: 5.6,
      preferredISO: 400
    },
    {
      id: 'night-action',
      title: 'Partido bajo reflectores',
      subtitle: 'Una carrera en la cancha nocturna',
      goal: 'Captura al corredor nítido y destacado frente al fondo, sin perder detalle en su rostro ni en el uniforme.',
      lighting: 'Cancha nocturna',
      ev: 8,
      asset: 'night-action.jpg',
      imageAlt: 'Jugador de flag football corriendo con el balón bajo los reflectores de una cancha nocturna.',
      minShutter: 1000,
      maxAperture: 4,
      preferredISO: 6400
    },
    {
      id: 'team-portrait',
      title: 'Retrato de equipo',
      subtitle: 'Cada rostro cuenta',
      goal: 'Consigue que todos los rostros de las dos filas se vean nítidos y conserven detalle, con luz equilibrada.',
      lighting: 'Luz de día suave',
      ev: 12,
      asset: 'team-portrait.jpg',
      imageAlt: 'Equipo de flag football posando en dos filas para una fotografía de grupo.',
      minShutter: 125,
      minAperture: 8,
      preferredISO: 800,
      depthSubject: 'group'
    },
    {
      id: 'golden-hour-portrait',
      title: 'Retrato al atardecer',
      subtitle: 'El protagonista y un fondo suave',
      goal: 'Destaca a la jugadora con el rostro nítido, luz equilibrada y un fondo suave que acompañe el retrato.',
      lighting: 'Atardecer',
      ev: 10,
      asset: 'golden-hour-portrait.jpg',
      imageAlt: 'Retrato de una jugadora de flag football con el balón al atardecer y la cancha al fondo.',
      minShutter: 125,
      maxAperture: 2.8,
      preferredISO: 800
    },
    {
      id: 'aerial-catch',
      title: 'Recepción en el aire',
      subtitle: 'El balón llega en pleno salto',
      goal: 'Detén el instante de la recepción con manos, balón y rostro definidos, luz equilibrada y el receptor destacado.',
      lighting: 'Cancha soleada',
      ev: 14,
      asset: 'aerial-catch.jpg',
      imageAlt: 'Receptor de flag football saltando para atrapar un balón durante un partido soleado.',
      minShutter: 2000,
      maxAperture: 4,
      preferredISO: 800
    },
    {
      id: 'goalkeeper-save',
      title: 'La atajada decisiva',
      subtitle: 'Una estirada que cambia el partido',
      goal: 'Captura al portero y el balón nítidos en el aire, con detalle en los guantes y el fondo en segundo plano.',
      lighting: 'Cancha al atardecer',
      ev: 11,
      asset: 'goalkeeper-save.jpg',
      imageAlt: 'Portero de fútbol lanzándose para detener un balón en una cancha al atardecer.',
      minShutter: 1000,
      maxAperture: 5.6,
      preferredISO: 3200
    },
    {
      id: 'rainy-action',
      title: 'Acción bajo la lluvia',
      subtitle: 'Gotas y movimiento bajo las luces',
      goal: 'Muestra al atleta y las gotas detenidos, con el rostro reconocible, luz equilibrada y el fondo en segundo plano.',
      lighting: 'Lluvia bajo reflectores',
      ev: 8,
      asset: 'rainy-action.jpg',
      imageAlt: 'Atleta de flag football en acción bajo la lluvia y los reflectores de una cancha nocturna.',
      minShutter: 1000,
      maxAperture: 4,
      preferredISO: 6400
    },
    {
      id: 'indoor-basketball',
      title: 'Salto hacia la canasta',
      subtitle: 'La jugada culmina en el pabellón',
      goal: 'Captura el salto con el jugador y el balón definidos, detalle en el uniforme y el público en segundo plano.',
      lighting: 'Iluminación de pabellón',
      ev: 9,
      asset: 'indoor-basketball.jpg',
      imageAlt: 'Jugador de baloncesto saltando con el balón hacia la canasta en un pabellón deportivo.',
      minShutter: 1000,
      maxAperture: 4,
      preferredISO: 6400
    },
    {
      id: 'daylight-context',
      title: 'La jugada completa',
      subtitle: 'La protagonista y quienes la acompañan',
      goal: 'Cuenta la jugada con la corredora nítida y sus compañeras reconocibles, conservando detalle en la cancha y luz equilibrada.',
      lighting: 'Sol de día',
      ev: 14,
      asset: 'daylight-action.jpg',
      imageAlt: 'Corredora de flag football con varias jugadoras a diferentes distancias en una cancha soleada.',
      minShutter: 1000,
      minAperture: 8,
      preferredISO: 1600,
      depthSubject: 'scene'
    },
    {
      id: 'night-context',
      title: 'El equipo entra en escena',
      subtitle: 'Una historia más amplia bajo reflectores',
      goal: 'Muestra la carrera nítida y conserva reconocibles a los jugadores que la acompañan, sin que la imagen quede oscura.',
      lighting: 'Cancha nocturna',
      ev: 8,
      asset: 'night-action.jpg',
      imageAlt: 'Corredor de flag football y otros jugadores repartidos por una cancha nocturna bajo reflectores.',
      minShutter: 1000,
      minAperture: 4,
      preferredISO: 12800,
      depthSubject: 'scene'
    },
    {
      id: 'team-detail',
      title: 'Los rostros de primera fila',
      subtitle: 'Un retrato dentro del retrato de equipo',
      goal: 'Da protagonismo a los rostros de la primera fila, nítidos y bien iluminados, con el resto del equipo en un segundo plano suave.',
      lighting: 'Luz de día suave',
      ev: 12,
      asset: 'team-portrait.jpg',
      imageAlt: 'Equipo de flag football en dos filas, con varios rostros y el balón en primer plano.',
      minShutter: 125,
      maxAperture: 4,
      preferredISO: 400
    },
    {
      id: 'golden-hour-detail',
      title: 'Detalles en luz dorada',
      subtitle: 'El gesto, el uniforme y el balón',
      goal: 'Conserva definidos el gesto y las texturas del uniforme y el balón, con luz equilibrada y un fondo suave que acompañe la atmósfera cálida.',
      lighting: 'Atardecer',
      ev: 10,
      asset: 'golden-hour-portrait.jpg',
      imageAlt: 'Jugadora de flag football sosteniendo el balón con la cancha y el sol del atardecer detrás.',
      minShutter: 125,
      maxAperture: 5.6,
      preferredISO: 800
    },
    {
      id: 'track-finish',
      title: 'El último impulso',
      subtitle: 'La carrera se decide en la meta',
      goal: 'Conserva definidos el rostro, las manos y la zancada del atleta, con detalle en el uniforme y la pista en segundo plano.',
      lighting: 'Pista al sol',
      ev: 14,
      asset: 'track-finish.jpg',
      imageAlt: 'Atleta adulto en pleno sprint hacia la meta sobre una pista de atletismo iluminada por el sol.',
      minShutter: 2000,
      maxAperture: 5.6,
      preferredISO: 400
    },
    {
      id: 'tennis-serve',
      title: 'La fuerza del saque',
      subtitle: 'Raqueta y pelota en el aire',
      goal: 'Muestra al tenista, la raqueta y la pelota bien definidos, con luz equilibrada y el fondo acompañando la acción.',
      lighting: 'Cancha exterior soleada',
      ev: 14,
      asset: 'tennis-serve.jpg',
      imageAlt: 'Tenista adulto ejecutando un saque con la raqueta y la pelota visibles en una cancha exterior soleada.',
      minShutter: 2000,
      maxAperture: 4,
      preferredISO: 800
    },
    {
      id: 'volleyball-block',
      title: 'Un muro en la red',
      subtitle: 'El salto decide el punto',
      goal: 'Detén el salto con manos, rostros y balón reconocibles, detalle en los uniformes y el pabellón en segundo plano.',
      lighting: 'Pabellón deportivo',
      ev: 9,
      asset: 'volleyball-block.jpg',
      imageAlt: 'Jugadores adultos de voleibol saltando junto a la red para bloquear un balón en un pabellón deportivo.',
      minShutter: 1000,
      maxAperture: 5.6,
      preferredISO: 6400
    },
    {
      id: 'cycling-sprint',
      title: 'Sprint sobre ruedas',
      subtitle: 'La recta final bajo el sol',
      goal: 'Captura al ciclista y su bicicleta definidos, con detalle en el rostro y el uniforme y un fondo que acompañe la carrera.',
      lighting: 'Ruta a pleno sol',
      ev: 15,
      asset: 'cycling-sprint.jpg',
      imageAlt: 'Ciclista adulto en pleno sprint sobre una bicicleta de ruta bajo la luz del sol.',
      minShutter: 2000,
      maxAperture: 5.6,
      preferredISO: 400
    },
    {
      id: 'swimming-race',
      title: 'Una brazada decisiva',
      subtitle: 'Agua y esfuerzo en la alberca',
      goal: 'Muestra el rostro, el brazo y las salpicaduras definidos, con textura en el agua y luz equilibrada sobre el nadador.',
      lighting: 'Alberca cubierta',
      ev: 10,
      asset: 'swimming-race.jpg',
      imageAlt: 'Nadador adulto compitiendo con el rostro, un brazo y salpicaduras visibles en una alberca cubierta.',
      minShutter: 1000,
      maxAperture: 5.6,
      preferredISO: 3200
    },
    {
      id: 'baseball-swing',
      title: 'El instante del bateo',
      subtitle: 'La pelota encuentra el bate',
      goal: 'Conserva definidos al bateador, el bate y la pelota, con detalle en la ropa y el estadio en un segundo plano suave.',
      lighting: 'Estadio por la tarde',
      ev: 12,
      asset: 'baseball-swing.jpg',
      imageAlt: 'Beisbolista adulto realizando un swing con el bate y la pelota visibles en un estadio durante la tarde.',
      minShutter: 2000,
      maxAperture: 5.6,
      preferredISO: 1600
    },
    {
      id: 'soccer-celebration',
      title: 'El gol se celebra en equipo',
      subtitle: 'La emoción bajo los reflectores',
      goal: 'Cuenta la celebración con los jugadores y sus gestos reconocibles, conservando detalle en los uniformes y el ambiente nocturno.',
      lighting: 'Estadio nocturno',
      ev: 8,
      asset: 'soccer-celebration.jpg',
      imageAlt: 'Jugadores adultos de fútbol celebrando juntos un gol en una cancha nocturna bajo reflectores.',
      minShutter: 500,
      minAperture: 4,
      preferredISO: 12800,
      depthSubject: 'scene'
    },
    {
      id: 'sideline-portrait',
      title: 'Una pausa junto a la cancha',
      subtitle: 'El gesto entre las jugadas',
      goal: 'Destaca el rostro del deportista con detalles naturales en la piel y el uniforme, luz equilibrada y un fondo suave.',
      lighting: 'Sombra junto a la cancha',
      ev: 11,
      asset: 'sideline-portrait.jpg',
      imageAlt: 'Retrato de un deportista adulto a la sombra junto a una cancha, con el rostro y el uniforme visibles.',
      minShutter: 125,
      maxAperture: 4,
      preferredISO: 400
    }
  ].map(function (scene) {
    return Object.freeze(scene);
  }));

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

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
      title: exposureOk ? 'Luz equilibrada' : exposure > 0 ? 'Demasiada luz' : 'Imagen oscura',
      text: exposureOk
        ? 'La imagen conserva detalle en las zonas claras y oscuras.'
        : exposure > 0
          ? 'La foto queda sobreexpuesta: las zonas claras pierden detalle.'
          : 'La foto queda subexpuesta: el sujeto y las sombras pierden detalle.'
    }, {
      kind: 'motion',
      ok: shutterOk,
      title: shutterOk ? 'Movimiento definido' : 'Sujeto borroso',
      text: shutterOk
        ? 'Los sujetos se ven definidos, sin rastros de movimiento que oculten sus detalles.'
        : 'El movimiento deja rastros y los contornos de los sujetos pierden nitidez.'
    }, {
      kind: 'depth',
      ok: depthOk,
      title: depthOk ? 'Planos acordes al objetivo' : scene.minAperture ? (scene.depthSubject === 'group' ? 'El grupo pierde nitidez' : 'Entorno poco definido') : 'Fondo demasiado definido',
      text: scene.minAperture
        ? scene.depthSubject === 'group'
          ? (depthOk ? 'Los rostros de las dos filas conservan nitidez.' : 'Parte de los rostros de las dos filas queda fuera de la zona nítida.')
          : (depthOk ? 'El sujeto y los elementos que lo rodean se reconocen en la escena.' : 'Los elementos que rodean al sujeto quedan demasiado difusos para contar la escena.')
        : (depthOk ? 'El sujeto destaca frente a un segundo plano suave.' : 'El segundo plano compite con el sujeto y distrae la atención.'),
    }, {
      kind: 'noise',
      ok: iso <= scene.preferredISO,
      title: iso <= scene.preferredISO ? 'Textura acorde a la escena' : 'Textura granulada',
      text: (iso <= scene.preferredISO
        ? 'La textura conserva el detalle esperado para esta luz.'
        : 'El grano se vuelve más visible y resta suavidad a los detalles.') + ' La textura se muestra de forma orientativa y no resta puntos por sí sola.'
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
