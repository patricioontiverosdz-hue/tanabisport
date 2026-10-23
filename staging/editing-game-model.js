(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TSIEditingGameModel = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTROLS = Object.freeze([
    { key: 'exposure', label: 'Exposición', min: -3, max: 3, step: 0.1 },
    { key: 'temperature', label: 'Temperatura', min: -100, max: 100, step: 5 },
    { key: 'highlights', label: 'Luces', min: -100, max: 100, step: 5 },
    { key: 'shadows', label: 'Sombras', min: -100, max: 100, step: 5 },
    { key: 'contrast', label: 'Contraste', min: -50, max: 50, step: 5 },
    { key: 'saturation', label: 'Saturación', min: -70, max: 70, step: 5 }
  ].map(Object.freeze));
  const CROPS = Object.freeze(['original', 'landscape', 'square', 'portrait']);
  const DEFAULTS = Object.freeze({ exposure: 0, temperature: 0, highlights: 0, shadows: 0,
    contrast: 0, saturation: 0, crop: 'original', panX: 0, panY: 0 });

  function base(values) {
    const result = {};
    CONTROLS.forEach(function (control) { result[control.key] = values[control.key] || 0; });
    return Object.freeze(result);
  }

  // These clean synthetic JPEGs are shared with the camera game. The initial
  // defects are applied to the clean source rather than destructively baked in.
  // Subject rectangles were inspected against every asset and include the ball,
  // hands and head. A crop must keep the whole rectangle, not just its center.
  const SCENES = Object.freeze([
    {
      id: 'night-detail', title: 'Detalle bajo reflectores', subtitle: 'La carrera continúa de noche',
      goal: 'Haz que el rostro, el balón y el uniforme se distingan con naturalidad, conservando la atmósfera nocturna.',
      asset: 'night-action.jpg',
      imageAlt: 'Atleta de flag football con balón y uniforme rojo corriendo bajo los reflectores de una cancha nocturna.',
      base: base({ exposure: -1, shadows: -35, temperature: 10 }),
      subject: { x: 0.277, y: 0.14, width: 0.369, height: 0.745 }
    },
    {
      id: 'warm-cast', title: 'Color en el pabellón', subtitle: 'La piel y el uniforme bajo las luces',
      goal: 'Consigue piel, uniforme y cancha de colores creíbles, con el jugador y el balón claramente reconocibles.',
      asset: 'indoor-basketball.jpg',
      imageAlt: 'Jugador de baloncesto con uniforme verde saltando hacia la canasta con un balón en la mano.',
      base: base({ temperature: 55, exposure: -0.3, saturation: 10 }),
      subject: { x: 0.345, y: 0.037, width: 0.264, height: 0.87 }
    },
    {
      id: 'bright-detail', title: 'Todos los rostros cuentan', subtitle: 'Un retrato de equipo con detalle',
      goal: 'Conserva los gestos y la textura de la ropa de todo el equipo, con una apariencia natural y sin zonas deslavadas.',
      asset: 'team-portrait.jpg',
      imageAlt: 'Equipo adulto de flag football con uniformes azules posando en dos filas sobre una cancha.',
      base: base({ highlights: 55, exposure: 0.6 }),
      subject: { x: 0.08, y: 0.002, width: 0.855, height: 0.998 }
    },
    {
      id: 'backlight', title: 'El gesto al atardecer', subtitle: 'El retrato y su luz dorada',
      goal: 'Muestra el rostro y las texturas de la jugadora sin perder el brillo del atardecer ni la calidez de la escena.',
      asset: 'golden-hour-portrait.jpg',
      imageAlt: 'Jugadora con uniforme azul sosteniendo un balón frente a una cancha iluminada por el atardecer.',
      base: base({ shadows: -45, highlights: 40, exposure: -0.3, temperature: 20 }),
      subject: { x: 0.186, y: 0.006, width: 0.4, height: 0.994 }
    },
    {
      id: 'natural-colors', title: 'Color con identidad', subtitle: 'La jugada a pleno sol',
      goal: 'Logra colores naturales en la piel, el césped y el uniforme, con volumen y detalle en la atleta y el balón.',
      asset: 'daylight-action.jpg',
      imageAlt: 'Atleta de flag football con uniforme turquesa corriendo con el balón a plena luz del día.',
      base: base({ saturation: 60, contrast: 20, temperature: -10 }),
      subject: { x: 0.352, y: 0.015, width: 0.295, height: 0.87 }
    },
    {
      id: 'rain-balance', title: 'Textura bajo la lluvia', subtitle: 'El agua también cuenta la historia',
      goal: 'Conserva el rostro reconocible, las gotas brillantes y la textura del uniforme, con color creíble y ambiente de noche.',
      asset: 'rainy-action.jpg',
      imageAlt: 'Atleta con uniforme morado corriendo con un balón bajo la lluvia en una cancha nocturna.',
      base: base({ temperature: -45, contrast: 35, shadows: -25, exposure: -0.3 }),
      subject: { x: 0.23, y: 0.05, width: 0.325, height: 0.875 }
    },
    {
      id: 'vertical-action', title: 'Una recepción para portada', subtitle: 'La fuerza del salto',
      goal: 'Entrega una composición vertical que conserve al receptor completo y el balón, con detalle y colores naturales.',
      asset: 'aerial-catch.jpg',
      imageAlt: 'Receptor de flag football saltando para alcanzar un balón con las manos en una cancha soleada.',
      base: base({ exposure: -0.2, saturation: 10 }),
      subject: { x: 0.385, y: 0.015, width: 0.25, height: 0.76 },
      cropGoal: Object.freeze(['portrait'])
    },
    {
      id: 'flat-action', title: 'La atajada cobra fuerza', subtitle: 'Volumen en un instante decisivo',
      goal: 'Da presencia y volumen al portero sin perder detalle en los guantes, la ropa y el balón, con colores creíbles.',
      asset: 'goalkeeper-save.jpg',
      imageAlt: 'Portero de fútbol con uniforme amarillo estirándose en el aire para detener un balón con sus guantes.',
      base: base({ contrast: -35, exposure: 0.4, saturation: -20 }),
      subject: { x: 0.058, y: 0.125, width: 0.885, height: 0.66 }
    }
  ].map(function (scene) {
    Object.freeze(scene.subject);
    return Object.freeze(scene);
  }));

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function resolveScene(scene) {
    const id = typeof scene === 'string' ? scene : scene && scene.id;
    const result = SCENES.find(function (candidate) { return candidate.id === id; });
    if (!result) throw new RangeError('Elige un reto válido de edición.');
    return result;
  }
  function validateNumber(value, key, min, max, step) {
    const steps = (value - min) / step;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max ||
        Math.abs(steps - Math.round(steps)) > 1e-7) {
      throw new RangeError('El ajuste de ' + key + ' está fuera de las opciones de edición.');
    }
    return value;
  }
  function validatePan(value, key) { return validateNumber(value, key, -100, 100, 5); }
  function validateCrop(crop) {
    if (CROPS.indexOf(crop) === -1) throw new RangeError('Selecciona un encuadre válido.');
    return crop;
  }
  function validatedSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new TypeError('Selecciona los ajustes de edición.');
    }
    const result = {};
    CONTROLS.forEach(function (control) {
      result[control.key] = validateNumber(settings[control.key], control.key, control.min, control.max, control.step);
    });
    result.crop = validateCrop(settings.crop);
    result.panX = validatePan(settings.panX, 'panX');
    result.panY = validatePan(settings.panY, 'panY');
    return result;
  }

  function effective(scene, settings) {
    scene = resolveScene(scene);
    const result = validatedSettings(settings);
    CONTROLS.forEach(function (control) {
      // Authored defects and a player's correction are independent. The render
      // range includes both, so resetting really displays the initial defect.
      result[control.key] = clamp(scene.base[control.key] + result[control.key], control.min * 2, control.max * 2);
    });
    return result;
  }

  function cropRect(width, height, crop, panX, panY) {
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) ||
        !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError('La imagen debe tener dimensiones válidas.');
    }
    crop = validateCrop(crop);
    panX = validatePan(panX === undefined ? 0 : panX, 'panX');
    panY = validatePan(panY === undefined ? 0 : panY, 'panY');
    const ratio = crop === 'original' ? width / height : crop === 'landscape' ? 3 / 2 : crop === 'square' ? 1 : 4 / 5;
    const cropWidth = Math.min(width, height * ratio);
    const cropHeight = Math.min(height, width / ratio);
    return {
      x: (width - cropWidth) * (panX + 100) / 200,
      y: (height - cropHeight) * (panY + 100) / 200,
      width: cropWidth,
      height: cropHeight
    };
  }

  // This is a transparent teaching approximation. It scores authored intervals
  // for the same effects used by the renderer and a verified subject rectangle.
  // It does not inspect image content with AI or decide whether an edit is art.
  // Each inner interval earns full credit; the wider interval is acceptable.
  const CRITERIA = Object.freeze([
    { key: 'exposure', kind: 'light', weight: 22, full: [-0.2, 0.2], acceptable: [-0.55, 0.55], distance: 2 },
    { key: 'temperature', kind: 'color', weight: 15, full: [-15, 15], acceptable: [-30, 30], distance: 80 },
    { key: 'highlights', kind: 'highlights', weight: 14, full: [-15, 15], acceptable: [-35, 35], distance: 80 },
    { key: 'shadows', kind: 'shadows', weight: 14, full: [-15, 15], acceptable: [-30, 30], distance: 80 },
    { key: 'contrast', kind: 'contrast', weight: 10, full: [-10, 15], acceptable: [-25, 30], distance: 55 },
    { key: 'saturation', kind: 'saturation', weight: 15, full: [-15, 15], acceptable: [-30, 30], distance: 75 }
  ]);

  function between(value, interval) { return value >= interval[0] - 1e-8 && value <= interval[1] + 1e-8; }
  function visualFeedback(kind, value, ok) {
    const positive = value > 0;
    const words = {
      light: ok ? ['Luz con detalle', 'El sujeto se distingue y la escena conserva su ambiente.']
        : positive ? ['Zonas deslavadas', 'La luminosidad oculta textura y debilita el ambiente de la escena.']
          : ['Detalle oculto', 'El sujeto se pierde en la oscuridad y cuesta reconocer sus detalles.'],
      color: ok ? ['Color creíble', 'La piel, la ropa y el entorno mantienen colores naturales para esta escena.']
        : positive ? ['Dominante cálida', 'Un tono anaranjado invade la piel, la ropa y el entorno.']
          : ['Dominante fría', 'Un tono azulado invade la piel, la ropa y el entorno.'],
      highlights: ok ? ['Zonas claras con textura', 'Las áreas luminosas conservan diferencias de tono y detalle.']
        : positive ? ['Blancos sin textura', 'Las áreas más luminosas parecen planas y sus detalles se confunden.']
          : ['Brillos apagados', 'Las áreas luminosas tienen un aspecto gris y la luz pierde presencia.'],
      shadows: ok ? ['Zonas oscuras legibles', 'La ropa y las zonas de sombra conservan profundidad y detalle.']
        : positive ? ['Negros deslavados', 'Las zonas oscuras parecen grises y el sujeto pierde profundidad.']
          : ['Sombras sin detalle', 'Las partes oscuras de la ropa y el rostro ocultan su textura.'],
      contrast: ok ? ['Volumen natural', 'El sujeto tiene presencia sin contornos duros ni textura perdida.']
        : positive ? ['Contornos demasiado duros', 'La separación entre claros y oscuros oculta matices y textura.']
          : ['Aspecto plano', 'El sujeto y el entorno pierden volumen y sus tonos se confunden.'],
      saturation: ok ? ['Colores con textura', 'Los colores conservan fuerza y matices creíbles.']
        : positive ? ['Colores artificiales', 'El color domina la imagen y oculta matices de la piel y el uniforme.']
          : ['Color desvanecido', 'La piel, la ropa y el entorno pierden identidad y matices de color.']
    };
    return { kind: kind, title: words[kind][0], text: words[kind][1], ok: ok };
  }

  function evaluate(scene, settings) {
    scene = resolveScene(scene);
    const result = effective(scene, settings);
    let score = 100;
    const feedback = CRITERIA.map(function (criterion) {
      const value = result[criterion.key];
      // Night assets are correctly exposed sources: added light is judged
      // relative to that photograph, never against a daytime brightness target.
      const distance = Math.max(criterion.full[0] - value, value - criterion.full[1], 0);
      score -= criterion.weight * clamp(distance / criterion.distance, 0, 1);
      return visualFeedback(criterion.kind, value, between(value, criterion.acceptable));
    });

    // All reused source JPEGs have the same 1400 x 788 dimensions. Compute the
    // actual pixel crop to keep evaluation identical to canvas rendering.
    const rect = cropRect(1400, 788, result.crop, result.panX, result.panY);
    const subject = scene.subject;
    const epsilon = 1e-8;
    const containsSubject = rect.x / 1400 <= subject.x + epsilon &&
      rect.y / 788 <= subject.y + epsilon &&
      (rect.x + rect.width) / 1400 + epsilon >= subject.x + subject.width &&
      (rect.y + rect.height) / 788 + epsilon >= subject.y + subject.height;
    const formatOk = !scene.cropGoal || scene.cropGoal.indexOf(result.crop) !== -1;
    const cropOk = containsSubject && formatOk;
    if (!containsSubject) score -= 35;
    if (!formatOk) score -= 20;
    feedback.push({
      kind: 'crop', ok: cropOk,
      title: !containsSubject ? 'La historia queda cortada' : !formatOk ? 'Formato pendiente' : 'Encuadre completo',
      text: !containsSubject ? 'Parte del protagonista, del balón o del equipo queda fuera de la composición.'
        : !formatOk ? 'La forma de la entrega todavía no corresponde al objetivo visual.'
          : 'El encuadre conserva al protagonista y los elementos esenciales de la jugada.'
    });
    score = Math.round(clamp(score, 0, 100));
    return { score: score, passed: score >= 85 && feedback.every(function (item) { return item.ok; }),
      feedback: feedback, effective: result };
  }

  return Object.freeze({ CONTROLS: CONTROLS, CROPS: CROPS, DEFAULTS: DEFAULTS,
    SCENES: SCENES, effective: effective, cropRect: cropRect, evaluate: evaluate });
}));
