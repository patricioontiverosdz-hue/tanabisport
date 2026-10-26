# TSI 2.2.2

Publicación en producción solicitada expresamente por Patricio el 26 de octubre de 2026. Esta autorización corresponde a este lanzamiento; no cambia el horario general de las siguientes versiones.

## Cambios

- El directorio muestra temporada Juvenil (enero-junio), Infantil (julio-diciembre) y año, y permite buscarlos.
- Los equipos nuevos proponen la temporada y el año actuales en hora de Monterrey. Los registros anteriores permanecen sin asignar hasta editarlos expresamente.
- La editora puede consultar equipos y contactos. No puede agregar, editar, cotizar ni vincular coberturas desde el directorio; el servidor también rechaza las mutaciones de equipos de ese rol.
- Producción conserva su servidor, sesiones y recursos propios. El módulo de directorio lleva una versión en la URL para renovar su caché.

## Base de datos

La actualización es aditiva: agrega temporada/año y su validación sin asignar valores a registros anteriores. El guardado conserva los campos cuando un cliente anterior no los envía. El acceso de editora se limita a SELECT en el directorio; no amplía permisos de cotizaciones, tarifas, costos ni vínculos de coberturas.

## Verificación

`npm test`, `npm run test:release-222`, `npm run test:production-training`, `npm run test:photo-game`, `npm run test:editing-game` y `npm run test:game-ranking`.

La prueba específica de interfaz usa un servidor simulado. La verificación del backend se realiza por separado con datos sintéticos en una transacción revertida: guardado y lectura de temporada/año, clientes anteriores, permisos de editora y rechazo de valores inválidos. No se conservan registros de prueba.

## Reversión

Restaurar el HTML de producción y `assets/tsi-210.js` del commit `14cd6340d2cb71c021bd93616e7d7208c20930f0`. Conservar las columnas y los datos de temporada; son compatibles con el cliente anterior. Si se necesita retirar la consulta de editora, retirar únicamente la política `tsi222_team_editor_read`.
