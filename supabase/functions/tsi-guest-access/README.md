# Invitados 2.3.0 — staging

Solo `nksqpoigywfegcbvfhoa`. El handler rechaza cualquier otro proyecto, incluido producción. Esta carpeta no contiene credenciales, datos reales ni transporte de correo inventado.

## Permiso y retención

- No se llama a signup, signInWithOtp, Auth anonymous ni se crea ningún usuario cliente.
- Administración existente se verifica mediante `/auth/v1/user`; cada comando consulta el rol actual de `profiles`, sin confiar en `user_metadata`.
- Cada carpeta recibe UUID, nombre inmutable, fin de temporada obligatorio y vencimiento `min(creación + 56 días, fin temporada)`. No hay operación para ampliar caducidad.
- Se vinculan los IDs actuales de fotos. Subir otra foto con el mismo texto de carpeta no la autoriza automáticamente: administración debe usar “Autorizar fotos nuevas”. Mover una foto a otro texto de carpeta invalida su permiso anterior.
- Contactos aprobados, de tipo jugador/familiar, se ligan a una carpeta. Las invitaciones individuales duran como máximo siete días y nunca rebasan el vencimiento de galería.
- La sesión opaca de 256 bits dura como máximo dos horas y no se renueva. Invitación, contacto, carpeta o sesión revocados invalidan la siguiente operación.
- La lectura anónima de `shop_items` se revoca. Una política restrictiva conserva lectura directa únicamente para administración/editora; invitados usan Edge. Todos los objetos guest tienen RLS y acceso únicamente `service_role`.
- El catálogo devuelve metadatos, nunca imágenes; cada preview exige una nueva verificación. No se crean URLs firmadas. El endpoint `original` falla cerrado: entrega requiere además autorización del pedido; Edge de entrega puede usar el RPC de catálogo con `original=true` solo tras validar pedido + permiso vigente.
- `tsi230-guest-retention` ejecuta limpieza cada minuto en pg_cron: elimina fuentes y previews vencidos. El acceso vence exactamente a la fecha; el borrado físico ocurre en la siguiente ejecución (hasta un minuto después). Credenciales temporales y contactos de galerías vencidas se purgan al día siguiente. Los registros de cron no llevan tokens ni PII.

## Correo y pruebas

No se confirmó transporte existente de correo. `index.ts` no incluye adaptador y `email_ready=false`; tanto solicitud de OTP como invitación normal fallan cerradas. Configurar SMTP de Supabase Auth no habilita este flujo porque eso crearía o utilizaría cuentas de clientes.

El handler admite un adaptador exclusivamente del servidor `sendEmail({to,code,expiresMinutes})` junto con `emailConfigured:true` y `background:task=>EdgeRuntime.waitUntil(task)`; conectarlo únicamente a transporte existente y autorizado. No usa proveedor específico ni envía correo durante estas pruebas. El envío ocurre en segundo plano para que su latencia no revele si un correo está aprobado. La respuesta pública de OTP tiene la misma forma para un contacto válido o desconocido y nunca incluye código.

Los códigos de prueba están habilitados por defecto únicamente en el proyecto aislado de staging; no se necesita otro secreto. `TSI_GUEST_TEST_MODE=false` los deshabilita expresamente. Un administrador crea una invitación marcada **PRUEBA** y obtiene `challenge_id` + código mediante `admin-test-code`. Solo esa respuesta autenticada contiene el código. El panel lo identifica expresamente como prueba sin correo y no construye enlaces con secretos.

Tokens de invitación/sesión: SHA-256. OTP: HMAC-SHA-256 con secreto de servidor y UUID de challenge; no se almacena texto claro. OTP dura cinco minutos, tiene cinco intentos y consumo atómico con bloqueo de fila. Límites durables por IP pseudonimizada diaria, identidad y acción. Los secretos no se aceptan por URL ni se escriben a logs.

## API

`POST /functions/v1/tsi-guest-access`, cuerpo JSON, Origin permitido `https://patricioontiverosdz-hue.github.io`. Todas las respuestas llevan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. Desplegar con `verify_jwt=false` porque el token invitado no es JWT; el handler autentica cada operación por su propia vía.

| action | Datos / autorización |
| --- | --- |
| `config` | Estado global de correo y prueba; no PII |
| `request` | `invitation`, `email`; entrega OTP si transporte habilitado e identidad aprobada |
| `verify` | `challenge_id`, `code`; devuelve sesión opaca una sola vez |
| `status`, `list`, `logout` | Header `x-tsi-guest-token` |
| `preview` | Header + `id`, comprobado dentro de carpeta |
| `validate` | Header + `ids:[]`; incluso lista vacía exige sesión vigente |
| `original` | Falla cerrado hasta entrega autorizada de pedido |
| `admin` | JWT administrador + `operation`, `payload` |
| `admin-test-code` | JWT administrador + `invitation_id`; exige modo PRUEBA habilitado |

Operaciones admin: `state`, `folder-create {label,season_end}`, `folder-sync {folder_id}`, `contact-create {folder_id,name,email,relationship,approved:true}`, `invite-create {contact_id,expires_at,test_mode:boolean}`, `revoke {kind:'folder'|'contact'|'invitation'|'session',id}`.

## Contrato de UI y checkout

`window.TSI230Guest.install({state,me,server,publicKey,accessToken,render,onAuthorized,onCleared})` o `edge(body,guestToken)` inyectado. Métodos: `open`, `ensureAccess`, `authorized`, `token`, `status`, `list`, `preview`, `loadShop`, `logout`, `clear`, `openAdmin`, `adminPanel`. `loadShop` usa únicamente endpoints scoped y llena `state.shop.items`. Tokens solo en memoria; cancelar modal invalida respuestas tardías; al revocar/caducar se vacían fotos. Eventos `tsi230:guest-authorized` y `tsi230:guest-cleared` no incluyen credenciales. `ensureAccess()` verifica de nuevo una sesión existente.

Checkout puede importar `validateGuestItems(token, ids, {rpc,crypto})` del handler o llamar `tsi230_guest_verify_items(session_hash text,item_ids text[])` usando service role. Hash es SHA-256 del header de sesión. El RPC rechaza IDs ajenos, repetidos o movidos, y exige sesión + carpeta vigentes aun con `[]`. Aplicarlo antes de cotizar/preparar y al entregar. No usar un folder_id del navegador como autorización.

La migración adicional `20261107025824_tsi230_store_guest_binding.sql` liga pedidos nuevos al ID opaco del contacto en `tsi230_guest_private.order_contacts`. No duplica correo ni access_hash. Mantiene las órdenes históricas y rechaza reclamarlas desde el portal invitado si no tienen binding. Cierra además SELECT anon de productos/variantes/config y revoca quote/prepare antiguos de anon/authenticated, conservando service_role. La lectura directa autenticada de catálogo exige admin/editora mediante políticas restrictivas.

- `tsi230_store_prepare_guest(session_hash text,request_id uuid,access_hash text,cart jsonb,email text,phone text) -> jsonb`: mismo shape de checkout anterior; verifica sesión y todas las fotos, aun carrito solo variantes, correo de compra igual al correo aprobado. Toma el lock existente de tienda, bloquea filas de permiso/fotos y crea binding en la misma transacción. Un reintento pertenece al mismo contacto; otro contacto no puede aprovechar un request/token compartido por el navegador.
- `tsi230_store_guest_order_allowed(session_hash text,order_id uuid) -> boolean`: sesión y ámbito actuales, todas las fotos del pedido todavía autorizadas y contacto coincidente. No reemplaza la comprobación adicional del access_hash de pedido.
- `tsi230_store_guest_photo(session_hash text,order_id uuid,access_hash text,item_id text) -> jsonb`: exige el binding anterior, estado `paid`, foto incluida en items y permiso actual. Si access_hash se proporciona, debe ser correcto. NULL permite recuperación en otro navegador solo después de verificar sesión de invitado y mismo contacto aprobado vinculado al pedido; UUID solo nunca es suficiente. Devuelve `{allowed:true,image,expires_at}` con JPEG fuente; ninguna URL pública. El Edge de entrega debe responder sin caché y mantener el mismo control en cada descarga.
- `tsi230_store_manual_guest(session_hash text,request_id uuid,items text[],name text,contact text,note text) -> jsonb`: valida permiso actual sobre cada foto y calcula todos los precios en servidor, incluso con pagos Stripe deshabilitados. Crea `public.orders.data` con el shape de administración existente y estado `nuevo`; nunca confirma un pago. Devuelve `{id,reference,total,status:'nuevo'}` con total en pesos e ID aleatorio exacto de 52 bits. Los datos de entrega pueden ser elegidos por el invitado. La idempotencia privada liga request_id a contacto aprobado + hash del payload; repetir no duplica pedidos ni transfiere el pedido a otro invitado. INSERT anónimo legacy se revoca y el INSERT autenticado exige admin.

Los cuatro RPC son `SECURITY INVOKER`, requieren `current_user='service_role'` y su EXECUTE está revocado de PUBLIC/anon/authenticated. El mapping conserva únicamente UUID histórico cuando la limpieza elimina el contacto caducado; una sesión expirada no puede volver a reclamarlo.

## Migración y validación

Archivo creado mediante CLI `npx --yes supabase@3.0.0 migration new tsi230_guest_access`: `supabase/migrations/20261107024942_tsi230_guest_access.sql`. `schema.sql` conserva fuente revisable idéntica. El agente de invitados no aplicó DB ni desplegó funciones. Coordinación principal revisa/aplica únicamente staging, ejecuta SQL de pruebas con rollback y advisors.

- `node dev-tests/guest230.cjs`
- `node dev-tests/guest230-ui.cjs`
- `node dev-tests/guest230-manual-ui.cjs` (tienda staging con Stripe apagado; solo Edge y sin precios enviados por cliente).
- `dev-tests/guest230-backend.sql` (después de migrar staging; fixtures sintéticos y rollback).
- `dev-tests/guest230-store-backend.sql` (después de ambas migraciones; prueba aislamiento A/B en navegador compartido, variantes, idempotencia, pedidos históricos, pago y descarga; rollback).
- `dev-tests/guest230-admin-backend.sql` (solo fixtures PostgreSQL locales: snapshot/sync, aprobación, TTL, revocación, rol vigente y purga física).
- `node dev-tests/guest230-postgres.cjs`, con `TSI230_PGLITE_MODULE` apuntando a la instalación local de PGlite: ejecuta las migraciones **reales completas** de preview/tienda/contactos 2.2.4 y ambas 2.3.0, más las tres pruebas SQL. No sustituye quote, prepare, contacto, status ni funciones guest. Usa únicamente memoria local; valida rollback sin filas residuales. Infraestructura modelada: tablas/RLS previas a 2.2.4, contexto `auth.uid/my_role`, registro de backups y registro `cron.schedule`. No valida JWT real, worker cron, PostgREST/Edge desplegado, correo, red/firma Stripe o concurrencia entre workers. La ejecución detectó y corrigió una ambigüedad real de `ON CONFLICT(bucket)` en el límite durable; ahora usa el nombre explícito de la constraint.

## Documentación consultada el 6 de noviembre de 2026

Se consultó el índice [changelog](https://supabase.com/changelog), [autorización de Edge Functions](https://supabase.com/docs/guides/functions/auth), [tareas en segundo plano](https://supabase.com/docs/guides/functions/background-tasks), [secretos](https://supabase.com/docs/guides/functions/secrets), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y búsqueda de documentación MCP. Cambios relevantes revisados: [CLI v3 local por defecto y confirmación de cambios remotos](https://supabase.com/changelog/supabase-cli-v3), [grants explícitos para tablas nuevas](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), y [retirada de ciphers TLS CBC desde noviembre](https://supabase.com/changelog/cbc-tls-ciphers-deprecated). Se usó CLI v3 fijada, grants explícitos y llamadas HTTPS actuales.
