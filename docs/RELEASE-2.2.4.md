# TSI 2.2.4 · Validación en staging

Esta publicación es exclusivamente de pruebas, solicitada por Patricio para validar antes de producción. `index.html` de producción conserva exactamente la versión 2.2.3 del commit `995bb4f90464ddbb9571d448d3e7a0927c92d546`; su blob es `29822ba11d6b1665a0422a348946ee497b757e81`. El paquete raíz sigue en 2.2.3 y `staging/version.json` identifica 2.2.4.

## Cambios para validar

- En Tienda, administración y editora pueden activar y desactivar Blanco y negro, Movimiento nítido y Marca de agua para todas las fotos. Los ajustes se guardan con el botón «Guardar y aplicar a toda la tienda».
- La marca puede ser la de Tanabi o un PNG/JPEG propio de hasta 5 MB. Se normaliza a PNG y se graba en las miniaturas publicadas.
- El movimiento deja nítido un tercio de la imagen y difumina los otros dos. Tiene pausa y respeta la preferencia de movimiento reducido del navegador.
- Las nuevas cargas conservan una copia de trabajo privada y reducida a 720 píxeles. El cliente recibe solamente la miniatura publicada; no se carga el original a la tienda.
- Las fotos antiguas conservan el blanco y negro y la marca ya grabados. Para recuperar color o retirar esa marca se ofrece reemplazar la foto, conservando su carpeta, título y precio.
- El favicon utiliza el monograma TS aprobado, con exportación de 192 píxeles en SVG y respaldo PNG de 32 píxeles. Los demás usos del logotipo se conservan.

## Permisos y guardado

La migración `20261026222548_tsi224_shop_preview.sql` agrega ajustes, fuentes privadas, comprobación de versiones y reintentos idempotentes. Solo administración y editora pueden gestionar esta función. No amplía el acceso de editora a `settings/cfg`, precios o pedidos. Los cambios globales regeneran todas las miniaturas antes de guardar en una sola transacción. Las fuentes privadas forman parte del respaldo cifrado existente.

La migración se aplica únicamente al proyecto de staging `nksqpoigywfegcbvfhoa`. No se han cambiado datos ni esquema del proyecto de producción `tantlgswituiwkxfgmsr`.

## Validación técnica

- `npm test` y `npm run test:production-training` aprobados en el checkout de staging: producción 2.2.3 y staging 2.2.4.
- Pruebas de opciones globales, marca propia, procesamiento de píxeles, cargas, reemplazos, roles, privacidad, conflictos y cambios de sesión con servidor simulado.
- Prueba SQL sobre staging real, con identidades sintéticas y reversión completa: permisos, versiones, idempotencia, atomicidad, fuentes privadas y conservación de metadatos. No quedan cuentas, fotos ni recibos de prueba.
- Revisión de Supabase posterior a la migración sin observaciones nuevas para los objetos de 2.2.4.

## Paso posterior a producción

Primero validar esta versión en staging. La promoción de producción debe comenzar a las 00:00 de `America/Monterrey`, conforme a `AGENTS.md`; no hay una excepción autorizada para 2.2.4. En ese momento aplicar la misma migración al proyecto de producción, repetir las verificaciones de permisos, actualizar el HTML y la versión del paquete de producción y comprobar el despliegue servido. La publicación en staging no programa ni adelanta por sí misma esa promoción.

## Reversión de pruebas

Restaurar el HTML de staging y los archivos de esta entrega desde el commit base. Mantener las fuentes privadas y los ajustes evita perder la capacidad de reprocesar las nuevas fotos; su acceso permanece protegido. No borrar fuentes para revertir un cambio visual.
