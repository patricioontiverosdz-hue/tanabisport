# TABI: autonomía inicial en staging

TABI ahora responde preguntas frecuentes y conecta la conversación con cotizaciones y seguimiento. El personal utiliza una pestaña integrada de Atención; los visitantes conservan el flotante.

## Reglas comerciales confirmadas

- Flag: $200 por jugador, mínimo 6, anticipo mínimo $600.
- Tackle: $250 por jugador, mínimo 12, anticipo mínimo $750.
- Individual: $650 por jugador, 25–35 fotos y un video. El anticipo individual está pendiente de decisión; su confirmación automática se bloquea hasta configurarlo.
- Equipo: más de 80 fotografías y dos reels por equipo.
- Entregas de lunes a miércoles posteriores al juego.
- Acceso al campo aparte cuando tenga costo.
- Si el cliente cancela dentro de las 12 horas previas al juego, el anticipo no es reembolsable. El personal revisa todas las cancelaciones; no se ejecutan reembolsos automáticos.
- Solo Administración puede aplicar descuentos.

## Comportamiento

El motor reconoce consultas sobre paquetes, pagos, entrega, disponibilidad y contratación, conserva deporte y cantidad de jugadores y abre un cotizador guiado. Los precios se recalculan en PostgreSQL. La confirmación requiere aceptación expresa de condiciones y revalida un partido futuro con fotógrafo asignado. No crea ni cambia asignaciones.

La confirmación registra la cobertura y solicita el anticipo; no acredita un pago. El equipo registra el importe acumulado recibido, avance y enlace de entrega. Estos importes son seguimiento y no crean cobros ni asientos duplicados en caja o nómina.

Quejas, cancelaciones, devoluciones, disputas de pago, privacidad y solicitudes de una persona se transfieren al equipo. Dos consultas desconocidas consecutivas también escalan. Tomar un caso asigna responsable y pausa TABI; otra persona debe esperar, salvo intervención de Administración. El personal puede devolverlo a TABI.

El seguimiento de visitantes usa exclusivamente la sesión cifrada de su conversación. Un nombre, teléfono o folio ajeno no concede acceso a datos de otra conversación. Contrataciones previas por otro medio necesitan verificación humana.

## Límites y pendientes

Esta primera versión utiliza reglas de conversación y contenido controlado, sin modelo generativo ni proveedor externo. No hay una tasa de resolución del 90% demostrada. Falta medir conversaciones reales y decidir si se integra un modelo para comprensión más amplia. No aprende automáticamente de respuestas del personal.

Pendientes comerciales: anticipo individual y datos oficiales de pago. No se inventan instrucciones bancarias. La configuración permanece en tsi231_support_config en el entorno de pruebas.

La selección de partidos se limita a 80 próximos partidos válidos asignados; nuevas necesidades de capacidad por fotógrafo o varias coberturas simultáneas necesitan reglas adicionales. Una conversación contiene una contratación.

## Aislamiento y despliegue

Solo staging: proyecto nksqpoigywfegcbvfhoa, endpoint tsi-support-autonomy. Las páginas y los recursos assets/tsi230 de producción no cambian. La función tsi-support vigente tampoco se reemplaza.

La base requiere supabase/patches/tabi-autonomy-staging.sql una vez. La migración y el endpoint ya se aplicaron en staging. El código fuente conserva el parche final consolidado.

No ejecutar el generador de producción ni promover este paquete fuera de la ventana de las 00:00 de Monterrey. La publicación de producción necesita revisar pendientes y preparar su propio paquete aislado.

## Validación

- node dev-tests/tabi-autonomy.cjs
- TSI_PLAYWRIGHT_MODULE permite seleccionar la instalación local de Playwright para node dev-tests/tabi-autonomy-browser.cjs; usa Chrome instalado.
- dev-tests/tabi-autonomy-database.sql se ejecutó en staging con rollback: tarifas, anticipos, idempotencia, pérdida de asignación, aceptación de condiciones, toma de casos, descuentos administrativos, saldo, reanudación y aislamiento.
- Navegador: registro, respuesta natural dentro de los temas cubiertos, partidos, cotización, condiciones, confirmación, ancho móvil, pestaña de personal y limpieza al cerrar sesión.
- Las tablas nuevas tienen RLS y ningún acceso directo de anon/authenticated. Solo el endpoint autorizado usa las funciones de servidor.
