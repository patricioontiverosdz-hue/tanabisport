# Reto de edición · prototipo para revisión

Acceso en pruebas: `staging/?tsi_tab=edicionjuego`, o **Menú → Entrenamiento → Reto de edición**. Administración, fotógrafos y editora disponen también de un acceso desde el inicio. El reto de cámara se mantiene por separado.

Dieciséis encargos comparten el banco de dieciséis escenas sintéticas del juego de cámara. A los retos de detalle nocturno, color, luces intensas, contraluz, lluvia, encuadre y volumen se suman atletismo, tenis, voleibol, ciclismo, natación, beisbol, celebración de fútbol y retrato a la sombra. [Archivos y prompts](photo-game-scenes/README.md).

1. Lee el objetivo visual, sin recetas ni configuraciones sugeridas.
2. Ajusta exposición, temperatura, altas luces, sombras, contraste y saturación. La vista cambia mientras mueves los controles.
3. Elige un encuadre completo, horizontal, cuadrado o vertical; puedes desplazar el recorte.
4. Alterna **Antes** y **Tu edición** sin perder ajustes. **Restablecer** vuelve al original del encargo; **Deshacer** recupera cambios anteriores.
5. Pulsa **Evaluar edición** para recibir puntuación y diagnóstico visual. Cada encargo admite distintas ediciones válidas.

Las transformaciones se calculan desde la misma imagen fuente, evitando pérdidas acumulativas al mover controles. Cada encargo representa un original con problemas simulados; no equivale al procesado de un RAW ni a una evaluación artística mediante IA. La puntuación aplica tolerancias de luz, color y encuadre. Las fotografías nuevas conservan una región de seguridad que abarca la composición completa hasta revisar individualmente sus límites; sus encargos no exigen un formato recortado.

El progreso de práctica se conserva por cuenta en este navegador. El podio interno comparte los resultados guardados en staging y permite consultar la clasificación general, de cámara o de edición. Suma la mejor puntuación de cada encargo, de modo que repetir intentos no acumula puntos por sí solo; los empates comparten puesto. El servidor vuelve a evaluar el reto y sus ajustes para registrar la puntuación canónica. Los registros del ranking están separados de fotografías, partidos, pagos y demás datos operativos. Los intentos pendientes de sincronizar pueden verse primero en el progreso local.

## Verificación

- `npm test` y `npm run test:photo-game` conservan los recorridos existentes y el juego de cámara.
- `npm run test:editing-game` comprueba modelo, transformaciones de píxeles y flujo DOM con perfiles y lecturas simuladas: navegación, ajustes, comparación, recorte, deshacer, evaluación, progreso por cuenta y recuperación de errores.
- Revisión visual del lienzo, respuesta de los controles y diseño móvil.
- `scripts/build-staging.py` conserva la integración exclusiva de staging. El bloque de arranque es `scripts/staging-editing-game.inc.js`.

Solo se publica en pruebas para revisar realismo, dificultad y claridad antes de autorizar producción.
