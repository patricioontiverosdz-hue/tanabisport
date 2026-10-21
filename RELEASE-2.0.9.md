# TSI 2.0.9

El inicio muestra accesos y pendientes por perfil. Para fotógrafos, los partidos sugeridos consideran su historial de campos, horarios y días, la disponibilidad confirmada y los cruces con su agenda. Elegir una sugerencia abre el partido; no asigna una cobertura automáticamente.

Administración puede crear, previsualizar, editar y eliminar avisos con títulos, negritas, cursivas, listas y enlaces HTTP/HTTPS. Admite hasta cinco imágenes opcionales, optimizadas en el dispositivo. Conserva los avisos anteriores como texto y los adjuntos al editar. Las imágenes se solicitan al abrirlas o editar el aviso y no se guardan en localStorage. Los lectores conservan la selección de avisos de su perfil.

Los avisos se guardan directamente en la tabla existente, con sus permisos actuales, confirmación de la respuesta y control de versión al editar. Se conserva el borrador si falla el guardado. El sincronizador general no escribe avisos para evitar que una lista sin adjuntos sobrescriba sus imágenes. No requiere migraciones de base de datos ni cambios en las notificaciones push.

Se integraron estas funciones sobre el HTML de producción, conservando modo día/noche, fotos en comentarios, descuentos, tienda y aislamiento de sesión y servidor.

## Verificación

- `node dev-tests/release-209.cjs`: creación, formato seguro, adjuntos, carga por demanda, recarga, edición sin perder imágenes, conflicto de edición, recuperación de errores, permisos de interfaz, eliminación, sugerencias e inicio.
- `node dev-tests/production-push.cjs`: arranque, panel de notificaciones y aislamiento de producción.
- `node dev-tests/staging-isolation.cjs`: aislamiento de la versión de pruebas.
- `git diff --check` y compilación de todos los scripts del HTML.
- Producción: transacción revertida que confirmó creación y edición con imágenes por administración, lectura por fotógrafo, prohibición de cambios por fotógrafo/editora y ausencia de lectura anónima. No quedaron avisos ni notificaciones de prueba.
- API de producción: proyección JSON de la lista aceptada; acceso anónimo devolvió una lista vacía.

Las pruebas de interfaz ejecutan la aplicación completa con DOM y API simulados. No se completó la prueba visual en un navegador real desde este entorno.

## Reversión

Restaurar únicamente `index.html` desde `ce28b4519d4f9db57bc0a5917f6c3e4de0f1de61` y volver a publicar. Conservar tablas y datos; los avisos de texto siguen siendo compatibles y los adjuntos permanecen guardados.
