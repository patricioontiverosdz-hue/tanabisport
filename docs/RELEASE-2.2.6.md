# TSI 2.2.6 · Privacidad y autorización de fotografías

## Alcance y condiciones confirmadas

Añade exclusivamente el aviso de privacidad simplificado al acceso, el aviso integral desde inicio público, acceso y menú, y un formato independiente descargable para uso de fotografías en redes sociales, portafolios y publicidad. Por instrucción del usuario, la parte inferior del inicio muestra únicamente el correo como dato de contacto, sin nombre ni domicilio, junto con la pestaña «Privacidad» para abrir el integral y el acceso al consentimiento. Este panel se identifica como contacto de privacidad; el aviso simplificado completo se mantiene en el acceso. Conserva el acceso «Privacidad» del encabezado. Ambos accesos funcionan sin entrar al acceso del equipo, conforme a las correcciones solicitadas por el usuario en este mismo lanzamiento 2.2.6. Mantiene los campos y acciones de autenticación, el diseño, permisos y módulos anteriores.

Responsable: Patricio Ontiveros Díaz / Tanabi Sports. Domicilio confirmado por el usuario: Scouts 681, Ciudad Ideal, San Nicolás de los Garza, Nuevo León, C. P. 66490, México. Contacto: Datrilagency@gmail.com.

- Galería pública: máximo ocho semanas (56 días) desde publicación o final de temporada, lo primero; retiro y eliminación cuando legalmente proceda, respetando conservación legal.
- Redes sociales autorizadas: sin plazo fijo, sujetas a solicitudes de retiro y obligaciones legales; consentimiento revocable.
- Publicidad: decisión específica independiente; canales, campaña y plazo por completar. Negarla excluye anuncios/campañas aunque se autorice difusión orgánica.
- Menores: representación legal válida y protección de sus derechos e interés superior.
- Proveedor confirmado por código: Supabase (Auth, REST y Storage) en producción `tantlgswituiwkxfgmsr`; GitHub Pages aloja la aplicación y Google Fonts sirve las tipografías. También pueden intervenir plataformas externas según el uso. No se afirma ausencia de terceros.

Consultar, iniciar sesión o descargar el formato no otorga autorización. El formato se descarga en PDF con el logo actual de Tanabi Sports y la marca de agua TS en todas sus páginas. Debe completarse, firmarse, recibirse y conservarse antes del uso autorizado. No se añade un sistema de registro de consentimientos ni automatización de cierre o eliminación de fotografías. Las obligaciones documentales requieren atención operativa; no se promete borrado automático ni eliminación de copias independientes de terceros.

## Arquitectura y aislamiento

Base exacta: `1d519e3974ea5a6e3a7f8003341224c615aeeea1`, HTML Git `03899481f6e81335faf797b2f18162dd8d4f0477`. El módulo `assets/tsi-226-privacy.js` solo presenta documentos en un diálogo fuera de `#app` y descarga el formato localmente. No hace solicitudes de red ni escribe almacenamiento. Sus estilos están limitados a clases propias y usan los temas existentes.

Ocho transformaciones en el HTML: título, icono TS de la pestaña del navegador, `APP_VERSION`, carga CSS/JS y cuatro puntos de acceso (encabezado y pie del inicio público, login y menú). El icono reutiliza `assets/favicon-ts.svg`, ya existente y usado en staging, con una referencia propia de producción `?v=2.2.6`. `scripts/prepare-release-226.cjs` exige la base exacta; `dev-tests/release-226.cjs` invierte esos cambios y comprueba que el resto del HTML es idéntico. Los recursos existentes, staging, servidor, sesiones, CSP y funciones permanecen intactos. No hay migraciones, modificaciones de Supabase ni promoción de la tienda/Stripe de staging. La etiqueta de caché `226-contact` fuerza la actualización del panel de contacto al pie; el PDF mantiene su contenido y URL versionada.

El PDF estático `assets/Tanabi-Sports-consentimiento-fotografias-2.2.6.pdf` se genera con `scripts/build-consent-pdf.py` a partir del texto de consentimiento existente. El logo principal procede de `LOGO` en `index.html` y la marca TS del PNG incorporado en `assets/favicon-ts.svg`; no se sustituyen por logos inventados. La descarga usa un enlace al mismo sitio con atributo `download`, sin recopilar datos ni registrar autorización.

## Verificación

- `node dev-tests/release-226.cjs`: versión, reversión exacta de los ocho cambios, sintaxis y recursos/aislamiento.
- `node dev-tests/privacy-226.cjs`: página completa con servidor simulado; solo correo como dato de contacto al pie, sin nombre ni domicilio; consulta desde encabezado y pie sin sesión ni cambio de página; aviso simplificado completo en los tres modos de acceso y documentos completos en menú de administración, fotografía y edición; foco, cierre, conservación de campos/estado/sesión/red; descarga sin consentimiento implícito y condiciones jurídicas.
- Regresiones aprobadas: modelo 2.1.0, avisos 2.0.9, push, aislamiento, disponibilidad de edición en ambos entornos, temporadas/directorio 2.2.2, acceso/carga de tienda, opciones de vista previa, suspensiones en ambos entornos, coincidencias de Importar rol y entrenamiento de producción.
- `npm test` no aprueba globalmente: `ui-210.cjs:69` falla en `new-cost[data-mid="m1"]`. Al ejecutar las demás pruebas separadamente también fallan `partial-matches.cjs:25` (2 frente a 1) y `partial-matches-import.cjs:36` (propiedad `method`). Los tres fallos se reprodujeron idénticos sobre una exportación de la base exacta anterior a privacidad; no se modifican módulos ni pruebas heredadas para ocultarlos.
- Revisión visual no completada: el navegador denegó acceso a la vista local. No se intentó otra vía de navegación. Las verificaciones de interfaz usan DOM simulado; no equivalen a capturas o prueba visual real.
- HTTPS previo al lanzamiento: `node scripts/verify-release-226.cjs --baseline` aprobó HTML 2.2.5, los recursos actuales de producción y HTML de staging por huellas exactas.
- PDF: tres páginas carta; las 42 líneas no vacías del consentimiento coinciden con el texto canónico. El logo principal y la marca TS al 4.8% aparecen en todas las páginas. Validado con pypdf en modo estricto, Poppler y revisión visual de las tres páginas, sin recortes ni superposiciones. Dos generaciones producen bytes idénticos. No contiene JavaScript, formularios electrónicos, cifrado ni autorizaciones registradas. La interfaz descarga el archivo PDF real del mismo sitio; la verificación HTTPS también comprueba su tipo de contenido y huella binaria.

Las huellas de los archivos que debe servir Pages están en `docs/tsi226-artifacts.json`. Los recursos antiguos y staging no cambian.

## Publicación autorizada

La autorización de implementación y despliegue está recibida. Después de revisar el PR preparado, el usuario autorizó expresamente el **6 de noviembre de 2026 publicar ahora como excepción** a la regla de las 00:00 de `AGENTS.md`. Su respuesta fue: «Sí, publicar ahora como excepción». Esta excepción se limita a TSI 2.2.6; no cambia el horario general de lanzamientos futuros. La programación automática no se creó: tanto creación como propuesta fueron rechazadas porque la herramienta exige aprobación y la sesión no puede solicitarla. Se continúa con la publicación inmediata expresamente autorizada.

1. Leer `AGENTS.md` y este documento del commit fijado; comprobar la excepción expresa anterior y registrar la hora de la publicación. El horario general no limita este lanzamiento por la instrucción actual del usuario.
2. Reconfirmar base `main`, head del PR y sus archivos. Ante deriva, conflicto, cambios de alcance o fallos nuevos, detener sin forzar referencias ni sobrescribir trabajo. La autorización no permite integrar otras ramas.
3. No ejecutar migraciones ni modificar Supabase, datos operativos o configuraciones. Este lanzamiento no necesita cambios de backend.
4. Fusionar exclusivamente el PR de privacidad con `expected_head_sha` fijado y método `merge`. Si ya se fusionó, verificar el merge antes de repetir.
5. Esperar la finalización correcta de `pages build and deployment` para el SHA resultante. No declarar éxito por la sola fusión.
6. Ejecutar `node scripts/verify-release-226.cjs` sin `--baseline`. Comprueba por HTTPS con caché evitada el HTML 2.2.6, recursos exactos, documentos y staging intacto. Si el entorno local no está disponible, recuperar los archivos del commit fijado mediante GitHub en un directorio temporal y ejecutar el mismo verificador, o comparar las mismas huellas con lectura HTTPS equivalente.
7. Informar en este chat la versión real, enlace y resultado, distinguiendo cualquier límite de verificación. Desactivar la continuación programada al completar o requerir intervención. No enviar mensajes/correos a terceros.

## Recuperación

Si el cambio de privacidad provoca un fallo de producción, crear un commit nuevo sobre el tip verificado que restaure exclusivamente `index.html` al blob base `03899481f6e81335faf797b2f18162dd8d4f0477` y versiones de paquete/lock a 2.2.5. Conservar módulos, datos, staging e historial; los dos recursos nuevos pueden permanecer sin referencias. No usar reset ni force-push. Verificar Pages y bytes HTTPS tras la recuperación. Una falla heredada documentada no justifica revertir datos ni cambiar otros módulos.

## Fuentes jurídicas primarias revisadas

- [Ley Federal de Protección de Datos Personales en Posesión de los Particulares](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf), avisos y ARCO, texto vigente con reforma 14-11-2025.
- [Ley General de los Derechos de Niñas, Niños y Adolescentes](https://www.diputados.gob.mx/LeyesBiblio/pdf/LGDNNA.pdf), privacidad y derechos de imagen, reforma 15-01-2026.
- [Ley Federal del Derecho de Autor](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFDA.pdf), artículos 86 y 87.
- [Reglamento de la LFPDPPP](https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.pdf), consentimiento y revocación en lo aplicable.
- [Lineamientos del Aviso de Privacidad](https://sidof.segob.gob.mx/notas/docFuente/5284966), contenido y presentación, en lo compatible con la ley vigente.
