# Ranking de producción · TSI 2.2.0

Función `training-game` del proyecto `tantlgswituiwkxfgmsr`, con `verify_jwt: true` y guardas que rechazan cualquier otro servidor. Sus puntuaciones permanecen separadas de staging.

El despliegue utiliza `index.mjs`, `handler.mjs`, `deno.json` y las copias de los dos modelos canónicos. Los modelos coinciden con `training/photo-game-model.js` y `training/editing-game-model.js`; no modificar la evaluación solo en uno de los extremos.

Migración aditiva: `docs/production-game-ranking.sql`. La identidad se valida contra Auth y el rol se consulta en el perfil actual. El cliente envía únicamente juego, reto y ajustes. Las claves internas se leen de las variables de entorno de Supabase, sin incluirlas en el repositorio ni en el navegador.

La escritura del mejor resultado es exclusiva del servidor; el podio solo devuelve nombres y agregados a miembros autorizados del equipo. No copiar filas ni marcas de pruebas a este entorno.
