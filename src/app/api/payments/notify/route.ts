import { verifyNotification } from '@/lib/payments';
import { confirmPayment } from '@/lib/checkout/confirm-payment';
import { dispatchPaidOrderNotifications } from '@/lib/notifications/paid-order';

/**
 * Payment provider notification.
 *
 * This is the ONLY path by which a real payment is recognised. The customer
 * being redirected back to the site proves nothing — anyone can request that URL
 * with any query string — so the browser never marks an order paid.
 *
 * Rules:
 *   - the signature is verified before anything is read as meaningful
 *   - the amount is checked against the order's own server-computed total
 *   - handling is idempotent, because providers retry
 *   - the response body is empty and uninformative either way; a provider only
 *     needs a status code, and a detailed error would help an attacker probe
 *
 * No authentication guard is appropriate here: the provider is not a signed-in
 * user. The signature IS the authentication.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let params: Record<string, string>;

  try {
    const form = await request.formData();
    params = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return new Response(null, { status: 400 });
  }

  const verified = verifyNotification(params);
  if (!verified.valid) {
    // Logged so a misconfigured provider is visible, without echoing the reason
    // back to the caller.
    console.warn(`[payments] rejected notification: ${verified.reason}`);
    return new Response(null, { status: 400 });
  }

  const result = await confirmPayment({
    reference: verified.reference,
    status: verified.status,
    provider: 'payhere',
    providerReference: verified.providerReference,
    method: verified.method,
    // Provider amounts arrive in major units; the order stores cents.
    amount: Math.round(Number(verified.amount) * 100),
  });

  if (!result.ok) {
    console.warn(
      `[payments] could not apply notification for ${verified.reference}: ${result.reason}`,
    );
    // 200 for a mismatch would tell the provider to stop retrying a payment we
    // have not accepted, so this stays a failure.
    return new Response(null, { status: 400 });
  }

  // Only on the transition, never on a retry — otherwise a provider retrying for
  // an hour would send an hour of duplicate confirmation emails.
  if (result.changed && verified.status === 'paid') {
    await dispatchPaidOrderNotifications({
      orderReference: verified.reference,
    });
  }

  return new Response(null, { status: 200 });
}
