# Stripe production setup

1. Obtain the live publishable key from the client's Stripe account.
2. Obtain a live restricted or secret key with only the permissions this checkout needs.
3. Create the production webhook endpoint at `/api/payments/stripe/webhook` in Stripe Dashboard.
4. Obtain the production webhook signing secret.
5. Add the three Stripe values to the production secret store; never commit them.
6. Set `PAYMENT_DRIVER=stripe` in the production environment.
7. Run one controlled live payment.
8. Verify webhook → order confirmation → stock reservation/fulfilment → confirmation email.
9. Run the agreed refund test according to the business refund plan.
