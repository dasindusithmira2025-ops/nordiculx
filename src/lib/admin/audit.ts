import 'server-only';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';
import { clientIp } from '@/lib/auth/session';
import type { SessionUser } from '@/lib/auth';

/**
 * Append-only audit trail.
 *
 * Every staff action that changes money, stock, permissions or customer data
 * writes one of these in the same transaction as the change itself, so the
 * record cannot survive a rolled-back write or go missing after a successful
 * one.
 *
 * Rows are never updated and never deleted. If something here is wrong, the
 * correction is another row.
 *
 * `changes` holds only the fields that actually moved, as `{ from, to }`. Whole
 * rows are deliberately not snapshotted: an audit log is not a backup, and
 * copying entire customer records into it would quietly turn it into the largest
 * store of personal data in the system.
 */

export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

export async function recordAudit(options: {
  actor: SessionUser;
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: AuditChanges;
  /** Pass a transaction so the log shares the fate of the write it describes. */
  tx?: Pick<typeof db, 'insert'>;
}): Promise<void> {
  const headerList = await headers();
  const executor = options.tx ?? db;

  await executor.insert(auditLogs).values({
    actorId: options.actor.id,
    // Denormalised so the trail still reads correctly after an account is
    // renamed or deleted.
    actorEmail: options.actor.email,
    actorRole: options.actor.staffRole,
    action: options.action,
    entityType: options.entityType,
    entityId: options.entityId ?? null,
    changes: options.changes ?? null,
    ipAddress: clientIp(headerList),
  });
}

/** Builds a `changes` map from before/after objects, keeping only real diffs. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): AuditChanges {
  const changes: AuditChanges = {};
  for (const [key, next] of Object.entries(after)) {
    const previous = before[key];
    if (previous !== next) changes[key] = { from: previous, to: next };
  }
  return changes;
}
