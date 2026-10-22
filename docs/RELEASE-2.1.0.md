# TSI 2.1.0

La cobertura conecta cotización, equipo, costos, pagos y entrega. El directorio y cotizador son internos. Fotógrafos usan sus cotizaciones y tarifas aprobadas; los costos internos y márgenes son exclusivos de administración.

## Incluido

- Cotizaciones por deporte, paquete y unidad; precios y descuentos validados por el servidor, costos estimados privados, descarga imprimible, historial, aceptación registrada manualmente y vinculación idempotente a partidos existentes o nuevos. Crear una opción no asigna fotógrafo.
- Rentabilidad por cobertura, con venta bruta, descuento una sola vez, cobros, saldo y costos registrados/estimados. Los recibos de efectivo del fotógrafo no duplican ingresos; reembolsos y préstamos no duplican sueldos. Los bonos de pagos guardados se atribuyen por jugadores del pago, conservando los centavos.
- Gastos directos y gastos aprobados compartidos, por partes iguales o jugadores. Los compartidos ya incluidos en Gastos no se suman otra vez al resumen mensual; los directos nuevos sí se integran. Se identifican los gastos todavía sin atribuir.
- Envío, recepción manual, correcciones y resolución de entregas con autor, fechas, permisos y versión. No envía mensajes ni afirma leer WhatsApp.
- Directorio de equipos/coordinadoras, contacto, búsqueda, notas, archivado e historial vinculado.
- Centro de pendientes según rol, con coberturas por registrar, saldos, revisiones de pago, gastos/préstamos, entregas y cotizaciones por vincular.
- Borradores por cuenta, rol y entorno: formularios nuevos, cobertura, nuevo partido y texto de avisos. Recuperación explícita, caducidad de siete días y limpieza tras un guardado confirmado. Archivos originales, imágenes, contraseñas y tokens no se copian a borradores.
- Bitácora general protegida, con historial de cambios antes/después y sin duplicar imágenes.
- Respaldo operativo con AES-256-GCM y PBKDF2, contraseña no guardada, manifiesto SHA-256 y archivos de Storage. Comprobación local y ensayo de restauración en tablas temporales, sin sobrescribir datos activos.
- Módulos separados, formularios adaptables, botones de tamaño táctil, etiquetas, foco, estado de guardado y respeto a la preferencia de movimiento reducido.

## Estreno

Administración debe definir y aprobar sus tarifas desde Cotizador → Administrar tarifas y paquetes. No se inventaron precios comerciales ni se activaron funciones públicas. Se recomienda comprobar una cobertura de cada perfil durante el primer uso.

El respaldo operativo no sustituye el respaldo de Auth, configuración de servidor, secretos, suscripciones push o un `db dump` administrado del proyecto. Sus exclusiones aparecen en el manifiesto y la interfaz. El archivo completo está limitado a 100 MB, con 70 MB de adjuntos; se rechaza el exceso sin entregar un respaldo parcial. Las claves y contraseñas del respaldo deben conservarse por separado. Para recuperación por pérdida total del proyecto, combinar este archivo con el respaldo y configuración del servidor y el código de esta versión.

## Verificación

- `npm ci && npm test`: modelo financiero, cifrado e integridad, recorridos DOM de los tres roles, reintento sin duplicados, recuperación de borradores entre sesiones, avisos 2.0.9 y aislamiento de producción/staging.
- `dev-tests/tsi210-database.sql`, exclusivamente en staging: transacción revertida de tarifas, cotizaciones, propiedad de contactos, descuentos, privacidad de costos, idempotencia, entregas/correcciones, distribución exacta, bitácora y restauración aislada de todas las tablas del respaldo.
- Revisión de seguridad: ninguna advertencia nueva de las funciones/tablas expuestas. El registro de idempotencia, privado y sin acceso directo, conserva RLS sin políticas de usuario intencionalmente.
- Preflight de producción de sólo lectura: tablas base y columnas requeridas presentes, sin módulos 2.1.0 previamente instalados.
- Las pruebas DOM no equivalen a una comprobación visual en un iPhone físico.

## Publicación y reversión

Iniciar la actualización de producción exclusivamente a las 00:00, zona `America/Monterrey`. Staging puede actualizarse en cualquier momento; su publicación 2.1.0 mantiene intacta la página 2.0.9 de producción. El procesamiento de GitHub Pages puede terminar después; no adelantar el inicio para compensarlo.

1. Confirmar que `main` sigue en `a32fa0c347c17e734cb3c126037ffb343fed0b8b` (vista de staging 2.1.0) y que la rama/PR corresponden al SHA probado. El `index.html` de producción debe seguir siendo el blob `bfb86873a575ce649570382eb89bf6f1fa5e999a`, versión 2.0.9. Si cambiaron, detener y revisar antes de publicar.
2. Ejecutar `docs/predeploy-210.sql` en TanabiSport producción `tantlgswituiwkxfgmsr`; confirmar una fila privada para la versión 2.1.0.
3. Aplicar en ese proyecto las tres migraciones `tsi210_*` en orden. Confirmar funciones, RLS y versión de esquema. No ejecutar las pruebas con registros de ficción en producción.
4. Integrar el PR verificado a `main`, sin forzar ni sobrescribir cambios de terceros. Esperar el despliegue de GitHub Pages y verificar versión 2.1.0 y coincidencia de los archivos con el SHA probado.
5. Ante fallo del frontend de producción, restaurar únicamente `index.html` al blob `bfb86873a575ce649570382eb89bf6f1fa5e999a` de la versión 2.0.9. Mantener staging 2.1.0 para revisión y conservar los recursos nuevos, tablas, datos y bitácora. Ante incompatibilidad de las nuevas validaciones de gastos, retirar únicamente el trigger `tsi210_expense_allocation` mientras se revisa. La copia privada del predeploy queda en `tsi210_release_safety`.

No incluir archivos de respaldo ni registros privados en GitHub.
