# TABI: Stripe de prueba

Desplegar únicamente en nksqpoigywfegcbvfhoa. Reutiliza STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET de Supabase Secrets; no guardarlos en código ni enviar claves al navegador. Checkout hospedado utiliza stripe@23.0.0 y API 2026-09-30.endive. Solo admite claves test y verifica la cuenta acct_1UVH3OQ9WFCZJIYG.

Aplicar tabi-autonomy-staging.sql y después tabi-stripe-staging.sql. El individual requiere $650 completos. Equipos: anticipo mínimo $600 flag / $750 tackle; después puede cobrarse el saldo. Los importes vienen del servidor.

POST /checkout requiere x-support-token y request_id; devuelve solo el enlace hospedado de la sesión propia. POST /payment-status verifica el pago en Stripe y devuelve el seguimiento autorizado. POST /payment-config ofrece readiness de configuración, no garantiza un cobro exitoso.

El webhook existente de tsi-store-checkout/webhook ya está registrado en la cuenta test para completed, async_payment_succeeded, async_payment_failed y expired. Su handler verifica la firma y consulta la sesión actual; solo las sesiones TABI se derivan al RPC tsi231_support_payment_event. Tienda mantiene sus rutas y autorizaciones actuales. Mantener tabi-payments.mjs idéntico en ambas funciones.

No se acredita un pago al volver de Checkout. Se exige payment_status paid, importe/moneda/referencia correctos, cuenta de pruebas y sesión coincidente. Hay deduplicación de eventos y pagos; no se generan cobros o nóminas duplicados. Una pérdida de respuesta mantiene la misma sesión; los fallos ambiguos no liberan ni recrean pagos automáticamente.

Validación: node dev-tests/tabi-autonomy.cjs; node dev-tests/tabi-stripe.cjs; node dev-tests/tabi-stripe-webhook.cjs; node dev-tests/store-payments-230.cjs; navegador con red simulada y SQL de pruebas con rollback. No se completó un pago real de Stripe test desde el ejecutor por restricción de conectividad HTTPS.
