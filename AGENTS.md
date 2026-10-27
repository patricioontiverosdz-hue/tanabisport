# TSI: reglas de trabajo

- Todas las futuras actualizaciones de producción se publican a las 00:00, hora de Monterrey (`America/Monterrey`), nunca antes. Preparar y probar durante el día; no adelantar un lanzamiento porque el código esté listo. La hora de inicio del despliegue no garantiza que GitHub Pages termine en ese mismo segundo.
- La restricción de las 00:00 aplica únicamente a producción. Staging puede actualizarse en cualquier momento, incluso mediante la rama `main` del alojamiento compartido, manteniendo sin cambios la página y los recursos que utiliza la versión vigente de producción. Patricio autorizó expresamente esta separación.
- Excepción puntual: Patricio autorizó expresamente el 23 de octubre de 2026 publicar la versión 2.2.0 a la hora actual. Esta autorización se limita a este lanzamiento; los siguientes conservan el horario de las 00:00.
- Excepción puntual: Patricio autorizó expresamente en este chat publicar ahora la versión 2.2.3 para restaurar la carga de fotos en Tienda. Esta autorización corresponde únicamente a este lanzamiento; los siguientes conservan el horario de las 00:00.
- Trabajar en una rama de versión y en el proyecto Supabase de staging `nksqpoigywfegcbvfhoa`. Producción usa `tantlgswituiwkxfgmsr`; los servidores, sesiones y archivos de ambos entornos deben quedar aislados.
- Mantener las funciones públicas y dirigidas a clientes pospuestas hasta que Patricio decida habilitarlas con su dominio. Cotizaciones y directorio son herramientas internas.
- Los partidos publicados son opciones de cobertura. Una cotización aceptada no asigna automáticamente a un fotógrafo.
- El cotizador pertenece a administración y fotógrafos. Los fotógrafos consultan sus cotizaciones y tarifas aprobadas; los costos internos y márgenes requieren administración.
- No duplicar descuentos, cobros de clientes, registros de efectivo recibido, reembolsos o costos de nómina al calcular rentabilidad. Mostrar qué cifras son estimadas y qué costos están pendientes de asignar.
- No subir respaldos con datos de personas, credenciales, archivos de clientes ni secretos al repositorio público.
