import './photo-game-model.js';
import './editing-game-model.js';
import {createHandler} from './handler.mjs';

// Estas dos copias se generan desde staging; el test comprueba igualdad exacta.
const handler=createHandler({url:Deno.env.get('SUPABASE_URL'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),
 serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),models:{camera:globalThis.TSIPhotoGameModel,editing:globalThis.TSIEditingGameModel}});
Deno.serve(handler);
