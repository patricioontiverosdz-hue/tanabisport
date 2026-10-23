# Ranking interno · staging 2.2.0

Desplegar exclusivamente en `nksqpoigywfegcbvfhoa` con `verify_jwt: true`. La función rechaza otra URL de proyecto y valida la sesión contra Auth antes de consultar el rol actual del perfil. Solo acepta administración, fotografía y edición.

El cliente envía `{game,sceneId,settings}`. La identidad procede de la sesión; la puntuación se calcula con las mismas fuentes canónicas que usa cada juego. Las copias de `photo-game-model.js` y `editing-game-model.js` deben ser idénticas a los archivos de `staging/`. Actualizar ambas al cambiar un catálogo o la evaluación; `game-ranking-backend.cjs` verifica igualdad y puntuaciones.

`handler.mjs` mantiene la lógica comprobable sin dependencias de un SDK. `index.mjs` importa los modelos y obtiene las claves de las variables de entorno internas de Supabase; no se incluyen secretos en estos archivos ni en el cliente. El endpoint conserva CORS para el origen del alojamiento TSI.

El esquema SQL está en `docs/staging-game-ranking.sql`. `tsi_game_save_result` es exclusivo de `service_role` y aplica la mejor marca con un UPSERT atómico. El RPC `tsi_game_rankings` comprueba sesión y rol y devuelve nombres y agregados, sin correos ni ajustes. La función privilegiada de lectura está en un esquema privado con `search_path` vacío y permisos explícitos.

Las tablas privadas tienen RLS activado y ningún acceso directo de participantes. El aviso informativo `rls_enabled_no_policy` es intencional: la denegación por defecto se conserva y las escrituras pasan por el servidor. [Referencia del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Verificación local: `npm run test:game-ranking`. Verificación transaccional en staging: `dev-tests/game-ranking-database.sql`; todas las marcas de comprobación se revierten. El catálogo y las funciones no tocan los módulos operativos.
