import type { ReturnStatus } from '@/lib/db/schema';

/**
 * Return constants and shapes, free of server-only imports.
 *
 * The customer form and the staff decision control are client components and
 * need the reason list, the labels and the transition table. Reading them from
 * the query module would drag `server-only` — and with it the database client
 * — into the browser bundle.
 */

/** Matches the returns policy the storefront publishes. */
export const RETURN_WINDOW_DAYS = 14;

export const RETURN_REASONS = [
  'Damaged in transit',
  'Wrong item received',
  'Item is faulty',
  'Not as described',
  'Changed my mind',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  in_transit: 'On its way back',
  received: 'Received',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

/**
 * Which statuses a request may move to next.
 *
 * A rejected or refunded return is terminal: reopening one would let a refund
 * be issued twice against the same order line.
 */
export function nextStatuses(status: ReturnStatus): ReturnStatus[] {
  switch (status) {
    case 'requested':
      return ['approved', 'rejected'];
    case 'approved':
      return ['in_transit', 'cancelled'];
    case 'in_transit':
      return ['received', 'cancelled'];
    case 'received':
      return ['refunded', 'rejected'];
    default:
      return [];
  }
}

export type ReturnableItem = {
  orderItemId: string;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  /** Bought, minus anything already on an open or accepted return. */
  returnable: number;
  purchased: number;
};

export type ReturnEligibility =
  | {
      eligible: false;
      reason: 'not_delivered' | 'window_closed' | 'nothing_left';
    }
  | { eligible: true; items: ReturnableItem[]; closesOn: Date };

export type ReturnSummary = {
  id: string;
  reference: string;
  status: ReturnStatus;
  reason: string;
  customerNote: string | null;
  staffNote: string | null;
  refundAmount: number | null;
  createdAt: Date;
  items: {
    productName: string;
    variantName: string;
    quantity: number;
    /** What the returned units were paid for, in cents. */
    lineValue: number;
  }[];
};

export type AdminReturnRow = ReturnSummary & {
  orderReference: string;
  orderTotal: number;
  customerEmail: string;
  customerName: string | null;
};
