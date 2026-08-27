'use client';

import { useActionState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/validation';

/**
 * One editable row.
 *
 * Content lists are short and edited in place — opening a page per FAQ entry
 * would cost more clicks than the edit is worth. The form posts the whole row,
 * so a save is a single round trip and the server schema stays the only
 * boundary.
 *
 * `remove` is a second action rather than a second form, because a form cannot
 * be nested inside another one.
 */
export function RowForm({
  action,
  remove,
  id,
  children,
  saveLabel = 'Save',
  removeLabel = 'Delete',
  className,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  remove?: (formData: FormData) => Promise<ActionResult>;
  id: string;
  children: ReactNode;
  saveLabel?: string;
  removeLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<
    (ActionResult & { intent?: string }) | null,
    FormData
  >(async (_previous, formData) => {
    if (formData.get('intent') === 'remove' && remove) {
      return remove(formData);
    }
    return action(formData);
  }, null);

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="id" value={id} />
      {children}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {saveLabel}
        </Button>

        {remove && id !== '' ? (
          <button
            type="submit"
            name="intent"
            value="remove"
            disabled={pending}
            // No confirm dialog: a blocking dialog freezes the whole tab in
            // some embedded browsers, and every one of these rows is
            // recreatable from this same screen in seconds.
            className="text-fg-subtle hover:text-signal-danger link-underline text-xs disabled:opacity-40"
          >
            {removeLabel}
          </button>
        ) : null}

        {state?.ok ? (
          <span role="status" className="text-signal-success text-xs">
            Saved.
          </span>
        ) : null}
        {state && !state.ok ? (
          <span role="alert" className="text-signal-danger text-xs">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
