# TABI: autonomía inicial en staging

TABI ahora responde preguntas frecuentes y conecta la conversación con cotizaciones y seguimiento. El personal utiliza una pestaña integrada de Atención; los visitantes conservan el flotante.

## Reglas comerciales confirmadas

- Flag: $200 por jugador, mínimo 6, anticipo mínimo $600.
- Tackle: $250 por jugador, mínimo 12, anticipo mínimo $750.
- Individual: $650 por jugador, pago completo antes de la cobertura, 25–35 fotos y un video.
- Equipo: más de 80 fotografías y dos reels por equipo.
- Entregas de lunes a miércoles posteriores al juego.
- Acceso al campo aparte cuando tenga costo.
- Si el cliente cancela dentro de las 12 horas previas al juego, el anticipo no es reembolsable. El personal revisa todas las cancelaciones; no se ejecutan reembolsos automáticos.
- Solo Administración puede aplicar descuentos.

## Comportamiento

El motor reconoce consultas sobre paquetes, pagos, entrega, disponibilidad y contratación, conserva deporte y cantidad de jugadores y abre un cotizador guiado. Los precios se recalculan en PostgreSQL. La confirmación requiere aceptación expresa de condiciones. El partido no es requisito para cotizar, confirmar la solicitud ni preparar el pago; la relación se realiza después por el personal desde Atención. No crea ni cambia asignaciones.

La confirmación registra la cobertura y solicita su pago; no acredita un pago. Stripe de prueba cobra $650 en individual y el anticipo mínimo de $600/$750 para equipos. Después del anticipo permite pagar el saldo. Solo la confirmación de Stripe registra el importe recibido, mediante webhook firmado o conciliación autenticada con la sesión actual del proveedor. El equipo registra avance y enlace de entrega. Estos importes son seguimiento y no crean cobros ni asientos duplicados en caja o nómina.

Quejas, cancelaciones, devoluciones, disputas de pago, privacidad y solicitudes de una persona se transfieren al equipo. Dos consultas desconocidas consecutivas también escalan. Tomar un caso asigna responsable y pausa TABI; otra persona debe esperar, salvo intervención de Administración. El personal puede devolverlo a TABI.

El seguimiento de visitantes usa exclusivamente la sesión cifrada de su conversación. Un nombre, teléfono o folio ajeno no concede acceso a datos de otra conversación. Contrataciones previas por otro medio necesitan verificación humana.

## Límites y pendientes

Esta primera versión utiliza reglas de conversación y contenido controlado, sin modelo generativo ni proveedor externo. No hay una tasa de resolución del 90% demostrada. Falta medir conversaciones reales y decidir si se integra un modelo para comprensión más amplia. No aprende automáticamente de respuestas del personal.

Pagos autorizados únicamente en Stripe de prueba, cuenta EntornoTanabi acct_1UVH3OQ9WFCZJIYG. Se reutilizan los secretos y el webhook firmado de tsi-store-checkout en staging. El retorno de Checkout no acredita pagos. No se habilitan cargos reales ni transferencias bancarias.

La selección interna para relacionar solicitudes se limita a 80 próximos partidos publicados, incluso sin fotógrafo asignado; nuevas necesidades de capacidad por fotógrafo o varias coberturas simultáneas necesitan reglas adicionales. Una conversación contiene una contratación.

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

## Stripe de prueba

El endpoint tsi-support-autonomy ofrece checkout y payment-status para la sesión privada de la conversación. Cada pago toma el importe de PostgreSQL; ninguna cantidad del navegador llega a Stripe. Una contratación solo puede tener un pago pendiente. Los reintentos conservan su ID y los parámetros de Checkout; la moneda es MXN y los métodos son dinámicos.

El webhook existente de tsi-store-checkout conserva el comportamiento de Tienda y deriva únicamente sesiones marcadas tsi_integration=tabi a la conciliación de coberturas. Firma, cuenta de prueba, importe, moneda, referencia, sesión y entorno se verifican antes de registrar un pago. Los eventos pendientes no acreditan importes; eventos repetidos o atrasados no duplican ni revierten pagos ya recibidos. Las pruebas de tienda previas siguen pasando.

Mientras hay un Checkout pendiente, el personal no puede cambiar el importe recibido ni el descuento; sí puede actualizar la entrega. Un pago Stripe acreditado no puede borrarse modificando el importe manual. Los reembolsos requieren atención del equipo.

Pruebas añadidas: tabi-stripe.cjs, tabi-stripe-webhook.cjs y tabi-stripe-database.sql (con rollback). El navegador verificó el botón y la actualización mediante servicios simulados. La conectividad saliente del ejecutor bloqueó una prueba HTTPS del sitio desplegado, por lo que no se completó aquí un pago con tarjeta de prueba ni se verificó un evento real de Stripe. No confundir las pruebas simuladas con un cargo exitoso.

## Corrección: cotización independiente del partido

El visitante solo indica deporte, paquete, jugadores y equipo/jugador. No aparece un selector de partido ni se consulta disponibilidad para habilitar la cotización. PostgreSQL admite match_id nulo e ignora cualquier relación enviada al cotizar por el visitante. Atención ofrece al personal un selector opcional para relacionar o desvincular el partido; no se asigna fotógrafo automáticamente. Stripe conserva los mismos importes y permite preparar el pago sin partido relacionado. Se verificó el flujo en navegador con servicios simulados y PostgreSQL con rollback.

El cotizador permite capturar fecha, lugar y hora como datos libres del evento. Los tres pueden quedar por confirmar. Se guardan con la cotización y se muestran en el seguimiento; no sustituyen ni exigen el ID de un partido de TSI.
