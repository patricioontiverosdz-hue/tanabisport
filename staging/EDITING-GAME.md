# Reto de edición · prototipo para revisión

Acceso en pruebas: `staging/?tsi_tab=edicionjuego`, o **Menú → Entrenamiento → Reto de edición**. Administración, fotógrafos y editora disponen también de un acceso desde el inicio. El reto de cámara se mantiene por separado.

Ocho encargos trabajan detalle de noche, dominante cálida, luces intensas, retrato a contraluz, colores naturales, lluvia, encuadre de un salto y recuperación de una imagen plana. Las imágenes reutilizan las ocho escenas sintéticas existentes; [archivos y prompts](photo-game-scenes/README.md).

1. Lee el objetivo visual, sin recetas ni configuraciones sugeridas.
2. Ajusta exposición, temperatura, altas luces, sombras, contraste y saturación. La vista cambia mientras mueves los controles.
3. Elige un encuadre completo, horizontal, cuadrado o vertical; puedes desplazar el recorte.
4. Alterna **Antes** y **Tu edición** sin perder ajustes. **Restablecer** vuelve al original del encargo; **Deshacer** recupera cambios anteriores.
5. Pulsa **Evaluar edición** para recibir puntuación y diagnóstico visual. Cada encargo admite distintas ediciones válidas.

Las transformaciones se calculan desde la misma imagen fuente, evitando pérdidas acumulativas al mover controles. Cada encargo representa un original con problemas simulados; no equivale al procesado de un RAW ni a una evaluación artística mediante IA. La puntuación aplica tolerancias de luz, color y encuadre. El progreso es local a este navegador y cuenta: no modifica fotografías, partidos, pagos ni otros datos operativos.

## Verificación

- `npm test` y `npm run test:photo-game` conservan los recorridos existentes y el juego de cámara.
- `npm run test:editing-game` comprueba modelo, transformaciones de píxeles y flujo DOM con perfiles y lecturas simuladas: navegación, ajustes, comparación, recorte, deshacer, evaluación, progreso por cuenta y recuperación de errores.
- Revisión visual del lienzo, respuesta de los controles y diseño móvil.
- `scripts/build-staging.py` conserva la integración exclusiva de staging. El bloque de arranque es `scripts/staging-editing-game.inc.js`.

Solo se publica en pruebas para revisar realismo, dificultad y claridad antes de autorizar producción.
