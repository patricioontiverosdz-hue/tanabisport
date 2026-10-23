# Escenas del juego de fotografía (staging)

Estas cuatro imágenes son sintéticas y fueron generadas con IA con `image_gen` integrado para el prototipo de entrenamiento de Tanabi. Las personas son personajes adultos ficticios. No representan sesiones, equipos ni clientes reales.

Las imágenes base tienen exposición y enfoque intencionalmente correctos. El juego aplica por separado efectos pedagógicos de exposición, movimiento y ruido; esos efectos son aproximaciones visuales y no simulan físicamente una cámara o lente específico.

## Archivos

| Archivo | Escena | Dimensiones | Peso |
| --- | --- | --- | --- |
| daylight-action.jpg | Acción de día | 1400 × 788 | 197,462 bytes |
| night-action.jpg | Acción bajo reflectores | 1400 × 788 | 143,982 bytes |
| team-portrait.jpg | Retrato de equipo nublado | 1400 × 788 | 193,595 bytes |
| golden-hour-portrait.jpg | Retrato a la hora dorada | 1400 × 788 | 112,159 bytes |

Exportación: JPEG, calidad 84; reducción proporcional con System.Drawing. Los originales de generación se conservaron. Se revisaron visualmente las cuatro escenas con `view_image`.

## Prompts finales

### daylight-action

Use case: photorealistic-natural. Asset type: horizontal base photo for a camera exposure training game. Primary request: an entirely fictional adult woman flag football athlete running fast toward the sideline while carrying an American football tightly, on a green outdoor field in bright daylight. She wears a plain teal sports jersey, plain black athletic pants and visible fabric flag belt, no helmet. Composition: horizontal landscape 16:9, whole athlete and ball visible, low sidelines sports photo, generous green field visible, other distant fictional adult players soft in background. Lighting: clear sunny midday, realistic natural shadows, correctly balanced exposure, no clipped highlights. The main athlete, eyes, ball, hands, and flag are tack sharp as if captured with a fast shutter. Professional realistic sports photo, natural anatomy and texture. No text, letters, numbers, brands, logos, watermarks, borders, graphics or camera UI. Do not simulate motion blur, grain, overexposure, underexposure or lens errors; this is the clean source photo.

### night-action

Use case: photorealistic-natural. Asset type: horizontal clean base photograph for a camera exposure training game. Primary request: an entirely fictional adult male flag football athlete running fast with an American football held tightly on an outdoor green sports field at night under stadium floodlights. He wears a plain red short-sleeve sports jersey, plain dark athletic pants and visible flag belt, no helmet. Composition: horizontal landscape 16:9, whole athlete and ball visible, side view from field sideline; distant adult players softly visible, floodlight towers and dark sky clearly establish night. Lighting: realistic stadium floodlights with correctly exposed athlete, natural contrast, balanced detail in face and clothing. Athlete, hands, face, ball and flags perfectly sharp, frozen motion. Natural realistic sports photography. No text, letters, numbers, brands, logos, watermarks, borders, camera controls or graphics. No artificial blur on the athlete, no noise, no bad exposure, no cinematic teal-orange filter; this is the correctly captured source image.

### team-portrait

Use case: photorealistic-natural. Asset type: horizontal clean base photograph for camera training game. Primary request: posed group portrait of an entirely fictional mixed-gender adult flag football team, ten adults arranged in two compact rows, front row kneeling and back row standing, on a green flag football field during overcast daytime. Plain matching navy sports jerseys, flag belts visible, no helmets, friendly natural expressions. Composition: horizontal landscape 16:9, entire group and all heads visible, straight-on eye-level team photograph; uncluttered distant field and soft gray sky. Lighting: soft cloudy-day light, correctly balanced exposure and white balance. ALL faces in BOTH rows tack sharp with sufficient depth of field, realistic skin and natural anatomy, professional documentary sports portrait. No text, numbers, letters, logos, brand markings, watermarks, borders, camera UI or graphics. No fake blur on group, grain or exposure defects; clean correctly captured source.

### golden-hour-portrait

Use case: photorealistic-natural. Asset type: horizontal clean base photograph for camera training game. Primary request: natural sports portrait of an entirely fictional adult woman flag football athlete holding an American football at her waist, standing on an outdoor field in warm golden hour light shortly before sunset. Plain deep blue athletic jersey, plain flag belt, no helmet. Composition: horizontal landscape 16:9, waist-up environmental portrait, athlete naturally slightly off center with field visible. Face, eyes, hands and football sharply focused; distant field and trees have attractive natural shallow depth of field background bokeh. Lighting: warm golden sunlight gently edging hair and soft correctly exposed face, believable skin colors, highlights retain detail. Photorealistic professional portrait, natural anatomy. No text, letters, numbers, logos, brands, watermarks, borders, camera UI or graphics. No grain, blown highlights, underexposure or facial blur; clean correctly captured source image.

## Ampliación de retos (23 de octubre de 2026)

Se añadieron cuatro escenas sintéticas con `image_gen` integrado, protagonizadas por personajes adultos ficticios. Se conservaron los cuatro archivos y los prompts originales. Cada escena nueva se revisó visualmente con `view_image` antes de exportarla a JPEG calidad 84, con reducción proporcional mediante System.Drawing; los originales PNG se conservaron en el directorio de generación de Codex.

| Archivo | Escena | Dimensiones | Peso |
| --- | --- | --- | --- |
| aerial-catch.jpg | Recepción en salto de día | 1400 × 788 | 161,127 bytes |
| goalkeeper-save.jpg | Atajada al atardecer | 1400 × 788 | 207,151 bytes |
| rainy-action.jpg | Acción nocturna bajo la lluvia | 1400 × 788 | 302,281 bytes |
| indoor-basketball.jpg | Entrada a canasta en interior | 1400 × 788 | 178,684 bytes |

Estas imágenes amplían las situaciones visuales disponibles en pruebas. Las escenas base muestran el resultado fotográfico buscado; los efectos aplicados por el juego siguen siendo aproximaciones pedagógicas.

### Prompts finales de la ampliación

#### aerial-catch

Use case: photorealistic-natural. Asset type: horizontal clean base photograph for camera exposure training game. Primary request: entirely fictional adult male flag football receiver leaping high in the air catching an American football with both hands at the peak of the jump on a green outdoor sports field in clear bright daylight. Plain white sports jersey, dark shorts and visible fabric flag belt, no helmet. Composition: horizontal 16:9, full body and ball visible, sideline viewpoint, field and clear blue sky visible, distant adult players in background. Lighting: sunny midday, realistic shadows, balanced correct exposure, no clipped highlights. Main athlete, eyes, fingers and football tack sharp, action frozen. Realistic sports photography, natural anatomy and clothing. No text, letters, numbers, logos, brands, watermarks, borders or UI. No motion blur, noise, exposure defects or artificial effects; clean correctly captured source.

#### goalkeeper-save

Use case: photorealistic-natural. Asset type: horizontal clean base photograph for camera exposure training game. Primary request: an entirely fictional adult soccer goalkeeper diving sideways fully stretched to save a soccer ball with both gloved hands, goalposts and net clearly visible behind him on an outdoor green soccer field. Plain bright yellow long sleeve jersey and black shorts, no letters or numbers. Composition: horizontal 16:9, entire keeper, ball and visible part of the goal in frame, sports sideline perspective, believable ball contact with gloves. Lighting: bright late afternoon side sunlight with a warm edge, still ample daylight, balanced correct exposure, detail in highlights and shadows. Athlete, hands, ball and net tack sharp, frozen action. Photorealistic sports photography, natural anatomy. No text, letters, numbers, logos, brands, watermarks, borders, UI, artificial motion blur, noise or exposure defects; clean correctly captured source.

#### rainy-action

Use case: photorealistic-natural. Asset type: horizontal clean base photograph for camera exposure training game. Primary request: an entirely fictional adult woman flag football athlete running with an American football cradled securely during heavy rain at night on a wet outdoor green field lit by stadium floodlights. Plain purple athletic jersey, dark athletic pants, fabric flag belt visible, no helmet. Composition: horizontal 16:9, full athlete and ball visible from sideline, rain droplets sparkling in floodlights, wet turf reflections, floodlights and dark sky visible. Lighting: bright realistic stadium illumination, correctly exposed detailed face and clothing, highlights preserved. Main athlete, face, football, hands, and nearby raindrops tack sharp, frozen action. Photorealistic sports photography, natural anatomy. No text, letters, numbers, logos, brands, watermarks, borders or UI. No artificial motion blur, noise or exposure defects; clean correctly captured source.

#### indoor-basketball

Use case: photorealistic-natural. Asset type: horizontal clean base photograph for camera exposure training game. Primary request: an entirely fictional adult male basketball player jumping toward the hoop for a layup shot with a basketball held in one raised hand, indoors on a polished wooden basketball court. Plain green basketball jersey and shorts with no numbers or markings. Composition: horizontal 16:9, full athlete, basketball and hoop visible with realistic proportions, court level sports perspective, illuminated indoor arena ceiling and basketball court environment establish location, distant fictional adult players. Lighting: evenly bright indoor sports arena lights, balanced correct exposure, natural skin and wood colors. Player, ball, hands and hoop tack sharp, action frozen. Photorealistic sports photography, natural anatomy. No text, letters, numbers, logos, brands, watermark, borders or camera UI. No motion blur, noise, overexposure or underexposure; clean correctly captured source.


