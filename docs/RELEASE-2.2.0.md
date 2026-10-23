# TSI 2.2.0 · producción

Publicación aprobada expresamente por Patricio el 23 de octubre de 2026 a la hora actual, como excepción única al horario habitual de las 00:00 de Monterrey. Los lanzamientos posteriores conservan ese horario.

## Cambios incluidos

- Disponibilidad de edición accesible desde inicio y menú, con pantalla propia para la editora; incluye la corrección pendiente de 2.1.1.
- Entrenamiento: 20 retos de cámara y 16 de edición sobre 16 fotografías sintéticas.
- Podio compartido general, de cámara y de edición; cada reto aporta únicamente su mejor puntuación confirmada, con empates y puesto personal.
- Ajustes de luz, color y encuadre, comparación antes/después, deshacer y progreso de práctica por cuenta.

## Entornos

Producción usa el proyecto `tantlgswituiwkxfgmsr`, el directorio `training/` y su propio espacio de sesión y progreso. Staging conserva `nksqpoigywfegcbvfhoa`, recursos bajo `/staging/` y un ranking separado. Las puntuaciones de pruebas no se trasladan a producción. No se importan tampoco marcas de práctica antiguas sin los ajustes originales.

El backend calcula los puntos desde modelos canónicos y guarda la mejor marca por reto. Solo pueden participar administración, fotografía y edición. Las tablas del ranking son privadas y no modifican partidos, pagos, disponibilidad ni datos de clientes.

## Preparación y validación

`scripts/build-production.py` genera los recursos de producción y `scripts/build-staging.py` conserva los de pruebas. Ambos comparten la generación de los juegos mediante `scripts/training_build.py`, con guardas y sesiones específicas de cada proyecto.

Validación: `npm test`, `npm run test:production-training`, `npm run test:photo-game`, `npm run test:editing-game` y `npm run test:game-ranking`, además de pruebas transaccionales del backend. Las marcas de comprobación del ranking se revierten.

La versión 2.2.0 sustituye el borrador de 2.1.1 del PR #6, cuyos cambios quedan incluidos. Conservar el historial previo de producción permite recuperar la página y sus recursos si fuera necesario.
