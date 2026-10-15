# TSI push en producción

Publicado el 15 de octubre de 2026. Página: https://patricioontiverosdz-hue.github.io/tanabisport/ . Versión: 2.0.4.

Proyecto: tantlgswituiwkxfgmsr. Edge Function: tsi-push. Autenticación de cada sesión dentro de la función; despacho con secreto independiente. Cron tsi-push-dispatch cada minuto. Configuración privada cifrada en Vault, tsi_push_runtime_config, accesible únicamente por service_role mediante tsi_push_server_config(). Las claves de producción son independientes de staging y no se incluyen en este repositorio.

Incluye avisos por rol, pagos, cambios de etapa, enlace registrado, cierre de cobertura, comentarios de edición, material en selección y solicitudes de gastos/préstamos. Cada dispositivo debe autorizar y activar desde Notificaciones, con prueba voluntaria. Respeta preferencias y silencio. iPhone: usar el icono de producción, habilitar tiras/sonidos y permitir la app en Concentración.

La fecha mostrada de pago cambia a viernes (lunes de la semana +11 días); conserva el corte del domingo anterior. No se reescriben pagos ni importes existentes. La etiqueta de viernes también se aplica al navegar semanas anteriores; las fechas reales registradas no se modifican.

No constituye la conclusión de todos los requisitos de V2.0.4. Quedan por conectar disponibilidad, solicitudes de horas, exceso de carga y recordatorios por plazo. Los avisos de selección no afirman que los archivos estén completos. Abrir una notificación lleva a la sección, no a un registro individual. El contador de la campana anterior y el historial push siguen separados.

Verificado: 13 pruebas de cliente y reglas, arranque de la página completa en entorno simulado, aislamiento entre proyectos, destinatarios en una transacción revertida en producción, permisos de configuración, despacho vacío HTTP 200 y autenticación/CORS. La recepción con sonido se confirmó en iPhone en staging; la recepción en producción requiere activar un dispositivo real.

Reversión: restaurar index.html de b8ffe62278185fbd8254429923331f1efd5552aa y retirar el receptor publicado. Pausar envíos con `select cron.unschedule('tsi-push-dispatch');`. Conservar tablas e historial. Los avisos de RLS sin políticas en subscriptions/receipts son intencionales: acceso exclusivo del servidor. Los avisos de funciones previas ajenas a push no se modificaron.
