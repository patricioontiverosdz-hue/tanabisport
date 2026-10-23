# Reto fotográfico · prototipo para revisión

Acceso: `staging/?tsi_tab=fotojuego`, o **Menú → Entrenamiento → Reto fotográfico**. Disponible en staging para administración, fotógrafos y editora. El inicio también ofrece un acceso directo.

1. Observa la escena y su objetivo.
2. Elige velocidad, apertura e ISO y pulsa **Tomar foto**.
3. Compara **Tu foto** con **Referencia**, lee el diagnóstico visual y vuelve a disparar.
4. Resuelve el objetivo sin pistas ni configuraciones sugeridas. Varias combinaciones pueden lograr 100 puntos.
5. **Cambiar escena** presenta otro reto aleatorio. Los doce retos recorren una bolsa mezclada sin repetición inmediata.

Doce retos con ocho imágenes: acción de día y de noche, fotografía de equipo, retrato al atardecer, recepción en salto, portero en acción, partido bajo lluvia y basquetbol en pabellón, además de variantes de objetivo. Son fotografías de adultos ficticios generadas previamente con la herramienta integrada de imágenes; no se genera ni se cobra una imagen por partida. Archivos y prompts: [photo-game-scenes/README.md](photo-game-scenes/README.md).

El modelo combina exposición, velocidad mínima y objetivo de profundidad de campo. Tolera el redondeo de los valores nominales de cámara. La vista simula brillo, movimiento y ruido; el efecto de apertura se evalúa en el diagnóstico. No es una reconstrucción óptica de un archivo RAW. El ruido no resta puntos por usar un ISO necesario en una cancha oscura.

El progreso es local a este navegador y cuenta: disparos, mejor puntuación y escenas logradas. No se escribe en los datos de partidos, disponibilidad, pagos ni otros registros operativos. No hay tabla de posiciones ni sincronización entre dispositivos en este prototipo.

## Verificación

- `npm test` conserva los recorridos del portal existente.
- `npm run test:photo-game` comprueba el modelo y el portal completo con llamadas de lectura simuladas: roles, navegación, controles, disparos, comparación, recarga, cambio de cuenta, recuperación de almacenamiento dañado y ausencia de escrituras operativas.
- Revisión visual de escritorio y pantalla móvil, carga de imágenes y modos de apariencia.
- `scripts/build-staging.py` conserva la integración; `scripts/staging-photo-game.inc.js` se inserta solo en staging.

Este prototipo se publica únicamente en staging para revisar realismo, claridad de las explicaciones y dificultad antes de autorizar una versión de producción.

Los objetivos y diagnósticos describen el resultado visual; no ofrecen valores de exposición, recetas ni soluciones para copiar. Los ajustes elegidos por el jugador sí se muestran en sus controles y en su propia toma.
