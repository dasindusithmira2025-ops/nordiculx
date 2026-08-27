'use client';

import { useTransition } from 'react';
import { endCampaign, setCampaignStatus } from '@/app/actions/admin-campaigns';

/** Publish / unpublish / end, from the list. */
export function CampaignRowActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  const send = (
    action: (data: FormData) => Promise<unknown>,
    fields: Record<string, string> = {},
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
          send(setCampaignStatus, {
            status: status === 'published' ? 'draft' : 'published',
          })
        }
        className="text-fg-muted hover:text-fg link-underline disabled:opacity-40"
      >
        {status === 'published' ? 'Unpublish' : 'Publish'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => send(endCampaign)}
        className="text-fg-muted hover:text-signal-danger link-underline disabled:opacity-40"
      >
        End now
      </button>
    </span>
  );
}
