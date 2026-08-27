import { describe, expect, it } from 'vitest';
import { verifyNotification, paymentsAreMocked } from '@/lib/payments';

/**
 * The notification verifier is the gate between "someone POSTed to our webhook"
 * and "this order is paid". Everything here is about refusing, because accepting
 * a forged callback is the one bug that gives away stock for free.
 *
 * The suite runs with PAYMENT_DRIVER=mock (see tests/setup.ts), which is exactly
 * the configuration where the endpoint must accept nothing at all.
 */
describe('verifyNotification', () => {
  it('runs against the mock driver in tests', () => {
    expect(paymentsAreMocked).toBe(true);
  });

  it('accepts nothing while the mock driver is selected', () => {
    // The mock driver settles in-process and has no callback, so anything
    // arriving at the webhook is by definition not from it.
    const result = verifyNotification({
      merchant_id: '1',
      order_id: 'NL-AAAA-BBBB',
      payhere_amount: '10250.00',
      payhere_currency: 'USD',
      status_code: '2',
      md5sig: 'whatever',
    });

    expect(result.valid).toBe(false);
  });

  it('rejects an empty payload', () => {
    expect(verifyNotification({}).valid).toBe(false);
  });

  it('never reports a payload as valid without a signature', () => {
    const result = verifyNotification({
      merchant_id: '1',
      order_id: 'NL-AAAA-BBBB',
      payhere_amount: '10250.00',
      payhere_currency: 'USD',
      status_code: '2',
    });
    expect(result.valid).toBe(false);
  });
});
