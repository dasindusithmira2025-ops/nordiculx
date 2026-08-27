'use server';

import { revalidatePath } from 'next/cache';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  inventoryItems,
  inventoryMovements,
  brands,
  categories,
  orderItems,
  orders,
  orderStatusEnum,
  products,
  productMedia,
  productVariants,
  publishStatusEnum,
  trackingEvents,
  reviews,
  reviewStatusEnum,
  supportTickets,
} from '@/lib/db/schema';
import { requireStaff } from '@/lib/auth';
import { recordAudit } from '@/lib/admin/audit';
import { getOrderByReference } from '@/lib/orders';
import { refreshProductRating } from '@/lib/reviews';
import { notifyRestock } from '@/lib/back-in-stock';
import { sendMail } from '@/lib/mail';
import { orderDispatchedEmail } from '@/lib/mail/templates';
import {
  actionError,
  actionOk,
  toFieldErrors,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';
import { parseMoneyInput, percentOf } from '@/lib/money';

/**
 * Staff mutations.
 *
 * Every one of these begins with `requireStaff(permission)` and ends with an
 * audit row. Hiding a button in the UI is presentation; this is the only place
 * authorisation actually happens, so a mutation reachable without that call is
 * unprotected regardless of what the interface shows.
 */

const statusSchema = z.enum(orderStatusEnum.enumValues);
const publishStatusSchema = z.enum(publishStatusEnum.enumValues);

const nullableMoneySchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : parseMoneyInput(value)))
  .refine(
    (value) => value === null || (Number.isInteger(value) && value >= 0),
    {
      message: 'Enter a valid USD amount.',
    },
  );

const moneySchema = z
  .string()
  .trim()
  .transform((value) => parseMoneyInput(value))
  .refine((value): value is number => Number.isInteger(value) && value! > 0, {
    message: 'Enter a valid USD price.',
  });

function catalogueRevalidate(slug?: string | null) {
  revalidatePath('/admin/products');
  revalidatePath('/shop');
  revalidatePath('/brands');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/brands/[slug]', 'page');
  revalidatePath('/concern/[slug]', 'page');
  if (slug) revalidatePath(`/product/${slug}`);
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/%/g, ' percent ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function uniqueSlug(base: string) {
  const root = slugify(base) || 'product';
  let candidate = root;
  for (let i = 2; i < 100; i += 1) {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, candidate))
      .limit(1);
    if (!existing[0]) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

async function productForVariant(variantId: string) {
  const rows = await db
    .select({
      productId: products.id,
      slug: products.slug,
      name: products.name,
      status: products.status,
      variantId: productVariants.id,
      sku: productVariants.sku,
      price: productVariants.price,
      salePrice: productVariants.salePrice,
      variantStatus: productVariants.status,
      onHand: inventoryItems.onHand,
      reserved: inventoryItems.reserved,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .where(eq(productVariants.id, variantId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateProductQuick(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');

  const parsed = z
    .object({
      variantId: uuidSchema,
      price: moneySchema,
      salePrice: nullableMoneySchema,
      status: publishStatusSchema,
      stockDelta: z.coerce.number().int().min(-9999).max(9999).default(0),
      stockReason: z.enum(['received', 'manual_adjustment', 'damaged', 'lost']),
      stockNote: z.string().trim().max(300).optional().or(z.literal('')),
    })
    .safeParse({
      variantId: formData.get('variantId'),
      price: String(formData.get('price') ?? ''),
      salePrice: String(formData.get('salePrice') ?? ''),
      status: formData.get('status'),
      stockDelta: formData.get('stockDelta') || 0,
      stockReason: formData.get('stockReason') || 'manual_adjustment',
      stockNote: formData.get('stockNote') ?? '',
    });

  if (!parsed.success) {
    return actionError(
      'Check the product fields.',
      toFieldErrors(parsed.error),
    );
  }

  const input = parsed.data;
  if (input.salePrice !== null && input.salePrice >= input.price) {
    return actionError('Sale price must be lower than the regular price.', {
      salePrice: 'Sale price must be lower than the regular price.',
    });
  }

  const before = await productForVariant(input.variantId);
  if (!before) return actionError('Product not found.');

  if (
    input.stockDelta < 0 &&
    Math.abs(input.stockDelta) > (before.onHand ?? 0)
  ) {
    return actionError('Stock cannot be adjusted below zero.');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(productVariants)
      .set({
        price: input.price,
        salePrice: input.salePrice,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(productVariants.id, input.variantId));

    await tx
      .update(products)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(products.id, before.productId));

    if (input.stockDelta !== 0) {
      const updated = await tx
        .update(inventoryItems)
        .set({
          onHand: sql`${inventoryItems.onHand} + ${input.stockDelta}`,
          updatedAt: new Date(),
        })
        .where(
          sql`${inventoryItems.variantId} = ${input.variantId} AND ${inventoryItems.onHand} + ${input.stockDelta} >= 0`,
        )
        .returning({
          onHand: inventoryItems.onHand,
          reserved: inventoryItems.reserved,
        });

      const after = updated[0];
      if (!after) throw new Error('Inventory update failed.');

      await tx.insert(inventoryMovements).values({
        variantId: input.variantId,
        reason: input.stockReason,
        onHandDelta: input.stockDelta,
        reservedDelta: 0,
        onHandAfter: after.onHand,
        reservedAfter: after.reserved,
        referenceType: 'admin_product',
        referenceId: before.productId,
        note: input.stockNote || null,
        actorId: actor.id,
      });
    }

    await recordAudit({
      actor,
      action: 'product.quick_updated',
      entityType: 'product',
      entityId: before.productId,
      changes: {
        price: { from: before.price, to: input.price },
        salePrice: { from: before.salePrice, to: input.salePrice },
        status: { from: before.status, to: input.status },
        stockDelta: { from: 0, to: input.stockDelta },
      },
      tx,
    });
  });

  // After the transaction, never inside it: a rolled-back restock that had
  // already emailed everybody waiting cannot be taken back. `notifyRestock`
  // no-ops when the variant is still out of stock or nobody is waiting.
  if (input.stockDelta > 0) await notifyRestock(input.variantId);

  catalogueRevalidate(before.slug);
  return actionOk();
}

export async function bulkEditProducts(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');
  const variantIds = formData
    .getAll('variantId')
    .map(String)
    .filter((id) => uuidSchema.safeParse(id).success);

  if (variantIds.length === 0) {
    return actionError('Select at least one product.');
  }
  if (variantIds.length > 100) {
    return actionError('Bulk edits are limited to 100 variants at a time.');
  }

  const action = String(formData.get('bulkAction') ?? '');
  const amountText = String(formData.get('bulkAmount') ?? '');
  const amount = parseMoneyInput(amountText);
  const percent = Number(amountText);
  const stockDelta = Number(formData.get('bulkStockDelta') ?? 0);

  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      slug: products.slug,
      price: productVariants.price,
      salePrice: productVariants.salePrice,
      status: products.status,
      onHand: inventoryItems.onHand,
      reserved: inventoryItems.reserved,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .where(inArray(productVariants.id, variantIds));

  if (rows.length !== variantIds.length) {
    return actionError('One or more selected products could not be found.');
  }

  try {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        if (action === 'publish' || action === 'draft') {
          const status = action === 'publish' ? 'published' : 'draft';
          await tx
            .update(products)
            .set({ status, updatedAt: new Date() })
            .where(eq(products.id, row.productId));
          await tx
            .update(productVariants)
            .set({ status, updatedAt: new Date() })
            .where(eq(productVariants.id, row.variantId));
        } else if (
          action === 'set_price' ||
          action === 'increase_amount' ||
          action === 'decrease_amount' ||
          action === 'increase_percent' ||
          action === 'decrease_percent'
        ) {
          let nextPrice = row.price;
          if (action === 'set_price') {
            if (!amount || amount <= 0) throw new Error('Invalid bulk price.');
            nextPrice = amount;
          } else if (
            action === 'increase_amount' ||
            action === 'decrease_amount'
          ) {
            if (amount === null) throw new Error('Invalid bulk amount.');
            nextPrice =
              action === 'increase_amount'
                ? row.price + amount
                : row.price - amount;
          } else {
            if (!Number.isFinite(percent) || percent < 0 || percent > 500) {
              throw new Error('Invalid bulk percentage.');
            }
            const delta = percentOf(row.price, percent);
            nextPrice =
              action === 'increase_percent'
                ? row.price + delta
                : row.price - delta;
          }
          if (nextPrice <= 0) throw new Error('Bulk price cannot be zero.');
          await tx
            .update(productVariants)
            .set({ price: nextPrice, updatedAt: new Date() })
            .where(eq(productVariants.id, row.variantId));
        } else if (action === 'clear_sale') {
          await tx
            .update(productVariants)
            .set({ salePrice: null, updatedAt: new Date() })
            .where(eq(productVariants.id, row.variantId));
        } else if (action === 'restock') {
          if (
            !Number.isInteger(stockDelta) ||
            stockDelta <= 0 ||
            stockDelta > 9999
          ) {
            throw new Error('Invalid restock quantity.');
          }
          const updated = await tx
            .update(inventoryItems)
            .set({
              onHand: sql`${inventoryItems.onHand} + ${stockDelta}`,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.variantId, row.variantId))
            .returning({
              onHand: inventoryItems.onHand,
              reserved: inventoryItems.reserved,
            });
          const after = updated[0];
          if (!after) throw new Error('Inventory update failed.');
          await tx.insert(inventoryMovements).values({
            variantId: row.variantId,
            reason: 'received',
            onHandDelta: stockDelta,
            reservedDelta: 0,
            onHandAfter: after.onHand,
            reservedAfter: after.reserved,
            referenceType: 'admin_bulk',
            referenceId: row.productId,
            note: 'Bulk restock',
            actorId: actor.id,
          });
        } else {
          throw new Error('Unsupported bulk action.');
        }
      }

      await recordAudit({
        actor,
        action: 'product.bulk_updated',
        entityType: 'product_variant',
        entityId: null,
        changes: {
          variants: { from: null, to: variantIds },
          action: { from: null, to: action },
        },
        tx,
      });
    });
  } catch (error) {
    return actionError(
      error instanceof Error ? error.message : 'Bulk update failed.',
    );
  }

  // Same reasoning as the single-product path: mail only once the stock
  // movement has actually committed.
  if (action === 'restock') {
    await Promise.all(rows.map((row) => notifyRestock(row.variantId)));
  }

  catalogueRevalidate();
  return actionOk();
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(180),
      brandId: uuidSchema,
      categoryId: uuidSchema.optional().or(z.literal('')),
      sku: z.string().trim().min(2).max(80),
      variantName: z.string().trim().min(1).max(80),
      price: moneySchema,
      stock: z.coerce.number().int().min(0).max(9999),
      status: publishStatusSchema,
      description: z.string().trim().max(4000).optional().or(z.literal('')),
      imageUrl: z.string().trim().max(500).optional().or(z.literal('')),
      imageAlt: z.string().trim().max(200).optional().or(z.literal('')),
    })
    .safeParse({
      name: formData.get('name'),
      brandId: formData.get('brandId'),
      categoryId: formData.get('categoryId') || '',
      sku: formData.get('sku'),
      variantName: formData.get('variantName') || 'Standard',
      price: String(formData.get('price') ?? ''),
      stock: formData.get('stock') || 0,
      status: formData.get('status') || 'draft',
      description: formData.get('description') ?? '',
      imageUrl: formData.get('imageUrl') ?? '',
      imageAlt: formData.get('imageAlt') ?? '',
    });

  if (!parsed.success) {
    return actionError(
      'Check the product fields.',
      toFieldErrors(parsed.error),
    );
  }

  const input = parsed.data;
  const [brand] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.id, input.brandId))
    .limit(1);
  if (!brand) return actionError('Choose a valid brand.');

  if (input.categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);
    if (!category) return actionError('Choose a valid category.');
  }

  const existingSku = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.sku, input.sku))
    .limit(1);
  if (existingSku[0]) return actionError('That SKU already exists.');

  const slug = await uniqueSlug(input.name);
  let productId = '';

  await db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        name: input.name,
        slug,
        brandId: input.brandId,
        categoryId: input.categoryId || null,
        description: input.description || null,
        excerpt: input.description
          ? input.description.slice(0, 220).replace(/\s+\S*$/, '')
          : null,
        status: input.status,
        seoTitle: `${input.name} | Nordic Lux`,
      })
      .returning({ id: products.id });
    productId = product!.id;

    const [variant] = await tx
      .insert(productVariants)
      .values({
        productId,
        sku: input.sku,
        name: input.variantName,
        price: input.price,
        status: input.status,
        isDefault: true,
        sortOrder: 0,
        imageUrl: input.imageUrl || null,
      })
      .returning({ id: productVariants.id });

    await tx.insert(inventoryItems).values({
      variantId: variant!.id,
      onHand: input.stock,
      reserved: 0,
    });

    await tx.insert(inventoryMovements).values({
      variantId: variant!.id,
      reason: 'received',
      onHandDelta: input.stock,
      reservedDelta: 0,
      onHandAfter: input.stock,
      reservedAfter: 0,
      referenceType: 'admin_product',
      referenceId: productId,
      note: 'Initial stock',
      actorId: actor.id,
    });

    if (input.imageUrl) {
      await tx.insert(productMedia).values({
        productId,
        variantId: variant!.id,
        kind: 'image',
        url: input.imageUrl,
        alt: input.imageAlt || input.name,
        sortOrder: 0,
      });
    }

    await recordAudit({
      actor,
      action: 'product.created',
      entityType: 'product',
      entityId: productId,
      changes: { sku: { from: null, to: input.sku } },
      tx,
    });
  });

  catalogueRevalidate(slug);
  return actionOk();
}

/**
 * Moves an order to a new status.
 *
 * Dispatching converts the reservation into a real stock decrement: until then
 * the units are held but still on hand, and after it they have left the
 * building. Both halves — the inventory update and its ledger row — share the
 * transaction with the status change, so stock can never disagree with the
 * order it was shipped against.
 */
export async function updateOrderStatus(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('orders.manage');

  const reference = String(formData.get('reference') ?? '');
  const parsed = statusSchema.safeParse(formData.get('status'));
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!reference || !parsed.success) {
    return actionError('That status could not be applied.');
  }
  const next = parsed.data;

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.reference, reference))
      .for('update')
      .limit(1);

    const order = rows[0];
    if (!order) return { ok: false as const, error: 'Order not found.' };

    // A no-op must not write an audit row or a tracking event — a timeline that
    // records changes that did not happen is worse than no timeline.
    if (order.status === next) return { ok: true as const, changed: false };

    await tx
      .update(orders)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await tx.insert(trackingEvents).values({
      orderId: order.id,
      status: next,
      message: note,
      source: 'staff',
    });

    // Dispatch is the moment stock genuinely leaves. Until now the units were
    // reserved but still on hand; here both counts fall together, in the same
    // transaction as the status change, so stock can never disagree with the
    // order it shipped against.
    if (next === 'dispatched' && order.status !== 'dispatched') {
      const lines = await tx
        .select({
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      for (const line of lines) {
        if (!line.variantId) continue;

        const moved = await tx
          .update(inventoryItems)
          .set({
            onHand: sql`GREATEST(${inventoryItems.onHand} - ${line.quantity}, 0)`,
            reserved: sql`GREATEST(${inventoryItems.reserved} - ${line.quantity}, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.variantId, line.variantId))
          .returning({
            onHand: inventoryItems.onHand,
            reserved: inventoryItems.reserved,
          });

        const after = moved[0];
        if (!after) continue;

        await tx.insert(inventoryMovements).values({
          variantId: line.variantId,
          reason: 'order_fulfilled',
          onHandDelta: -line.quantity,
          reservedDelta: -line.quantity,
          onHandAfter: after.onHand,
          reservedAfter: after.reserved,
          referenceType: 'order',
          referenceId: order.id,
          note: `Dispatched on order ${reference}`,
        });
      }
    }

    return {
      ok: true as const,
      changed: true,
      orderId: order.id,
      from: order.status,
    };
  });

  if (!result.ok) return actionError(result.error);
  if (!result.changed) return actionOk();

  await recordAudit({
    actor,
    action: 'order.status_changed',
    entityType: 'order',
    entityId: result.orderId,
    changes: { status: { from: result.from, to: next } },
  });

  // Told after the transaction commits: an email promising a dispatch that was
  // then rolled back cannot be recalled.
  if (next === 'dispatched') {
    const order = await getOrderByReference(reference);
    if (order) await sendMail(orderDispatchedEmail(order));
  }

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${reference}`);
  revalidatePath('/account/orders');
  return actionOk();
}

const moderationSchema = z.enum(reviewStatusEnum.enumValues);

/** Approves or rejects a review. */
export async function moderateReview(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('reviews.moderate');

  const id = String(formData.get('id') ?? '');
  const parsed = moderationSchema.safeParse(formData.get('status'));
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!uuidSchema.safeParse(id).success || !parsed.success) {
    return actionError('That review could not be moderated.');
  }

  const updated = await db
    .update(reviews)
    .set({
      status: parsed.data,
      moderatedBy: actor.id,
      moderatedAt: new Date(),
      moderationNote: note,
    })
    .where(eq(reviews.id, id))
    .returning({ id: reviews.id, productId: reviews.productId });

  if (!updated[0]) return actionError('That review could not be moderated.');

  // `products.rating_average` / `rating_count` are what the listing sorts on
  // and what the PDP's JSON-LD advertises. Nothing recomputed them, so a
  // published review left the product still reading "No reviews yet".
  await refreshProductRating(updated[0].productId);

  await recordAudit({
    actor,
    action: 'review.moderated',
    entityType: 'review',
    entityId: id,
    changes: { status: { from: 'pending', to: parsed.data } },
  });

  revalidatePath('/admin/reviews');
  // The product page shows the review and its rating; both changed.
  revalidatePath('/product/[slug]', 'page');
  return actionOk();
}

/** Closes or reopens a support ticket. */
export async function setTicketStatus(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('support.respond');

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');

  if (!uuidSchema.safeParse(id).success) {
    return actionError('That ticket could not be updated.');
  }
  if (status !== 'open' && status !== 'closed' && status !== 'pending') {
    return actionError('That ticket could not be updated.');
  }

  const updated = await db
    .update(supportTickets)
    .set({ status, updatedAt: new Date() })
    .where(eq(supportTickets.id, id))
    .returning({ id: supportTickets.id });

  if (!updated[0]) return actionError('That ticket could not be updated.');

  await recordAudit({
    actor,
    action: 'support.ticket_status_changed',
    entityType: 'support_ticket',
    entityId: id,
    changes: { status: { from: null, to: status } },
  });

  revalidatePath('/admin/support');
  return actionOk();
}
