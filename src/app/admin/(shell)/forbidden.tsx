import { ButtonLink } from '@/components/ui/button';
import { StatusMessage } from '@/components/layout/status-message';

/** Rendered by Next's auth interrupt for a signed-in staff member without access. */
export default function AdminForbidden() {
  return (
    <StatusMessage
      eyebrow="Access denied"
      title="You do not have access to this admin area"
      actions={
        <ButtonLink href="/admin" variant="secondary">
          Back to dashboard
        </ButtonLink>
      }
    >
      Your role does not include permission to view or change this area.
    </StatusMessage>
  );
}
