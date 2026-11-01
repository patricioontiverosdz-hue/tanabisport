# TSI 2.2.5 · Suspensiones de disponibilidad

## Uso

En staging, administración abre **Equipo → Suspensiones de disponibilidad**, selecciona a una persona de fotografía o edición, indica las fechas y escribe un motivo justificado. El periodo abarca días completos y ambas fechas se incluyen, con referencia a la hora de Monterrey.

La suspensión termina al finalizar el periodo. Administración también puede levantarla antes, registrando otro motivo. Se conservan el horario declarado, el motivo original, las fechas y la autoría de cada acción. La persona afectada puede consultar el aviso en su disponibilidad; no puede crear ni levantar suspensiones.

Los días suspendidos se excluyen de la capacidad de edición y de las sugerencias y propuestas de cobertura. El servidor rechaza nuevas asignaciones incompatibles aunque se intente guardar desde otra sesión o un cliente antiguo. Los trabajos ya asignados se conservan: administración debe revisarlos si requieren redistribución.

Las confirmaciones semanales de horario siguen perteneciendo a cada integrante y no levantan una suspensión administrativa. Al terminar o levantar la suspensión vuelve a aplicarse el horario declarado para esas fechas; no se confirman semanas nuevas automáticamente.

## Validación

`npm run test:availability-suspensions` verifica validación de motivos y fechas, permisos en la interfaz, creación y levantamiento, recuperación de respuestas perdidas sin duplicados, escape de texto, cambio de cuenta, cálculo de capacidad, propuestas de cobertura y navegación de la página completa por rol.

También se verifican disponibilidad de edición, aislamiento de staging y regresiones de recomendaciones, notificaciones, temporadas, directorio y tienda. La prueba existente `dev-tests/ui-210.cjs` falla en el botón `new-cost[data-mid="m1"]`; el mismo fallo se reproduce en una copia limpia del commit base, sin estos cambios.

Las migraciones `20261101090042_tsi225_availability_suspensions.sql` y `20261101090225_tsi225_suspension_integrity.sql` están aplicadas en staging. Sus nombres corresponden al historial real del servidor. `dev-tests/availability-suspensions-backend.sql` pasó en una transacción revertida: verificó permisos, privacidad por persona, rechazo de motivos vacíos y espacios, fechas, solapamientos, reintentos, capacidad y horarios originales, nuevas asignaciones, publicación de opciones sin asignar, levantamiento y respaldo del historial.

Se revisaron los asesores de seguridad y rendimiento. Los recibos privados tienen RLS y ningún permiso directo de cliente; por diseño producen la [notificación informativa de RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Los índices nuevos aún sin uso reflejan que no se han creado suspensiones reales. Las advertencias previas ajenas a esta función no se modificaron.

## Entornos y publicación

Esta entrega modifica la aplicación de **staging** y su base `nksqpoigywfegcbvfhoa`. La página y los recursos vigentes de producción se mantienen intactos. No se crean suspensiones reales como parte de las pruebas.

La promoción a producción se prepara por separado y debe respetar las 00:00 de `America/Monterrey`, según [AGENTS.md](../AGENTS.md). No ejecutar el generador antiguo `scripts/build-staging.py` sobre esta entrega: ese script sigue fijado a 2.2.0 y sobrescribe funcionalidades posteriores.
