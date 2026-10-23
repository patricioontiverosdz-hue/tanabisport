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

