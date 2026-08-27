import { NextResponse } from 'next/server';
import { getCart } from '@/lib/cart';

/**
 * Current visitor's cart.
 *
 * Scoped entirely by the cart cookie — there is no id parameter, so there is
 * nothing to tamper with and no way to request somebody else's bag.
 */
export async function GET() {
  const cart = await getCart();
  return NextResponse.json(cart, {
    headers: {
      // A cart is per-visitor and must never be cached by a proxy or the CDN.
      'Cache-Control': 'private, no-store',
    },
  });
}
