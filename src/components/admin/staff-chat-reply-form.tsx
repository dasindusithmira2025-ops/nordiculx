'use client';

import { useActionState, useEffect, useRef } from 'react';
import { replyToChat } from '@/app/actions/admin-support';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import type { ActionResult } from '@/lib/validation';

/** Staff reply form. It clears only after a confirmed send. */
export function StaffChatReplyForm({
  conversationId,
}: {
  conversationId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(replyToChat, null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label className="block">
        <span className="eyebrow text-fg-subtle">Reply</span>
        <Textarea
          name="body"
          required
          maxLength={2000}
          rows={4}
          className="mt-2"
          placeholder="Write a helpful reply"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          Send reply
        </Button>
        {state?.ok ? (
          <span role="status" className="text-signal-success text-xs">
            Reply sent.
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
