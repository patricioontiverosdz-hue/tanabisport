import { createHandler } from './handler.mjs';
declare const EdgeRuntime: {waitUntil:(task:Promise<unknown>)=>void};

// No existing email transport is confirmed. Fail closed until an approved
// server-only adapter is configured; Supabase Auth must never send these OTPs.
Deno.serve(createHandler({env:(name:string)=>Deno.env.get(name),background:(task:Promise<unknown>)=>EdgeRuntime.waitUntil(task)}));
