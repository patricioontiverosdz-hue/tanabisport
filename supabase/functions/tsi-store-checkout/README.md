# TSI Store checkout — staging only

This function prepares an embedded Stripe Checkout integration for the approved **EntornoTanabi test account** (`acct_1UVH3OQ9WFCZJIYG`). It rejects the production Supabase project and live Stripe keys. No credentials are stored in source. Missing credentials return `config.ready=false` and prevent order preparation, reservations and Stripe session creation. The catalog and server-priced quotes remain available independently.

## Runtime configuration

Use Supabase Edge Function secrets for `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET`. The platform provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Use a test restricted key (`rk_test_`) where possible; a test secret key (`sk_test_`) is also accepted. The restricted key needs current-account read and Checkout Session create/read permissions. No PaymentIntent retrieval is used by this function. The approved account is checked before preparing an order.

The entry point imports `npm:stripe@22.6.0`, pins API `2026-08-26.dahlia`, uses the SDK Fetch HTTP client and SubtleCrypto webhook verifier. `handler.mjs` also verifies exact raw bytes, timestamp tolerance and every supplied `v1` signature before reading event data. Payment methods remain dynamic and are configured in Stripe Dashboard; the code does not pass `payment_method_types` or enable tax calculations.

Deploy `tsi-store-checkout` only to staging `nksqpoigywfegcbvfhoa` with `verify_jwt=false`. This is deliberate: browser routes use the allowlisted Origin, buyer order access uses a 256-bit possession token, and webhook calls use Stripe signatures. The service key stays on the server. Browser configuration is never a secret-entry form.

## Routes

- `GET ?action=config`: safe readiness information and publishable key only when ready.
- `POST ?action=quote`: `{cart}`; browser prices are never accepted. Unsupported fields are rejected and the database reprices all entries.
- `POST ?action=create-session`: `{request_id,access_token,cart,email}`. IDs are UUIDs; the access token is 64 lowercase hex characters generated with browser cryptographic randomness.
- `POST ?action=status`: `{order_id,access_token}`. A UUID alone never grants access. Only paid orders can include a delivery link.
- `POST /webhook`: configure `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired` in Stripe. A webhook signing secret is mandatory. The raw signature is validated before retrieving the current Stripe session and recording an event.

Equivalent `/config`, `/quote`, `/create-session` and `/status` paths are accepted. Browser `action` in the JSON body is also accepted. Secrets and access tokens must never appear in URLs, logs, analytics or error messages. The fixed return URL is the TSI staging URL and carries only Stripe's session ID.

## Reservations and reconciliation

The database computes amounts and reserves physical inventory atomically. Stripe receives only that stored snapshot. Home delivery is limited to Mexico; shipping price comes from database configuration. Photo/digital-only orders do not collect shipping addresses or add shipping charges.

Checkout creation uses an order-specific idempotency key. Its parameters, metadata and eight-letter integration suffix remain stable on retry. Session expiration is fixed at persisted order `created_at + 45 minutes`, leaving a 15-minute recovery window while respecting Stripe's 30-minute minimum. If there is less than 30 minutes left and no linked session, the function requires review; it does not create another session or free stock based on a local timer.

Only an explicit non-ambiguous pre-creation 4xx Stripe rejection can call the service-only abort RPC for an order without a linked session. Network errors, 5xx, rate limits, idempotency conflicts and failed database linking keep reservations for reconciliation. Successful browser redirects never mark an order paid. Signed webhooks and buyer-owned status reconciliation retrieve the latest Stripe Session; database checks enforce amount/currency/session matching, event deduplication and monotonic paid state. Delayed payments are not fulfilled before payment is confirmed.

There is an in-process request limiter plus the database-backed checkout limiter. Its stored identifier rotates daily in UTC and uses a server-secret salt; it does not persist a stable IP hash. Production operations should also configure platform-level rate limits; per-isolate counters alone cannot enforce a global traffic limit. Unlinked ambiguous orders need server-side review rather than unverified inventory release. The function does not send customer messages or fulfill orders automatically.

## Validation

`node dev-tests/store-payments.cjs` uses only a mocked Stripe SDK and mocked database transport. It covers missing/live keys, environment/account boundaries, browser price tampering, buyer tokens, stable idempotency, failed linking, reservation handling, raw signatures and timestamp tolerance, duplicate events, stale events, asynchronous failure/success and amount mismatches. It never makes a real charge or creates a real Stripe object.

The real entry point was also checked with Deno 2.9.6 and the downloaded `stripe@22.6.0` package using `deno check --config supabase/functions/tsi-store-checkout/deno.json supabase/functions/tsi-store-checkout/index.ts`. The adjacent `deno.lock` records the resolved dependency integrities. This verifies imports and types without starting the HTTP server or reading runtime secrets.

Before enabling even test payments, supply valid test secrets, configure the signed webhook and verify a real sandbox integration separately. These files alone do not claim that Stripe is connected or that a payment succeeded.

Primary references: [Checkout lifecycle](https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=embedded-page), [fulfillment](https://docs.stripe.com/checkout/fulfillment), [webhook signatures](https://docs.stripe.com/webhooks), [dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods).
