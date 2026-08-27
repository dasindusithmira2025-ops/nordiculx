'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import type { CartView } from '@/lib/cart';
import { addToCart as addToCartAction } from '@/app/actions/cart';

/**
 * Client-side cart state.
 *
 * Holds only what the UI needs to stay responsive: the badge count, whether the
 * drawer is open, and the last fetched cart. The database remains the source of
 * truth — every mutation goes through a server action and the result is
 * re-read, so an optimistic count can never diverge for long.
 */

type CartContextValue = {
  count: number;
  cart: CartView | null;
  isOpen: boolean;
  isPending: boolean;
  openCart: () => void;
  closeCart: () => void;
  refresh: () => Promise<void>;
  add: (
    variantId: string,
    quantity?: number,
  ) => Promise<{ ok: boolean; error?: string }>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}

export function CartProvider({
  initialCount,
  children,
}: {
  initialCount: number;
  children: ReactNode;
}) {
  const [count, setCount] = useState(initialCount);
  const [cart, setCart] = useState<CartView | null>(null);

  // Adopt a new server-rendered count when one arrives.
  //
  // `useState(initialCount)` only reads the prop on first mount, so after
  // checkout emptied the bag the badge kept displaying the old number until a
  // full reload. Comparing during render is React's documented way to adjust
  // state from a prop; an effect would reintroduce the
  // `react-hooks/set-state-in-effect` cascade this project has already fixed
  // once. Optimistic local updates are unaffected — they move `count` without
  // touching `syncedCount`, so they are not clobbered until the server reports
  // a genuinely different figure.
  const [syncedCount, setSyncedCount] = useState(initialCount);
  if (initialCount !== syncedCount) {
    setSyncedCount(initialCount);
    setCount(initialCount);
  }
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/cart', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as CartView;
      setCart(data);
      setCount(data.itemCount);
    } catch {
      // Offline or transient failure — keep showing the last known cart.
    }
  }, []);

  const openCart = useCallback(() => {
    setIsOpen(true);
    void refresh();
  }, [refresh]);

  const closeCart = useCallback(() => setIsOpen(false), []);

  const add = useCallback<CartContextValue['add']>(
    async (variantId, quantity = 1) => {
      const result = await addToCartAction({ variantId, quantity });
      if (!result.ok) return { ok: false, error: result.error };

      setCount(result.data.itemCount);
      setIsOpen(true);
      startTransition(() => {
        void refresh();
      });
      return { ok: true };
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      count,
      cart,
      isOpen,
      isPending,
      openCart,
      closeCart,
      refresh,
      add,
    }),
    [count, cart, isOpen, isPending, openCart, closeCart, refresh, add],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
