import { and, desc, isNotNull, isNull } from 'drizzle-orm';
import {
  requireStaff,
  permissionsFor,
  requiresMfa,
  ROLE_LABELS,
} from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { Badge } from '@/components/ui/display';
import { NoRows, PageHeader, Table, Td, Th } from '@/components/admin/admin-ui';

/**
 * Staff accounts.
 *
 * Read-only, deliberately. Roles are granted by `npm run staff:create` on a
 * machine with database access, which is a much higher bar than a session in a
 * browser — and an admin UI that can mint a second owner is exactly how one
 * compromised staff session becomes permanent access.
 *
 * The MFA column reports the truth rather than an intention: enrolment is not
 * built, so every privileged account correctly shows as not enrolled. Saying
 * anything else here would be worse than saying nothing.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export default async function AdminStaffPage() {
  const actor = await requireStaff('staff.manage');

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      staffRole: users.staffRole,
      mfaEnabledAt: users.mfaEnabledAt,
      lastLoginAt: users.lastLoginAt,
      lockedUntil: users.lockedUntil,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(isNotNull(users.staffRole), isNull(users.deletedAt)))
    .orderBy(desc(users.lastLoginAt));

  const owed = rows.filter(
    (row) => requiresMfa(row.staffRole) && !row.mfaEnabledAt,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access"
        title={`${rows.length} staff accounts`}
        description="Roles are granted from the command line, not from here. Every permission below is enforced server-side on each action, not by hiding a link."
        stats={[{ label: 'MFA outstanding', value: owed.length }]}
      />

      {owed.length > 0 ? (
        <p
          role="status"
          className="border-signal-warning text-fg-muted border-l px-4 py-3 text-sm"
        >
          <strong className="text-fg font-medium">
            Second factor not enrolled
          </strong>{' '}
          on {owed.length} privileged{' '}
          {owed.length === 1 ? 'account' : 'accounts'}. Enrolment is not built
          yet — see PRODUCTION_INPUTS_REQUIRED.md.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <NoRows>No staff accounts.</NoRows>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Role</Th>
              <Th>Permissions</Th>
              <Th>MFA</Th>
              <Th>Last signed in</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const permissions = permissionsFor(row.staffRole);
              const name =
                [row.firstName, row.lastName].filter(Boolean).join(' ') ||
                row.email;
              return (
                <tr key={row.id}>
                  <Td>
                    <p className="text-fg">{name}</p>
                    <p className="text-fg-subtle text-xs">{row.email}</p>
                    {row.id === actor.id ? (
                      <p className="text-fg-subtle text-xs">you</p>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {row.staffRole ? ROLE_LABELS[row.staffRole] : '—'}
                  </Td>
                  <Td className="text-fg-muted max-w-md text-xs">
                    {permissions.join(', ')}
                  </Td>
                  <Td>
                    {row.mfaEnabledAt ? (
                      <Badge tone="success">Enrolled</Badge>
                    ) : requiresMfa(row.staffRole) ? (
                      <Badge tone="low">Required, not enrolled</Badge>
                    ) : (
                      <Badge tone="neutral">Not required</Badge>
                    )}
                  </Td>
                  <Td className="text-fg-muted text-xs whitespace-nowrap">
                    {row.lastLoginAt
                      ? dateFormat.format(row.lastLoginAt)
                      : 'Never'}
                  </Td>
                  <Td>
                    {row.lockedUntil && row.lockedUntil > new Date() ? (
                      <Badge tone="low">Locked</Badge>
                    ) : (
                      <Badge tone="neutral">Active</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <p className="text-fg-subtle text-xs">
        Add or change an account with{' '}
        <code className="text-fg-muted">npm run staff:create</code>.
      </p>
    </div>
  );
}
