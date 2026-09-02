# Stripe sandbox

Use only `sk_test_…` and `pk_test_…` keys locally. Set `PAYMENT_DRIVER=stripe`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and the temporary `STRIPE_WEBHOOK_SECRET` in `.env`; never commit `.env`.

Forward signed test webhooks while Next.js is running:

```powershell
# --api-key reads the sandbox key you already have, so `stripe login` is not needed.
stripe listen --api-key $env:STRIPE_SECRET_KEY --forward-to http://localhost:3000/api/payments/stripe/webhook
```

Copy the command's temporary `whsec_…` value into local `.env`, restart Next.js, and use Stripe-hosted Checkout. Use Stripe test card `4242 4242 4242 4242` for success and `4000 0000 0000 0002` for a generic decline, with any future expiry/CVC. Never use a real card.

The browser return only displays current server state. Payment becomes paid only after the signed webhook. Re-deliver the same event from Stripe CLI/Dashboard to verify it remains a no-op. Cancel in hosted Checkout to test the return message; `checkout.session.expired` is the authoritative event that cancels the pending order and releases its reservation.

The integration intentionally does not issue refunds automatically. Existing return records and payment identifiers remain compatible with a later, separately authorised Stripe refund workflow.
