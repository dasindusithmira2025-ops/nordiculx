import 'server-only';
import { sql, type SQL } from 'drizzle-orm';

/**
 * What counts as a sale.
 *
 * One definition, used by every ranking that claims to reflect what people
 * actually bought — the best-selling product sort and the Top Selling Brands
 * row. Two copies of this predicate would eventually disagree, and the
 * storefront would then be telling customers two different stories about the
 * same orders.
 *
 * The rules:
 *   - the money has to have arrived: `payment_status = 'paid'`. A pending,
 *     failed or refunded order is not a sale, and an authorised-but-uncaptured
 *     one is not one yet either.
 *   - the goods have to be staying sold: an order later cancelled or returned
 *     is struck from the count, however it was paid.
 *
 * `partially_refunded` is deliberately excluded rather than partially counted.
 * Apportioning a refund back across lines is guesswork at this grain, and a
 * ranking that quietly invents quantities is worse than one that is slightly
 * conservative.
 */
export const PAID_SALE = sql`o.payment_status = 'paid'
  AND o.status NOT IN ('cancelled', 'returned')`;

/**
 * Units sold of one product, as a scalar subquery correlated on `p.id`.
 *
 * ponytail: a correlated subquery, not a materialised counter. It rides the
 * existing `order_items_product_id_idx` and costs one index lookup per row of
 * the page being sorted, which is nothing at this catalogue size. If the order
 * book grows to where this shows up in a query plan, the upgrade is a
 * `product_sales` rollup table refreshed on order paid/cancelled — not a
 * bigger index.
 */
export function unitsSoldFor(productColumn: SQL | string = sql`p.id`): SQL {
  const column =
    typeof productColumn === 'string' ? sql.raw(productColumn) : productColumn;
  return sql`COALESCE((
    SELECT SUM(oi.quantity)::int
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = ${column} AND ${PAID_SALE}
  ), 0)`;
}
