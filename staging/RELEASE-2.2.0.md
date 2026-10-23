# TSI 2.2.0 · entrenamiento y podio

Versión de revisión: `2.2.0-staging`. Se publica únicamente en `/staging/`; la página y los recursos vigentes de producción permanecen sin cambios.

- Reto fotográfico: 20 encargos con objetivos visuales, sin recetas de cámara.
- Reto de edición: 16 encargos de luz, color y encuadre, con varias soluciones válidas.
- 16 imágenes sintéticas compartidas, incluidas 8 escenas nuevas de atletismo, tenis, voleibol, ciclismo, natación, béisbol, fútbol y retrato.
- Podio del equipo con clasificación general, cámara y edición, puesto propio y empates.

## Cómo participar

Iniciar sesión en pruebas con una cuenta de administración, fotografía o edición y abrir **Menú → Entrenamiento**. Ambos juegos incluyen un botón para abrir el podio.

El ranking suma la mejor puntuación confirmada de cada reto, con un máximo de 2,000 puntos en cámara y 1,600 en edición. Repetir no suma intentos: solo puede mejorar la marca del reto. Los puntos iguales comparten puesto; el orden visual de un empate es estable. El ranking empieza con los resultados enviados desde esta versión, sin importar puntuaciones de práctica antiguas que no conservan los ajustes originales.

Los juegos siguen disponibles si falla el envío. El intento se identifica como práctica hasta recibir confirmación y puede reenviarse. El progreso de práctica se guarda por cuenta en el navegador; el podio compartido consulta resultados guardados en el servidor de pruebas. No escribe en partidos, pagos, disponibilidad, clientes ni fotografías operativas.

## Imágenes y verificación

Las personas son adultos ficticios. Archivos, procedencia y prompts de generación: [photo-game-scenes/README.md](photo-game-scenes/README.md).

Pruebas del catálogo, puntuación, renderizador, navegación, aislamiento por cuenta, envíos y podio: `npm run test:photo-game`, `npm run test:editing-game` y `npm run test:game-ranking`. Revisión visual en escritorio, móvil y modo noche.
