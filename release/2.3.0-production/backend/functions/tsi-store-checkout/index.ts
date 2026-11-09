import { createHandler } from './handler.mjs';
// Manual orders only: no Stripe SDK, keys or live charge are enabled by this release.
Deno.serve(createHandler({env:(name:string)=>Deno.env.get(name)}));
