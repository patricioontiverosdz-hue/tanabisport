# Publicación TSI 2.3.0

Autorización recibida: iniciar el lunes **9 de noviembre de 2026 a las 00:00**, zona **America/Monterrey** (**2026-11-09T06:00:00Z**). La publicación y sus comprobaciones pueden terminar después de esa hora. No promover antes de ese instante. No repetir la publicación en otro lunes.

El usuario confirmó **pedidos manuales y Stripe pendiente**. No copiar claves, cuentas, compras ni datos de pruebas a producción. No activar cobros Stripe. Se preservan las cuentas, los datos operativos, los juegos y sus permisos. El portafolio e Inicio se retiran manualmente; Tienda conserva el límite de 56 días o fin de temporada, lo que ocurra primero. Los documentos de privacidad 2.2.6 se conservan.

## Paquete preparado

- Rama de producción: `release/2.3.0-production`. El programador debe fijar el PR y el SHA exacto revisado; no integrar cambios posteriores por coincidencia del nombre de rama.
- Base: `708816c9fc5cf6a16520f23423ab1ae1ba2ff329`.
- `artifacts.json`: huellas de la entrada pública ligera, equipo, módulos, marca y recursos compartidos. La carpeta `staging/` conserva su árbol fijado.
- `backend/`: plan ordenado, funciones y comprobaciones exclusivas del proyecto `tantlgswituiwkxfgmsr`. El proyecto `nksqpoigywfegcbvfhoa` no se modifica durante esta publicación.
- Las seis fotografías públicas existentes se trasladan al nuevo sistema durante el lanzamiento. Los archivos y datos obtenidos para ese traslado permanecen fuera de Git. No privatizar el origen ni cerrar su lectura antes de verificar la nueva página.

## Preparación y comprobaciones

Desde este checkout: ejecutar `node dev-tests/release-window-230.cjs`, las pruebas de paquete y backend indicadas en `npm run test:production-230` y `node scripts/prepare-production-manifest-230.cjs`. Confirmar que el manifiesto coincide con los archivos canónicos de Git del SHA autorizado. La revisión completa de staging tiene 31 suites con PostgreSQL local; no describir una revisión automatizada de HappyDOM como una revisión visual en navegador.

Antes de la hora programada solo se permiten comprobaciones de lectura. `node scripts/release-window-230.cjs --status` informa el estado sin publicar; sin `--status`, rechaza un lanzamiento temprano o fuera de su ventana inicial. `node scripts/verify-production-230.cjs --baseline` verifica por HTTPS que sigue la versión anterior. La ausencia de un adaptador de correo no autoriza configurar un proveedor nuevo.

## Ejecución autorizada a medianoche

1. Leer la hora real y ejecutar el control horario. Verificar en GitHub que el PR sigue abierto, su head coincide con el SHA fijado, su base es la revisada y está integrable. Comparar la lista de archivos y las huellas del paquete. Ante deriva, no forzar referencias ni integrar otras modificaciones.
2. Leer el estado de producción: migraciones ya aplicadas, funciones, configuración, permisos y las fotografías antiguas. Seguir el plan backend en su orden, aplicar solo los pasos pendientes y conservar la compatibilidad del portafolio antiguo hasta después de verificar el nuevo sitio. Usar las herramientas nativas de Supabase para migraciones, consultas y despliegues; no depender de secretos locales que no se han configurado.
3. Obtener las seis imágenes existentes desde su origen autorizado, validarlas e importarlas según el plan. Confirmar su conservación antes de seguir. No guardar imágenes, datos personales ni credenciales en el repositorio.
4. Desplegar las funciones preparadas al proyecto de producción. Mantener Stripe desactivado y los pedidos manuales habilitados según la configuración revisada. Comprobar las respuestas públicas y el rechazo de credenciales inválidas. Los accesos manuales de Tienda los emite Administración para contactos y carpetas aprobados; no enviar mensajes ni correos externos automáticamente.
5. Reconfirmar el PR y su SHA. Integrarlo con `expected_head_sha`, sin sobrescrituras. Esperar la ejecución de GitHub Pages correspondiente al SHA integrado hasta que termine. No crear otra automatización para vigilar el despliegue; continuar las comprobaciones en esa ejecución.
6. Ejecutar `node scripts/verify-production-230.cjs`: comparar los archivos publicados con sus huellas. Confirmar también por HTTPS que staging conserva la versión revisada. Verificar el portafolio público con sus seis imágenes conservadas, los módulos y juegos del equipo, el acceso privado de Tienda y que no haya cobros reales habilitados.
7. Solo tras la comprobación del nuevo sitio y sus imágenes, ejecutar el cierre del acceso antiguo indicado por el plan backend. Volver a comprobar el portafolio. Informar el resultado y la URL publicada; si no terminó correctamente, decirlo. Finalizar o desactivar la programación para evitar repeticiones.

## Recuperación

Si falla una comprobación antes de integrar el PR, mantener el sitio 2.2.6 y el portafolio antiguo accesible; no continuar el corte. No borrar tablas, fotos, cuentas, pedidos ni registros para “reiniciar” el lanzamiento. Si se integró y hay un fallo material, usar una reversión revisada del cambio de producción y restaurar los permisos de compatibilidad indicados por el plan backend. La restauración segura de un lanzamiento iniciado tiene prioridad sobre continuar una promoción fallida. Registrar los pasos efectivamente realizados para no repetir migraciones ni importaciones.
