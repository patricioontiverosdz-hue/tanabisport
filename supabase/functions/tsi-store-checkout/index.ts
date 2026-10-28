import Stripe from 'npm:stripe@22.6.0';
import { createHandler } from './handler.mjs';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const handler = createHandler({
  env: (name: string) => Deno.env.get(name),
  stripeFactory: (secret: string, options: { apiVersion: string }) => {
    const client = new Stripe(secret, {
      apiVersion: options.apiVersion as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(),
    });
    const constructEventAsync = client.webhooks.constructEventAsync.bind(client.webhooks);
    client.webhooks.constructEventAsync = (payload, signature, webhookSecret, tolerance) =>
      constructEventAsync(payload, signature, webhookSecret, tolerance, cryptoProvider);
    return client;
  },
});

Deno.serve(handler);
