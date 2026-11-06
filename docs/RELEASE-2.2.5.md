# TSI 2.2.5 · Publicación de suspensiones de disponibilidad

## Ventana y fuente

Patricio solicitó preparar la publicación para el horario programado. Iniciar exclusivamente el **2 de noviembre de 2026 a las 00:00 de America/Monterrey**, equivalentes a `2026-11-02T06:00:00Z`. Nunca antes. El trabajo preparatorio mantiene producción en 2.2.3. GitHub Pages puede terminar después de las 00:00.

Repositorio: `patricioontiverosdz-hue/tanabisport`. Base revisada de `main`: `e7482bb97a9c6f6d90a44912a603b097df3a64a2`, árbol `7c17bae1d04e2606db4ff00fd255b901be234cb2`. Las suspensiones de staging proceden del PR 19, ya integrado.

| Entorno | Supabase | Página |
| --- | --- | --- |
| Producción | `tantlgswituiwkxfgmsr` | https://patricioontiverosdz-hue.github.io/tanabisport/ |
| Staging | `nksqpoigywfegcbvfhoa` | https://patricioontiverosdz-hue.github.io/tanabisport/staging/ |

Producción HTTP comprobada durante la preparación: 2.2.3, blob `29822ba11d6b1665a0422a348946ee497b757e81`. Staging HTTP: 2.2.5-staging, blob `7255cfff4249378976f779c9b12eca9736170c29`. Ambos coincidían byte por byte con la base revisada; Pages de la base terminó correctamente.

## Alcance

Administración puede suspender disponibilidad de fotografía y edición por fechas inclusivas con motivo obligatorio, y levantarla con otro motivo. El historial conserva autoría y horario original. Cada integrante solo consulta sus suspensiones; los días suspendidos reducen capacidad y propuestas, y el servidor rechaza nuevas asignaciones incompatibles. Los trabajos ya asignados se conservan y requieren revisión de administración cuando corresponda.

La promoción incorpora únicamente esta función sobre producción 2.2.3. No promueve la tienda 2.2.4, catálogo nuevo, clientes, seguimiento de pedidos ni Stripe TEST que permanecen en staging. No habilita nuevas funciones públicas. Conserva proyecto, claves públicas existentes, sesiones, CSP, push, entrenamiento y tienda vigentes. Todos los archivos de staging y recursos anteriores permanecen idénticos.

HTML preparado: blob `53cfa1b527ec349a020de2646825721a2122ac1a` (1,585,570 bytes). Módulo `assets/tsi-225-availability-suspensions.js?v=225`: blob `f14b2336968f97f03ab6d1361c27199c27a7360b` (9,811 bytes), idéntico al validado en staging. Paquete y lock: 2.2.5.

`scripts/prepare-release-225.py` reproduce los doce reemplazos revisados sobre el HTML base exacto y rechaza deriva. No ejecutar los generadores antiguos `build-production.py` ni `build-staging.py`, fijados a 2.2.0.

## Procedimiento de publicación

1. Consultar hora UTC y Monterrey. Solo iniciar dentro de los primeros minutos de la ventana indicada; si se ejecuta durante el día, detener e informar. No compensar demoras adelantando producción.
2. Leer `AGENTS.md`, este documento y el PR de lanzamiento desde el commit fijado en la tarea. Reconfirmar `git/ref/heads/main`, head del PR, árbol y blobs contra los valores fijados. Ante deriva o conflictos, detener sin sobrescribir cambios ni forzar referencias. El PR no debe tener auto-merge activado antes de la ventana.
3. Comprobar historial y prerequisitos de producción únicamente en lectura. No aplicar las migraciones de tienda 2.2.4. No copiar datos de staging.
4. Aplicar `docs/predeploy-225.sql` mediante `apply_migration`, nombre `tsi225_predeploy_safety`, únicamente al proyecto de producción. Confirmar existencia y metadata de la copia sin consultar ni exportar su contenido. La copia privada conserva la primera captura y permite conservar datos y definiciones previas.
5. Aplicar las migraciones faltantes, con SQL exacto y en este orden:
   - `supabase/migrations/20261101090042_tsi225_availability_suspensions.sql`, nombre `tsi225_availability_suspensions`.
   - `supabase/migrations/20261101090225_tsi225_suspension_integrity.sql`, nombre `tsi225_suspension_integrity`.
   Si alguna ya consta en historial, verificar identidad del SQL antes de omitirla. Nunca repetir a ciegas. Si falla una, detener manteniendo el frontend 2.2.3.
6. Ejecutar `dev-tests/release-225-backend-readonly.sql` en producción y revisar asesores de seguridad comparando con las advertencias previas documentadas. No ejecutar pruebas con fixtures en producción ni crear suspensiones reales para probar. Resolver problemas nuevos atribuibles al lanzamiento antes de integrar el frontend.
7. Reconfirmar base y head. Fusionar exclusivamente el PR de lanzamiento con `expected_head_sha` fijado y método `merge`. No integrar el PR 19 otra vez ni otras ramas. Si esta misma tarea ya integró el PR, validar su merge y árbol antes de continuar.
8. Esperar la finalización correcta de Pages del merge resultante. Consultar la URL pública con caché evitada: `APP_VERSION=2.2.5`, hash Git exacto del HTML preparado y del módulo; verificar acceso y hashes de recursos utilizados, CSP de producción, aislamiento de staging y que su HTML conserve su blob. Comprobar RPC anónimas denegadas sin cambiar datos. No afirmar publicación exitosa por el solo hecho de fusionar.
9. Informar en español versión real, enlace y resultado; ante un bloqueo, identificarlo con precisión. No enviar mensajes ni correos a terceros.

Para recuperar HTML grande usar `fetch_blob`; `fetch_file` puede devolver contenido vacío cuando supera 1 MB. La tarea debe operar con conectores GitHub y Supabase, sin depender de archivos temporales de esta sesión ni de credenciales de `git push`.

## Reversión

Si falla el frontend después del merge, restaurar exclusivamente `index.html` al blob base `29822ba11d6b1665a0422a348946ee497b757e81`, mediante un commit nuevo sobre el tip verificado, y devolver la versión del paquete/lock a 2.2.3. Verificar Pages y los bytes servidos tras revertir. Conservar staging, recursos, tablas, historial, recibos y copia privada; no borrar ni restaurar ciegamente datos operativos. Si ya hay suspensiones reales, conservar sus restricciones del servidor y comunicar la limitación temporal del cliente antiguo. La captura de funciones previas es para recuperación controlada, no para eliminar automáticamente las protecciones o registros de 2.2.5.

## Validación

Producción PostgreSQL 17.11 confirmó las tablas previas requeridas y ausencia de objetos 2.2.5. Su historial conserva 2.2.2 y no contiene migraciones de tienda 2.2.4 ni suspensiones. `predeploy-225.sql` fija los MD5 observados de las cinco funciones que reemplaza el lanzamiento y rechaza deriva antes de capturar. La copia y las migraciones no se ejecutaron en producción durante la preparación.

`dev-tests/release-225-backend-readonly.sql` se ejecutó y aprobó en staging real durante esta preparación: código, RLS, política admin/persona propia, permisos de tablas/esquema/RPC, justificaciones, seis índices, trigger de asignación y participación del historial en el respaldo operativo. No crea fixtures ni devuelve filas personales. Sus quince huellas de `prosrc` se contrastaron también independientemente con el AST de la migración exacta y su hardening. Las dos migraciones y ambos SQL de preparación/comprobación pasaron el parser de PostgreSQL 17, incluidos sus bloques PL/pgSQL. La prueba conductual transaccional con fixtures conserva la validación previa documentada en staging; no se repitió durante esta preparación.

Los asesores de seguridad de producción quedaron registrados sin datos personales en [tsi225-production-security-baseline.json](tsi225-production-security-baseline.json), observados el 2 de noviembre a las 03:43 UTC: 15 INFO de [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 11 WARN de [funciones definidoras ejecutables anónimamente](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), 19 WARN de [funciones definidoras ejecutables por usuarios autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y la advertencia previa de [protección de contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). La comparación posterior debe hacerse por entidad, no solo por cantidad. 2.2.5 revoca la ejecución directa de `auto_assign_editora()` y debe retirar sus dos observaciones. Los INFO adicionales de `tsi225_private.receipts` y `tsi225_release_safety.snapshots`, privados sin permisos directos, son esperados. No se amplía esta publicación a ajustes o funciones heredadas ajenas.

`npm run test:release-225` ejecuta identidad de producción, aislamiento, recursos y la suite completa de suspensiones sobre el HTML final: navegación por rol, motivos y fechas, privacidad de interfaz, reintentos y respuestas perdidas, cambios de cuenta, capacidad, pronósticos y propuestas. `npm run test:production-training` también verifica el HTML final.

Ambas pruebas aprobaron, junto con disponibilidad de edición en producción, temporadas/directorio (`release-222.cjs`), acceso/carga de tienda, push y aislamiento de staging. También aprobaron las regresiones de suspensiones de staging, opciones globales de imágenes, tienda nueva y pagos con servidor simulado.

Tras Pages, ejecutar `python scripts/verify-release-225.py`: comprueba hashes exactos del HTML, módulo y dieciséis recursos de producción, además del HTML intacto de staging, usando HTTPS con caché evitada. Durante la preparación se verificaron su sintaxis, el recorrido completo con los archivos exactos como respuestas HTTP simuladas y el rechazo de un recurso corrupto. Su ejecución real debe esperar a la publicación.

El fallo heredado de `npm test` en `dev-tests/ui-210.cjs`, botón `new-cost[data-mid="m1"]`, se reprodujo en producción 2.2.3 antes de los cambios. No se modificó esa prueba ni se declara la suite general aprobada. Las regresiones restantes se ejecutan por separado y se registran en el PR de lanzamiento.
