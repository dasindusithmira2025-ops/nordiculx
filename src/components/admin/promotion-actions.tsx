'use client';

import { useTransition } from 'react';
import {
  expirePromotion,
  setPromotionEnabled,
} from '@/app/actions/admin-promotions';

/**
 * Row controls for one promotion.
 *
 * Text buttons, not a menu: turning a code off during a bad launch should be
 * one click from the list, not three from a detail page.
 */
export function PromotionRowActions({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const send = (
    action: (data: FormData) => Promise<unknown>,
    fields: Record<string, string>,
  ) =>
    startTransition(async () => {
      const data = new FormData();
      data.set('id', id);
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      await action(data);
    });

  return (
    <span className="flex gap-3 text-xs whitespace-nowrap">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          send(setPromotionEnabled, { enabled: enabled ? 'false' : 'true' })
        }
        className="text-fg-muted hover:text-fg link-underline disabled:opacity-40"
      >
        {enabled ? 'Turn off' : 'Turn on'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => send(expirePromotion, {})}
        className="text-fg-muted hover:text-signal-danger link-underline disabled:opacity-40"
      >
        Expire
      </button>
    </span>
  );
}
