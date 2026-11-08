# Backend de producción TSI 2.3.0 — preparado, sin ejecutar

Destino único: Supabase `tantlgswituiwkxfgmsr`. La autorización de publicación es el lunes **9 de noviembre de 2026 a las 00:00 de America/Monterrey**. El comienzo a esa hora no garantiza que GitHub Pages termine en el mismo segundo. Este directorio es un paquete de promoción, no una señal de que producción ya haya cambiado.

## Estado comprobado durante la preparación

Producción tenía las funciones `tsi-push` y `training-game`, la base operativa 2.2.6 y las suspensiones/partidos parciales 2.2.5. No tenía las tres migraciones de Tienda 2.2.4 ni las ocho migraciones 2.3.0. Su Tienda estaba vacía. Había **seis fotografías reales en el portafolio heredado**, con el bucket público existente. No se copian registros ni credenciales de staging.

Las seis imágenes se descargaron únicamente por lectura desde sus URLs exactas de Supabase producción para el preflight. Todas caben en 1600 píxeles y tenían orientación EXIF 1. Se verificó la normalización de metadatos con el normalizador existente: se quitan EXIF/IPTC, se mantiene ICC coherente y se conservan los segmentos de imagen sin recomprimir ni cambiar píxeles. Dos originales requieren la excepción de importación heredada de hasta 1.5 MB de data URI; las altas ordinarias siguen limitadas a 500000 caracteres. Los hashes de entrada y salida, medios y SQL con las imágenes quedan únicamente en `test-results/prod230-launch/`, ignorado por Git. La verificación se debe repetir con las filas actuales en la ventana de lanzamiento.

La pasarela Stripe queda **desactivada** por instrucción del usuario: el servidor no lee claves Stripe, no importa su SDK y no permite crear sesiones ni confirmar eventos de pago. No se ejecutaron cargos ni se provisionó ningún proveedor. Los pedidos manuales conservan el cálculo del servidor, el permiso por familia y el estado `nuevo`. La activación futura de pagos reales requiere otra revisión de cuenta, claves, webhook y compra completa.

No hay proveedor de correo configurado. El flujo de producción usa un **código de acceso manual real**, emitido exclusivamente por Administración para una invitación/carpeta/contacto aprobado y entregado por la persona administradora. No es un código de pruebas ni un correo enviado automáticamente. Conserva los seis dígitos, cinco minutos, cinco intentos, hashes, uso único y sesión opaca de dos horas. No crea cuentas Auth de clientes. El envío por correo permanece cerrado; `TSI_GUEST_MANUAL_CODES=false` permite cerrar también la entrega manual si fuera necesario.

## Secuencia para el agente programado

1. Verificar la ventana autorizada con `scripts/release-window-230.cjs`, la integridad del manifiesto de archivos, el PR preparado y que su base/head sean los esperados. Volver a leer el proyecto y las migraciones **de producción**. No ejecutar contra staging.
2. Ejecutar `preflight.sql` por MCP `execute_sql` de solo lectura; conservar la respuesta fuera de Git. Capturar también las filas de `legacy-portfolio-select.sql` en un JSON ignorado. Si aparecieron fotos de Tienda respecto al preflight vacío, detener el corte para revisar su migración de originales/previews. No descartarlas ni publicar precios de prueba.
3. Aplicar con MCP `apply_migration` las **doce entradas** de `manifest.json → ordered_sql`, en orden. Antes de cada entrada, comprobar su nombre en el historial y no repetir una migración aplicada. Cada archivo se ejecuta de forma transaccional; ante error, revisar el estado y detenerse. El registro de respaldos existente se amplía; no se sustituye por una lista anterior. No se modifican usuarios, roles de perfil, partidos, pagos aprobados ni datos financieros existentes.
4. Las entradas 008–010 crean el portafolio nuevo sin cerrar el heredado; 010 deja Portafolio/Inicio con retiro manual, sin caducidad automática. La tarea de retención de **Tienda** sigue activa. 012 prepara la importación privada e idempotente de las fotos heredadas; no inventa autor de esas imágenes históricas (`created_by` nulo para ellas).
5. Ejecutar localmente: `node release/2.3.0-production/backend/prepare-legacy-portfolio.mjs --input test-results/prod230-launch/legacy-rows.json --out test-results/prod230-launch/legacy-spool`. El helper solo lee y genera SQL; **no escribe a Supabase y no requiere una service key**. Valida host/path, JPEG, orientación y hashes. Si una imagen falla, no cerrar el portafolio original.
6. Alimentar cada archivo SQL de ese spool a MCP `execute_sql` de producción. Incluye `BEGIN; SET LOCAL ROLE service_role; SELECT public.tsi230_import_legacy_portfolio(...); COMMIT;`. El RPC toma el título real de la fila original, verifica hashes y mantiene un mapa privado de su ID original a la foto nueva. Un reintento no puede duplicar ni resucitar una importación retirada. Guardar los IDs devueltos fuera de Git y comprobar imagen/título/hash de cada copia.
7. Desplegar **solo las copias** de `functions/` de este paquete: soporte, invitados, tienda manual y herramientas por rol. Incluir todos sus archivos relativos; invitados requiere `portfolio.mjs`. Usar `verify_jwt=false` porque cada handler valida su credencial o JWT internamente. No sustituir las funciones existentes de push o entrenamiento.
8. Verificar los endpoints desplegados y permisos con datos sintéticos/revertidos: portada/portafolio, roles del equipo, TABI, permisos invitados, cálculo/pedido manual y revocación. `config` de tienda debe indicar producción, `ready:false`, clave pública nula. No cambiar `payments_enabled` a true ni copiar secretos de staging. Capturar conteos operativos antes/después, sin guardar datos de personas en Git.
9. Integrar el PR exacto preparado y seguir el despliegue de Pages hasta comprobar el HTML, recursos y enlaces de producción. Verificar que las seis fotos heredadas estén disponibles por sus IDs importados y que Tienda conserve sus permisos. El portafolio original aún está disponible durante esta fase.
10. **Después de la comprobación HTTP**, aplicar separadamente `manifest.json → post_frontend_sql` (013). No incluirlo en un bucle previo al frontend. Su precondición comprueba todas las copias y, solo entonces, cierra la tabla/bucket heredados. No elimina imágenes originales ni filas históricas. Volver a verificar el nuevo portafolio y los permisos públicos.
11. Concluir cuando Pages y los endpoints estén comprobados. Informar el resultado real, incluido que los pagos son manuales y la entrega de acceso es humana.

## Fallo parcial y reversión

Si falla una migración, detenerse; no seguir con archivos dependientes. El frontend 2.2.6 y el bucket heredado permanecen utilizables mientras no se ejecute 013. Las nuevas tablas se conservan; nunca se elimina información para volver a intentar.

Si Pages no publica el frontend esperado, no ejecutar 013. Mantener las seis fotos originales públicas como estaban y restaurar el frontend mediante un PR de reversión si corresponde. No revertir datos financieros, usuarios ni pedidos nuevos.

Si se debe volver al frontend antiguo **después** del corte 013, restaurar primero los permisos del portafolio y el valor público del bucket desde el preflight capturado; retirar solamente la política de cierre creada por esta entrega. La plantilla `rollback-legacy-template.sql` exige sustituir sus marcadores con los permisos reales del preflight: no asumir permisos adicionales. El proceso no borra tablas ni fotos nuevas, no cambia sus autores y no revierte pedidos manuales recibidos. Después, restaurar y verificar el frontend anterior. Un fallo de limpieza no autoriza ampliar permisos de Tienda.

## Pruebas y límites

`node dev-tests/production230-backend.cjs` verifica el paquete y sus handlers con transporte simulado. Con `TSI230_PGLITE_MODULE` definido incluye el ejecutor PostgreSQL local. La prueba usa únicamente imágenes de entrenamiento y usuarios sintéticos locales, nunca copia los datos reales de producción al repositorio.

Las pruebas no equivalen a un correo enviado, una operación Stripe real ni una comprobación visual en navegador. El lanzamiento no ha sido ejecutado durante esta preparación.
