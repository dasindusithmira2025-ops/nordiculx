'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Posts the signed payment fields to a provider that expects a form (PayHere).
 * Submits itself on arrival; the button is the fallback when scripts are off
 * or the submit is blocked.
 */
export function ProviderRedirectForm({
  action,
  fields,
}: {
  action: string;
  fields: Record<string, string>;
}) {
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.submit();
  }, []);

  return (
    <form ref={form} method="post" action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="lg">
        Continue to secure payment
      </Button>
    </form>
  );
}
