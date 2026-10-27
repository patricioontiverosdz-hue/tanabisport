# TSI 2.2.3

Publicación inmediata autorizada expresamente por Patricio en este chat con el mensaje «Autorizado version 2.2.3». La excepción al horario de las 00:00 de Monterrey corresponde únicamente a este lanzamiento.

## Cambios

- Restaura Dashboard → Tienda → Fotos en venta para administración y para editora cuando la tienda está habilitada.
- Conserva la carga por carpeta del jugador, hasta 10 fotos por selección y las vistas previas protegidas. Los originales se entregan por Drive.
- Conserva el catálogo público y los pedidos sin iniciar sesión cuando la tienda está habilitada. El pago y la entrega siguen siendo manuales.
- Identifica producción como 2.2.3 y staging como 2.2.3-staging.
- No modifica datos, configuración, permisos ni esquema del servidor.

## Verificación

- `npm test`: incluye regresión de tienda en producción y staging con servidor simulado; acceso al formulario por rol, catálogo público, pedido sin sesión y cierre de tienda.
- `npm run test:production-training`: conserva el arranque de los retos y la separación de servidores y sesiones.
- En lectura, la configuración de producción ya tenía `shop=true`, WhatsApp configurado y permisos de carga para administración y editora. No se crearon pedidos ni se subieron fotos reales durante las pruebas.

## Reversión

Restaurar los archivos de este lanzamiento desde `afbf8ea1e705d8142769a54c4595bac31e8a5fcf` y publicar nuevamente. No se requieren cambios de base de datos.
