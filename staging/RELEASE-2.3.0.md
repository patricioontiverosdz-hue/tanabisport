# TSI 2.3.0 · STAGING

Esta entrega se limita a la aplicación y al proyecto de pruebas `nksqpoigywfegcbvfhoa`. La aplicación se identifica como `2.3.0-staging`. Los archivos y recursos usados por producción, incluidos el HTML raíz, `assets/` y el entrenamiento de producción, permanecen intactos. La configuración y los datos de producción conservan su entorno separado.

## Portada y espacios del equipo

- Portada con el logotipo original, navegación pública, portafolio, Tienda, Privacidad y **Cómo trabajamos**, con cuatro pasos desde el contacto hasta la entrega.
- El portafolio público se reservó para material real autorizado. La revisión desplegada encontró cero fotografías y ningún bucket de portafolio; la portada muestra el estado vacío y la identidad de Tanabi. Las imágenes sintéticas de entrenamiento no se presentan como trabajo real.
- El logotipo lleva a Inicio y conserva la sesión del equipo. La carga inicial muestra el logotipo real.
- Resúmenes distintos para Administración, Fotografía y Edición, con cifras de los registros existentes y accesos a las tareas de cada rol.
- **Más herramientas** conserva todos los módulos autorizados por el rol, incluidos los dos retos, el podio y Privacidad. Las recomendaciones y el detalle operativo anterior continúan disponibles mediante un desplegable.
- Interfaz adaptable, navegación por teclado, nombres accesibles y respeto por la preferencia de movimiento reducido. Las funciones públicas que dependían de configuración conservan esa condición.

## Publicación segura del portafolio

La nueva publicación pública exige confirmación y referencia de una autorización específica para portafolio, fecha de fin de temporada y fecha límite de esa autorización. También exige declarar si aparecen menores y, en ese caso, confirmar y referenciar la autorización de su representante. Estos registros documentan la comprobación del integrante que publica; no sustituyen la recepción y revisión de la autorización correspondiente.

Administración y Edición publican o retiran fotografías con identidad y rol comprobados en el servidor. Las imágenes se mantienen privadas como JPEG, sin URL pública de Storage. La interfaz las prepara con un máximo de 1,600 píxeles; el servidor rechaza formatos, dimensiones y metadatos EXIF/IPTC no admitidos. El acceso público utiliza únicamente los servicios de listado e imagen autorizados por la política del portafolio.

La disponibilidad pública termina en el primero de estos límites: 56 días desde la publicación, fin de temporada o vencimiento de la autorización. Cada consulta vuelve a comprobar la vigencia y el retiro deja de permitir el acceso. El registro heredado de portafolio queda cerrado a la consulta directa; un bucket heredado, si existiera, queda privado.

## Disponibilidad y pago de edición

Para tomar un partido, Fotografía necesita disponibilidad confirmada para la semana, fecha y hora correspondientes. Se utiliza la última versión de esa semana y se respetan las suspensiones vigentes. Sin verificación del servidor, la selección permanece bloqueada y ofrece acceso a confirmar el horario. Cambiar la disponibilidad no elimina asignaciones previas.

El servidor también comprueba la disponibilidad al guardar una asignación. La recuperación administrativa de registros históricos conserva su excepción; una cotización aceptada continúa sin asignar automáticamente un fotógrafo.

Los nuevos pagos de edición requieren trabajo concluido y tiempo positivo de una sesión **original** registrada como pausada o expirada. Una sesión activa, una corrección o un tiempo en cero no habilitan el pago. La validación comprende también la edición realizada por Administración; su trabajo fotográfico mantiene el cálculo previo.

Se conservan el cálculo por jugadores y las tarifas aprobadas. El tramo se calcula con los jugadores de los trabajos que cumplen los requisitos de pago; los trabajos sin cronómetro quedan excluidos antes de calcularlo. Los registros de pago ya aprobados mantienen su flujo de aceptación, revisión y liquidación. Los ajustes no duplican descuentos, cobros, reembolsos ni costos.

## Perfil y atención TABI

Administración, Fotografía y Edición disponen de perfil con fotografía y una bandeja compartida de atención. La identidad y los permisos se comprueban en el servidor; cada integrante modifica su propia imagen.

TABI se presenta como asistente virtual. Puede orientar con las respuestas previstas y transferir el seguimiento al equipo. El contacto del visitante, su conversación y su consentimiento se gestionan separados del acceso del equipo. La bandeja mantiene autoría, estado, categorías, reapertura y reintentos; la atención humana pausa las respuestas automáticas correspondientes.

Los visitantes no reciben ni necesitan una cuenta de personal para conversar o acceder mediante una invitación.

## Invitados, fotografías y Tienda

Administración puede registrar carpetas privadas, aprobar contactos, emitir invitaciones individuales y revocar accesos. La invitación se vincula al correo aprobado y a la carpeta autorizada. Los códigos tienen vigencia y límite de intentos; los secretos se verifican mediante sus hashes. El límite de conservación respeta 56 días o el fin de temporada, lo que ocurra primero.

La entrada pública y los enlaces directos a Tienda requieren permiso de invitado. El catálogo y las fotografías autorizadas se consultan a través de los servicios de pruebas; un visitante sin permiso no consulta la colección interna. Las imágenes y los pedidos se vinculan al acceso correspondiente, también al recuperar originales pagados.

La colección del invitado permanece separada de la colección del equipo y de sus registros de sincronización. Entrar, cambiar de invitado o salir no sustituye ni borra las fotografías internas.

El carrito, los tokens de pedido y el permiso invitado se mantienen solo en memoria. Tras recargar, la recuperación exige el folio y el correo del pedido, además de un permiso vigente que corresponda a su carpeta. Una invitación ajena no autoriza recuperar ese pedido.

Cuando Stripe está desactivado y la configuración permite pedidos manuales de fotografías, el servidor verifica el permiso, calcula el importe y evita duplicados. El cliente no decide el precio ni puede enviar fotografías fuera de su acceso.

## Privacidad y límites de esta revisión

- Se conservan los avisos y documentos PDF de privacidad **2.2.6**, incluido el consentimiento independiente de fotografías. Consultarlos o descargarlos no registra una autorización. Los enlaces de STAGING apuntan a esos mismos documentos existentes.
- Se conserva la configuración de **Stripe de pruebas** existente. La función desplegada creó una sesión `cs_test_…` por **$50 MXN** y el pedido quedó en `awaiting_payment`; su consulta confirmó `not_paid`. No se introdujo una tarjeta ni se completó el pago. Esa orden de prueba permanece pendiente hasta su caducidad normal y el procesamiento del evento correspondiente.
- El correo de invitados todavía no está configurado. El acceso disponible para esta revisión utiliza invitaciones marcadas **PRUEBA** y códigos obtenidos por Administración. El envío real de correo requiere configurar y comprobar su transporte.
- Instagram no está integrado. Esta entrega no publica material en redes sociales.
- La validación de interfaz se realizó con HappyDOM. No se ejecutó CUA, no se tomaron capturas y no se completó una revisión visual en un navegador real.
- La suite general `npm test` conserva tres fallos basales heredados. La verificación de esta entrega utiliza el ejecutor específico siguiente y no presenta la suite general como aprobada.

## Servicios de pruebas

Los cambios de base de datos y las funciones se despliegan únicamente en STAGING. Checkout utiliza **`tsi-store-checkout` v6**; soporte, **`tsi-support` v1**; invitados y portafolio, **`tsi-guest-access` v3**.

Las comprobaciones contra los servicios desplegados confirmaron:

- Listado y vistas previas limitados al permiso del invitado, controles CORS y respuestas privadas sin caché.
- Registro de un contacto sintético en TABI, folio, cambio de categoría e historial persistido.
- Rechazo de credenciales de personal inválidas y de la consulta anónima a la colección mediante Data API.
- Revocación efectiva del invitado: el permiso revocado dejó de autorizar cotizaciones y pedidos.
- Cuatro ejecuciones exitosas del trabajador de cron revisado.

El contacto y la conversación sintéticos de TABI se eliminaron al terminar; el acceso invitado de prueba se revocó. La orden Stripe de $50 MXN se conserva en `awaiting_payment` para su caducidad normal; no se alteró a `paid`.

No se incluyen credenciales, secretos, fotografías de clientes ni respaldos con datos personales en estos archivos de entrega.

## Verificación reproducible

Desde la carpeta del repositorio:

```text
node dev-tests/release-230.cjs
```

El ejecutor llama secuencialmente a las suites nuevas de interfaz, reglas, soporte, invitados, portafolio, pedidos manuales, pagos, seguridad de Tienda e integración. Incluye las regresiones de aislamiento, fotojuego, modelo/renderizador/interfaz del reto de edición, servidor e interfaz del podio y entrenamiento de producción. Los transportes reales de Tienda, invitados y portafolio se verifican frente a cambios de cuenta, discrepancias entre la cuenta visible y la identidad de Auth, cambios de permiso y respuestas tardías. Se detiene en el primer fallo y conserva las comprobaciones de roles, datos operativos y separación de producción.

Las pruebas de PostgreSQL son locales y opcionales. Para incluirlas, define `TSI230_PGLITE_MODULE` con la ruta de una instalación local de `@electric-sql/pglite` y ejecuta el mismo comando. Soporte incorpora su prueba SQL dentro de `support-230.cjs`; las suites independientes verifican las reglas de disponibilidad/pago y las migraciones reales de invitados, pedidos, permisos y portafolio. La prueba del portafolio comprueba la vigencia mínima, la autorización del representante, la proyección pública sin referencias privadas y que repetir una publicación no recupere fotos retiradas o purgadas. Sin esa variable, el ejecutor informa explícitamente que PostgreSQL fue omitido.

Las pruebas locales complementan las comprobaciones desplegadas anteriores. Continúan pendientes el transporte real de correo, la introducción de una tarjeta y finalización del pago, la revisión visual en navegador y la evaluación de concurrencia entre trabajadores.
