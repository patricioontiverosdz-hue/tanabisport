/* TSI 2.2.6: documentos informativos; no recoge ni registra consentimientos. */
(function () {
  'use strict';
  var VERSION = '2.2.6';
  var RESPONSIBLE = 'Patricio Ontiveros Díaz, quien opera como Tanabi Sports';
  var ADDRESS = 'Scouts 681, Ciudad Ideal, San Nicolás de los Garza, Nuevo León, C. P. 66490, México';
  var EMAIL = 'Datrilagency@gmail.com';
  var contact = '<a href="mailto:' + EMAIL + '">' + EMAIL + '</a>';
  var identity = '<p><strong>Responsable:</strong> ' + RESPONSIBLE + '.<br><strong>Domicilio:</strong> ' + ADDRESS + '.<br><strong>Contacto de privacidad:</strong> ' + contact + '.</p>';
  var gallery = '<p>Las fotografías autorizadas para exhibición y venta en la Tienda permanecerán disponibles como máximo ocho semanas (56 días) desde su publicación o hasta el final de la temporada deportiva correspondiente, <strong>lo que ocurra primero</strong>. Al llegar ese límite, Tanabi Sports deberá cerrar la galería o retirar las fotografías cuyo plazo haya vencido y eliminarlas de los sistemas bajo su control cuando legalmente proceda, respetando las obligaciones de conservación aplicables.</p>';
  var social = '<p>El uso de fotografías identificables en redes sociales oficiales, portafolios y publicidad o promoción comercial requiere una <strong>autorización específica e independiente</strong> de la cobertura y de la exhibición o venta en galerías públicas. Negarse no impide contratar el servicio ni acceder a TSI. Las fotografías autorizadas en redes sociales podrán permanecer <strong>sin plazo fijo, sujetas a solicitudes de retiro y obligaciones legales</strong>. La autorización es revocable; no permite conservar imágenes sin una finalidad legítima.</p>';
  var minors = '<p>Para imágenes de niñas, niños y adolescentes se requiere autorización legalmente válida de quien tenga facultades para representarlos, respetando su interés superior, privacidad, dignidad y opinión según su edad y madurez. La contratación por un equipo, entrenador o familiar no acredita por sí sola la representación de todas las personas fotografiadas.</p>';
  var requests = '<p>Para limitar el uso o divulgación, negar finalidades secundarias, solicitar retiro de imágenes, revocar el consentimiento o ejercer los derechos de acceso, rectificación, cancelación u oposición (ARCO), escribe a ' + contact + '. La revocación no tiene efectos retroactivos y puede estar sujeta a obligaciones legales de conservación.</p>';
  var simplified = '<p><strong>Contacto de privacidad:</strong> ' + contact + '.</p>' +
    '<p>Tratamos datos de identificación y contacto, cuenta y autenticación, actividad y disponibilidad del equipo, coberturas, pagos y fotografías identificables, según el servicio o relación con Tanabi Sports. No se solicitan datos personales sensibles para iniciar sesión.</p>' +
    '<p><strong>Finalidades necesarias:</strong> gestionar cuentas y acceso, coordinar al equipo y sus coberturas, atender servicios, entregas, pagos y solicitudes, y cumplir obligaciones legales. La exhibición y venta de fotografías en galerías públicas requiere las autorizaciones correspondientes.</p>' +
    '<p><strong>Finalidades secundarias y opcionales:</strong> usar imágenes en redes sociales, portafolios, publicidad y promoción, solo con autorización independiente. Puedes negarte sin afectar el servicio.</p>' +
    '<p>Tienda: máximo 56 días desde publicación o fin de temporada, lo primero. Portafolio e Inicio: sin vencimiento automático, con retiro manual. Redes sociales autorizadas: sin plazo fijo, sujetas a retiro y obligaciones legales. Menores: representación legal válida.</p>' +
    '<p>Intervienen proveedores tecnológicos, entre ellos Supabase, GitHub Pages y Google Fonts. Consulta el integral para conocer el tratamiento y las plataformas externas.</p>' + requests;
  var integral = identity +
    '<h3>1. Datos y finalidades necesarias</h3><p>Según tu relación con Tanabi Sports, tratamos nombre y datos de contacto; datos de cuenta y autenticación; rol, actividad, disponibilidad y asignaciones del equipo; información de coberturas, clientes, entregas y solicitudes; registros de pagos, gastos y comprobantes; fotografías y otros archivos que nos proporciones o que obtengamos durante coberturas autorizadas. El acceso no requiere datos personales sensibles. Los datos financieros o patrimoniales que requieran consentimiento expreso se tratarán con esa autorización o al amparo de una excepción legal aplicable.</p>' +
    '<p>Estos datos se utilizan para crear y administrar cuentas, autenticar el acceso, coordinar coberturas y edición, gestionar la relación con integrantes y clientes, registrar operaciones y pagos, entregar servicios, atender solicitudes, proteger el sistema y cumplir obligaciones legales. Solo el personal autorizado debe acceder a los datos necesarios para sus funciones.</p>' +
    '<h3>2. Fotografías y galerías públicas</h3><p>La captación, selección, edición, exhibición y comercialización de fotografías exige las autorizaciones legalmente necesarias. Una galería pública permite que otras personas vean las imágenes; la autorización para esa exhibición y venta debe documentarse por separado del uso promocional.</p>' + gallery +
    '<p>Los registros de operaciones, autorizaciones y evidencia que deban conservarse por obligaciones legales o para atender responsabilidades se mantendrán únicamente durante el plazo aplicable y con las restricciones correspondientes. Esta política de retiro no implica que exista un borrado automático ni garantiza eliminar copias obtenidas independientemente por terceros.</p>' +
    '<h3>3. Finalidades secundarias: redes sociales y publicidad</h3>' + social +
    '<p>La autorización deberá identificar a la persona, las imágenes o cobertura, los canales y usos permitidos. El plazo o campaña de publicidad se precisará en el consentimiento. Consultar este aviso, crear una cuenta, iniciar sesión o descargar el formato no equivale a autorizar el uso de imágenes. Tanabi Sports debe recibir y conservar la autorización antes de realizar esos usos.</p>' +
    '<h3>4. Niñas, niños y adolescentes</h3>' + minors +
    '<h3>5. Proveedores, plataformas y transferencias</h3><p>La versión de producción de TSI utiliza <strong>Supabase para autenticación, base de datos y almacenamiento de archivos</strong>; GitHub Pages aloja la aplicación y Google Fonts sirve las tipografías. Estos servicios pueden tratar datos técnicos de conexión y, conforme a su función, los datos que se almacenan o transmiten, incluso mediante infraestructura fuera de México. La intervención de proveedores sujetos a instrucciones y obligaciones de confidencialidad se distingue de las transferencias a terceros que deciden sus propias finalidades.</p>' +
    '<p>Al usar enlaces o servicios externos, como mapas, calendarios, almacenamiento compartido, mensajería o transmisiones, se aplican también las políticas del proveedor elegido. La publicación autorizada en redes sociales implica tratamiento por las plataformas correspondientes conforme a sus propias políticas. Tanabi Sports atenderá el retiro de publicaciones y cuentas bajo su control, sin garantizar la eliminación de copias difundidas de forma independiente por terceros.</p>' +
    '<p>Cualquier transferencia que requiera consentimiento se informará con sus destinatarios y finalidades, y se realizará con la autorización correspondiente, salvo excepción legal. Este aviso no constituye un consentimiento general para transferencias ni para publicidad.</p>' +
    '<h3>6. ARCO, revocación, negativa y retiro</h3>' + requests +
    '<p>Indica tu nombre y un medio para responder; el derecho o solicitud concreta; los datos o imágenes involucrados y elementos para localizarlos (por ejemplo, cobertura, fecha o enlace). Deberás acreditar tu identidad y, en su caso, la representación legal mediante un medio adecuado. Para rectificación, indica la corrección solicitada y la documentación que la sustenta. Tanabi Sports te indicará cómo acreditar la solicitud sin divulgar documentos públicamente.</p>' +
    '<p>La determinación de una solicitud ARCO se comunicará dentro de 20 días hábiles desde su recepción y, si procede, se hará efectiva dentro de los 15 días hábiles siguientes a la comunicación. Los plazos podrán ampliarse una sola vez por un periodo igual cuando exista justificación, conforme a la ley. La atención es gratuita, salvo los costos de reproducción o envío permitidos legalmente. Las solicitudes de retiro y revocación se atenderán conforme a la normativa y las obligaciones aplicables.</p>' +
    '<h3>7. Almacenamiento en el dispositivo y seguridad</h3><p>TSI utiliza almacenamiento local del navegador para mantener la sesión, preferencias y, según la función, borradores o información operativa. Al entrar se envían credenciales al servicio de autenticación. El cierre de sesión y las opciones del navegador permiten gestionar el almacenamiento local; eliminarlo puede cerrar la sesión o descartar borradores. Tanabi Sports debe aplicar medidas administrativas, técnicas y físicas adecuadas para proteger los datos.</p>' +
    '<h3>8. Cambios y consulta</h3><p>Las actualizaciones se comunicarán mediante este aviso, disponible desde el inicio de sesión y el menú de TSI, con su versión y fecha de revisión. Si un cambio requiere una nueva autorización, se solicitará antes del tratamiento correspondiente. Puedes pedir una copia en ' + contact + '.</p>';
  var consentText = [
    'TANABI SPORTS · CONSENTIMIENTO INDEPENDIENTE PARA USO DE IMAGEN',
    'Versión 2.2.6 · Revisión: 6 de noviembre de 2026',
    '',
    'Responsable: ' + RESPONSIBLE + '.',
    'Domicilio: ' + ADDRESS + '.',
    'Contacto: ' + EMAIL,
    '',
    'FORMATO PARA COMPLETAR Y FIRMAR. Su descarga o consulta no registra una autorización. Tanabi Sports debe recibir y conservar el documento efectivamente otorgado antes de usar las imágenes.',
    '',
    'Persona cuya imagen se autoriza: __________________________________',
    'Persona que otorga la autorización (si es distinta): _______________',
    'Carácter y facultades de representación: __________________________',
    'Medio de contacto para atender esta autorización: _________________',
    'Cobertura, fecha, temporada e imágenes identificadas: ______________',
    '_________________________________________________________________',
    '',
    'DECISIÓN EXPRESA. Marcar una opción en cada apartado. Una opción en blanco no autoriza ese uso.',
    '',
    '1. Redes sociales oficiales y portafolios digitales de Tanabi Sports:',
    '[ ] AUTORIZO  [ ] NO AUTORIZO',
    'Cuentas, plataformas o portafolios autorizados: ____________________',
    'Finalidad: difusión orgánica de la cobertura y muestra del trabajo en el portafolio mediante las imágenes identificadas. Este apartado excluye campañas, anuncios y los usos publicitarios del apartado 2.',
    'En redes sociales, las imágenes autorizadas podrán permanecer sin plazo fijo, sujetas a solicitudes de retiro y obligaciones legales. No es una autorización irrevocable. En otros portafolios, el plazo autorizado es: _______________________________.',
    '',
    '2. Publicidad y promoción comercial de Tanabi Sports:',
    '[ ] AUTORIZO  [ ] NO AUTORIZO',
    'Campaña, medios, cuentas y usos publicitarios autorizados: _________',
    '_________________________________________________________________',
    'Plazo de la campaña o uso publicitario autorizado: _________________',
    'Si se autoriza publicidad en redes sociales sin plazo fijo, indicarlo expresamente aquí: ___________________________________________.',
    '',
    'ALCANCE Y CONDICIONES',
    'Autorizo únicamente los usos marcados y descritos, respecto de las imágenes identificadas. Negar el apartado 2 excluye campañas, anuncios y promoción comercial específica, aunque se autorice el apartado 1. No se permiten usos que lesionen la dignidad, privacidad o derechos de la persona retratada.',
    'Esta decisión es independiente de la contratación de la cobertura, del acceso a TSI y de la autorización de exhibición o venta en galerías públicas. Negarme no impide recibir el servicio. No autoriza otras finalidades ni a representar a otras personas.',
    'Las galerías de la Tienda, si cuentan con autorización separada, duran como máximo ocho semanas (56 días) desde publicación o hasta finalizar la temporada, lo que ocurra primero. Al llegar ese límite deben cerrarse o retirarse las imágenes vencidas y eliminarse cuando legalmente proceda, respetando obligaciones de conservación.',
    'Puedo solicitar retiro, revocar el consentimiento o ejercer ARCO mediante ' + EMAIL + ', identificando las imágenes y acreditando mi identidad o representación. La revocación no tiene efectos retroactivos y se atenderá con las obligaciones legales aplicables.',
    'Las plataformas externas tratan las publicaciones conforme a sus políticas. Tanabi Sports atenderá el retiro de sus publicaciones y cuentas bajo su control, sin garantizar la eliminación de copias difundidas independientemente por terceros.',
    '',
    'MENORES DE EDAD',
    'Cuando la imagen corresponda a una persona menor de edad, quien firma debe acreditar facultades legalmente válidas para representarla. Se respetarán su interés superior, privacidad, dignidad y opinión según su edad y madurez. Ser contratante, entrenador o familiar no acredita por sí solo esas facultades. No publicar mientras falte una autorización válida.',
    'Nombre del representante facultado: _______________________________',
    'Forma en que se acreditaron las facultades (sin adjuntar documentos en lugares públicos): ______________________________________________',
    'Opinión de la persona menor según edad y madurez: _________________',
    '',
    'Confirmo que pude consultar el Aviso de Privacidad Integral, comprender este documento y elegir libremente los usos que autorizo.',
    'Lugar y fecha: __________________________________________________',
    'Nombre y firma de titular o representante facultado: ______________',
    '_________________________________________________________________',
    'Recepción por Tanabi Sports y referencia de conservación: __________',
    '_________________________________________________________________',
    '',
    'Entregar una copia a la persona que autoriza y conservar la autorización y su alcance. No usar imágenes mientras falten identificación, facultades, usos, canales, plazos aplicables o firma.'
  ].join('\n');
  function escapeHTML(value) { return value.replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function button(kind, label) { return '<button type="button" class="btn small" data-privacy="' + kind + '">' + label + '</button>'; }
  function summaryHTML(home) {
    if (home === true) return '<section class="tsi-privacy-summary" aria-labelledby="tsi-privacy-contact-title"><h3 id="tsi-privacy-contact-title">Contacto de privacidad</h3><p>' + contact + '</p><div class="tsi-privacy-actions">' + button('simplified', 'Privacidad') + button('consent', 'Consentimiento de fotografías') + '</div></section>';
    return '<section class="tsi-privacy-summary" aria-labelledby="tsi-privacy-summary-title"><h3 id="tsi-privacy-summary-title">Aviso de privacidad simplificado</h3>' + simplified + '<div class="tsi-privacy-actions">' + button('simplified', 'Privacidad y documentos PDF') + button('consent', 'Consentimiento de fotografías') + '</div><p class="hint">Versión ' + VERSION + ' · Revisión: 6 de noviembre de 2026.</p></section>';
  }
  function menuHTML() { return '<h3>Privacidad</h3><button type="button" data-privacy="simplified">Privacidad y documentos PDF</button><button type="button" data-privacy="consent">Consentimiento de fotografías</button>'; }
  var dialog = null, opener = null;
  function close() {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    if (opener && opener.isConnected) opener.focus();
  }
  function open(kind, source) {
    if (kind !== 'simplified' && kind !== 'consent') return;
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'tsi-privacy-dialog'; dialog.className = 'tsi-privacy-dialog';
      dialog.setAttribute('aria-labelledby', 'tsi-privacy-title');
      document.body.appendChild(dialog);
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
      dialog.addEventListener('close', function () { if (opener && opener.isConnected) opener.focus(); });
    }
    if (source && !dialog.contains(source)) opener = source;
    var consent = kind === 'consent';
    dialog.innerHTML = '<div class="tsi-privacy-header"><h2 id="tsi-privacy-title" tabindex="-1">' + (consent ? 'Consentimiento independiente de fotografías' : 'Aviso de privacidad simplificado') + '</h2><button type="button" class="btn small" data-privacy="close" aria-label="Cerrar documento de privacidad">Cerrar</button></div><p class="hint">Tanabi Sports · Versión ' + VERSION + ' · Revisión: 6 de noviembre de 2026.</p><div class="tsi-privacy-document">' + (consent ? '<p class="note">Completa y firma este formato. Descargarlo no registra tu consentimiento. Tanabi Sports deberá recibir y conservar la autorización antes de usar las imágenes.</p><pre class="tsi-privacy-consent">' + escapeHTML(consentText) + '</pre>' : simplified) + '</div><div class="tsi-privacy-actions">' + (consent ? button('download', 'Descargar autorización (PDF)') + button('simplified', 'Volver a Privacidad') : button('download-consent', 'Descargar autorización (PDF)') + button('download-integral', 'Descargar aviso integral (PDF)')) + button('close', 'Cerrar') + '</div>';
    if (!dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
    dialog.scrollTop = 0; dialog.querySelector('h2').focus();
  }
  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-privacy]'); if (!target) return;
    var action = target.getAttribute('data-privacy');
    if (action === 'close') close();
    else if (action === 'download' || action === 'download-consent' || action === 'download-integral') {
      var filename = action === 'download-integral' ? 'Tanabi-Sports-aviso-privacidad-integral-2.2.6.pdf' : 'Tanabi-Sports-consentimiento-fotografias-2.2.6.pdf';
      var link = document.createElement('a'); link.href = '../assets/' + filename + '?v=226-docs'; link.download = filename; link.type = 'application/pdf';
      document.body.appendChild(link); link.click(); link.remove();
    } else open(action, target);
  });
  // Evita que Escape cierre también el menú que permanece detrás del documento.
  document.addEventListener('keydown', function (event) { if (dialog && dialog.open && event.key === 'Escape') event.stopPropagation(); }, true);
  window.TSIPrivacy = Object.freeze({version:VERSION, summaryHTML:summaryHTML, menuHTML:menuHTML});
})();
