import Stripe from 'npm:stripe@23.0.0';
import { createHandler } from './handler.mjs';
Deno.serve(createHandler({
 env: (name: string) => Deno.env.get(name),
 stripeFactory: (secret: string, options: {apiVersion: string}) => new Stripe(secret, {
  apiVersion: options.apiVersion as Stripe.LatestApiVersion,
  httpClient: Stripe.createFetchHttpClient(),
 }),
}));
