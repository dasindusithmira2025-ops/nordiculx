'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  brands,
  categories,
  collections,
  concerns,
  inventoryItems,
  inventoryMovements,
  mediaKindEnum,
  productCollections,
  productConcerns,
  productMedia,
  productVariants,
  products,
  publishStatusEnum,
  routineStepEnum,
  skinTypeEnum,
} from '@/lib/db/schema';
import { requireStaff } from '@/lib/auth';
import { recordAudit } from '@/lib/admin/audit';
import { notifyRestock } from '@/lib/back-in-stock';
import {
  actionError,
  actionOk,
  toFieldErrors,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';
import { parseMoneyInput } from '@/lib/money';

/**
 * Full product editing.
 *
 * The products TABLE screen edits price, sale price, stock and status across
 * many rows at once; that is a different job from editing one product
 * completely, and mixing them produced a screen where the catalogue's copy,
 * imagery and beauty data were simply not reachable. These actions are the
 * write half of the per-product editor.
 *
 * Authorisation: every export begins with `requireStaff('products.manage')`.
 * That call — not the route, not the component, not a hidden button — is where
 * a non-privileged caller is stopped. A server action is a public HTTP
 * endpoint; anybody who can guess its id can invoke it.
 */

const publishStatusSchema = z.enum(publishStatusEnum.enumValues);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v));

const moneySchema = z
  .string()
  .trim()
  .transform((value) => parseMoneyInput(value))
  .refine((value): value is number => Number.isInteger(value) && value! > 0, {
    message: 'Enter a valid LKR price.',
  });

const nullableMoneySchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : parseMoneyInput(value)))
  .refine(
    (value) => value === null || (Number.isInteger(value) && value >= 0),
    {
      message: 'Enter a valid LKR amount.',
    },
  );

const nullableNumber = (max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= max), {
      message: 'Enter a valid number.',
    });

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(140)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single hyphens.',
  );

function catalogueRevalidate(slug?: string | null, productId?: string) {
  revalidatePath('/admin/products');
  if (productId) revalidatePath(`/admin/products/${productId}/edit`);
  revalidatePath('/shop');
  revalidatePath('/brands');
  revalidatePath('/');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/brands/[slug]', 'page');
  revalidatePath('/concern/[slug]', 'page');
  revalidatePath('/collection/[slug]', 'page');
  if (slug) revalidatePath(`/product/${slug}`);
}

/** Existing row, read before the write so the audit entry records a real diff. */
async function loadProduct(id: string) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      status: products.status,
      brandId: products.brandId,
      categoryId: products.categoryId,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/* --- the product itself --------------------------------------------------- */

const productSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(2, 'Enter a product name.').max(180),
  slug: slugSchema,
  status: publishStatusSchema,
  brandId: uuidSchema,
  categoryId: z.union([uuidSchema, z.literal('')]),
  subtitle: optionalText(300),
  excerpt: optionalText(400),
  description: optionalText(8000),
  benefits: z
    .string()
    .max(4000)
    // One benefit per line is how the copy is actually written and pasted.
    // Splitting here keeps the jsonb column a clean string[] with no blanks.
    .transform((v) =>
      v
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  howToUse: optionalText(4000),
  ingredientsList: optionalText(8000),
  routineStep: z.union([z.enum(routineStepEnum.enumValues), z.literal('')]),
  featured: z.boolean(),
  bestSeller: z.boolean(),
  newUntil: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : new Date(v)))
    .refine((v) => v === null || !Number.isNaN(v.getTime()), {
      message: 'Enter a valid date.',
    }),
  seoTitle: optionalText(200),
  seoDescription: optionalText(400),
});

export async function saveProduct(formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');

  const parsed = productSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    slug: formData.get('slug'),
    status: formData.get('status'),
    brandId: formData.get('brandId'),
    categoryId: formData.get('categoryId') ?? '',
    subtitle: formData.get('subtitle') ?? '',
    excerpt: formData.get('excerpt') ?? '',
    description: formData.get('description') ?? '',
    benefits: String(formData.get('benefits') ?? ''),
    howToUse: formData.get('howToUse') ?? '',
    ingredientsList: formData.get('ingredientsList') ?? '',
    routineStep: formData.get('routineStep') ?? '',
    featured: formData.get('featured') === 'on',
    bestSeller: formData.get('bestSeller') === 'on',
    newUntil: formData.get('newUntil') ?? '',
    seoTitle: formData.get('seoTitle') ?? '',
    seoDescription: formData.get('seoDescription') ?? '',
  });

  if (!parsed.success) {
    return actionError(
      'Check the fields marked below.',
      toFieldErrors(parsed.error),
    );
  }
  const input = parsed.data;

  const skinTypes = formData
    .getAll('suitableSkinTypes')
    .map(String)
    .filter((v): v is (typeof skinTypeEnum.enumValues)[number] =>
      (skinTypeEnum.enumValues as readonly string[]).includes(v),
    );

  const collectionIds = formData
    .getAll('collectionIds')
    .map(String)
    .filter((id) => uuidSchema.safeParse(id).success);
  const concernIds = formData
    .getAll('concernIds')
    .map(String)
    .filter((id) => uuidSchema.safeParse(id).success);

  const before = await loadProduct(input.id);
  if (!before) return actionError('Product not found.');

  // Referential checks happen here rather than being left to the foreign key:
  // a violated FK surfaces as a 500, and "Choose a valid brand" is the same
  // information without the crash.
  const [brand] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.id, input.brandId))
    .limit(1);
  if (!brand) {
    return actionError('Choose a valid brand.', { brandId: 'Unknown brand.' });
  }

  if (input.categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);
    if (!category) {
      return actionError('Choose a valid category.', {
        categoryId: 'Unknown category.',
      });
    }
  }

  const slugTaken = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, input.slug), ne(products.id, input.id)))
    .limit(1);
  if (slugTaken[0]) {
    return actionError('That URL is already in use.', {
      slug: 'Another product already uses this URL.',
    });
  }

  // `inArray`, never a hand-written ANY() over a JS array: drizzle expands an
  // array into a parenthesised parameter list, so ANY() receives a scalar and
  // Postgres rejects it as a malformed array literal. Same trap as the note in
  // src/lib/catalogue/products.ts.
  if (collectionIds.length > 0) {
    const found = await db
      .select({ id: collections.id })
      .from(collections)
      .where(inArray(collections.id, collectionIds));
    if (found.length !== collectionIds.length) {
      return actionError('One of the selected collections no longer exists.');
    }
  }
  if (concernIds.length > 0) {
    const found = await db
      .select({ id: concerns.id })
      .from(concerns)
      .where(inArray(concerns.id, concernIds));
    if (found.length !== concernIds.length) {
      return actionError('One of the selected concerns no longer exists.');
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        name: input.name,
        slug: input.slug,
        status: input.status,
        brandId: input.brandId,
        categoryId: input.categoryId || null,
        subtitle: input.subtitle,
        excerpt: input.excerpt,
        description: input.description,
        benefits: input.benefits,
        howToUse: input.howToUse,
        ingredientsList: input.ingredientsList,
        suitableSkinTypes: skinTypes,
        routineStep: input.routineStep || null,
        featured: input.featured,
        bestSeller: input.bestSeller,
        newUntil: input.newUntil,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        updatedAt: new Date(),
      })
      .where(eq(products.id, input.id));

    // Membership is replaced wholesale rather than diffed: the form submits the
    // complete intended set, and a delete-then-insert inside the transaction is
    // both shorter and impossible to leave half-applied.
    await tx
      .delete(productCollections)
      .where(eq(productCollections.productId, input.id));
    if (collectionIds.length > 0) {
      await tx.insert(productCollections).values(
        collectionIds.map((collectionId, i) => ({
          productId: input.id,
          collectionId,
          sortOrder: i,
        })),
      );
    }

    // Concern relevance is not exposed in this form, so an existing row's
    // relevance is preserved by re-reading it before the replace.
    const existingRelevance = new Map(
      (
        await tx
          .select({
            concernId: productConcerns.concernId,
            relevance: productConcerns.relevance,
          })
          .from(productConcerns)
          .where(eq(productConcerns.productId, input.id))
      ).map((r) => [r.concernId, r.relevance]),
    );

    await tx
      .delete(productConcerns)
      .where(eq(productConcerns.productId, input.id));
    if (concernIds.length > 0) {
      await tx.insert(productConcerns).values(
        concernIds.map((concernId) => ({
          productId: input.id,
          concernId,
          relevance: existingRelevance.get(concernId) ?? 5,
        })),
      );
    }

    await recordAudit({
      actor,
      action: 'product.updated',
      entityType: 'product',
      entityId: input.id,
      changes: {
        name: { from: before.name, to: input.name },
        slug: { from: before.slug, to: input.slug },
        status: { from: before.status, to: input.status },
        brandId: { from: before.brandId, to: input.brandId },
        categoryId: { from: before.categoryId, to: input.categoryId || null },
      },
      tx,
    });
  });

  // Both slugs: the old URL needs flushing too, or the renamed product keeps
  // serving from its previous path until the cache expires.
  catalogueRevalidate(before.slug, input.id);
  if (before.slug !== input.slug) catalogueRevalidate(input.slug, input.id);
  return actionOk();
}

/* --- variants ------------------------------------------------------------- */

const variantSchema = z.object({
  productId: uuidSchema,
  /** Empty when adding. */
  id: z.union([uuidSchema, z.literal('')]),
  sku: z.string().trim().min(2, 'Enter a SKU.').max(80),
  name: z.string().trim().min(1, 'Enter a variant name.').max(80),
  optionLabel: optionalText(80),
  price: moneySchema,
  salePrice: nullableMoneySchema,
  compareAtPrice: nullableMoneySchema,
  weightGrams: nullableNumber(100_000),
  volumeMl: nullableNumber(100_000),
  barcode: optionalText(80),
  imageUrl: optionalText(500),
  status: publishStatusSchema,
  isDefault: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  onHand: z.coerce.number().int().min(0).max(999_999),
  lowStockThreshold: z.coerce.number().int().min(0).max(9999),
  allowBackorder: z.boolean(),
});

export async function saveProductVariant(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');

  const parsed = variantSchema.safeParse({
    productId: formData.get('productId'),
    id: formData.get('id') ?? '',
    sku: formData.get('sku'),
    name: formData.get('name'),
    optionLabel: formData.get('optionLabel') ?? '',
    price: String(formData.get('price') ?? ''),
    salePrice: String(formData.get('salePrice') ?? ''),
    compareAtPrice: String(formData.get('compareAtPrice') ?? ''),
    weightGrams: String(formData.get('weightGrams') ?? ''),
    volumeMl: String(formData.get('volumeMl') ?? ''),
    barcode: formData.get('barcode') ?? '',
    imageUrl: formData.get('imageUrl') ?? '',
    status: formData.get('status'),
    isDefault: formData.get('isDefault') === 'on',
    sortOrder: formData.get('sortOrder') || 0,
    onHand: formData.get('onHand') || 0,
    lowStockThreshold: formData.get('lowStockThreshold') || 5,
    allowBackorder: formData.get('allowBackorder') === 'on',
  });

  if (!parsed.success) {
    return actionError(
      'Check the variant fields.',
      toFieldErrors(parsed.error),
    );
  }
  const input = parsed.data;

  if (input.salePrice !== null && input.salePrice >= input.price) {
    return actionError('Sale price must be lower than the regular price.', {
      salePrice: 'Must be lower than the regular price.',
    });
  }

  const product = await loadProduct(input.productId);
  if (!product) return actionError('Product not found.');

  const skuClash = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      input.id
        ? and(
            eq(productVariants.sku, input.sku),
            ne(productVariants.id, input.id),
          )
        : eq(productVariants.sku, input.sku),
    )
    .limit(1);
  if (skuClash[0]) {
    return actionError('That SKU is already in use.', {
      sku: 'Another variant already uses this SKU.',
    });
  }

  let restockedVariantId: string | null = null;

  try {
    await db.transaction(async (tx) => {
      let variantId = input.id;

      if (variantId) {
        const owned = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.id, variantId),
              eq(productVariants.productId, input.productId),
            ),
          )
          .limit(1);
        // Without this the productId in the form would be advisory and a
        // crafted request could edit any variant in the catalogue.
        if (!owned[0])
          throw new Error('That variant belongs to another product.');

        await tx
          .update(productVariants)
          .set({
            sku: input.sku,
            name: input.name,
            optionLabel: input.optionLabel,
            price: input.price,
            salePrice: input.salePrice,
            compareAtPrice: input.compareAtPrice,
            weightGrams: input.weightGrams,
            volumeMl: input.volumeMl,
            barcode: input.barcode,
            imageUrl: input.imageUrl,
            status: input.status,
            sortOrder: input.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, variantId));
      } else {
        const [created] = await tx
          .insert(productVariants)
          .values({
            productId: input.productId,
            sku: input.sku,
            name: input.name,
            optionLabel: input.optionLabel,
            price: input.price,
            salePrice: input.salePrice,
            compareAtPrice: input.compareAtPrice,
            weightGrams: input.weightGrams,
            volumeMl: input.volumeMl,
            barcode: input.barcode,
            imageUrl: input.imageUrl,
            status: input.status,
            sortOrder: input.sortOrder,
          })
          .returning({ id: productVariants.id });
        variantId = created!.id;
        await tx
          .insert(inventoryItems)
          .values({ variantId, onHand: 0, reserved: 0 });
      }

      if (input.isDefault) {
        // Exactly one default per product — the storefront reads
        // `is_default DESC` to pick the variant a quick-add uses, and two
        // defaults make that choice arbitrary.
        await tx
          .update(productVariants)
          .set({ isDefault: false })
          .where(eq(productVariants.productId, input.productId));
        await tx
          .update(productVariants)
          .set({ isDefault: true })
          .where(eq(productVariants.id, variantId));
      }

      const [inventory] = await tx
        .select({
          onHand: inventoryItems.onHand,
          reserved: inventoryItems.reserved,
        })
        .from(inventoryItems)
        .where(eq(inventoryItems.variantId, variantId))
        .limit(1);

      const currentOnHand = inventory?.onHand ?? 0;
      const reserved = inventory?.reserved ?? 0;
      const delta = input.onHand - currentOnHand;

      if (input.onHand < reserved) {
        throw new Error(
          `${reserved} unit(s) are reserved by open orders — stock cannot go below that.`,
        );
      }

      await tx
        .update(inventoryItems)
        .set({
          onHand: input.onHand,
          lowStockThreshold: input.lowStockThreshold,
          allowBackorder: input.allowBackorder,
          lastCountedAt: delta !== 0 ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.variantId, variantId));

      // The editor sets an absolute figure, but the ledger is append-only and
      // must still explain how stock got there — so the implied delta is
      // written as a stock take rather than silently swallowed.
      if (delta !== 0) {
        await tx.insert(inventoryMovements).values({
          variantId,
          reason: 'stock_take',
          onHandDelta: delta,
          reservedDelta: 0,
          onHandAfter: input.onHand,
          reservedAfter: reserved,
          referenceType: 'admin_product_editor',
          referenceId: input.productId,
          note: 'Set from the product editor',
          actorId: actor.id,
        });
        if (delta > 0 && currentOnHand - reserved <= 0) {
          restockedVariantId = variantId;
        }
      }

      await recordAudit({
        actor,
        action: input.id
          ? 'product_variant.updated'
          : 'product_variant.created',
        entityType: 'product_variant',
        entityId: variantId,
        changes: {
          sku: { from: null, to: input.sku },
          price: { from: null, to: input.price },
          onHand: { from: currentOnHand, to: input.onHand },
        },
        tx,
      });
    });
  } catch (error) {
    return actionError(
      error instanceof Error ? error.message : 'Could not save the variant.',
    );
  }

  // Outside the transaction: a rolled-back restock that had already emailed
  // everybody waiting cannot be taken back.
  if (restockedVariantId) await notifyRestock(restockedVariantId);

  catalogueRevalidate(product.slug, input.productId);
  return actionOk();
}

export async function deleteProductVariant(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');
  const id = String(formData.get('id') ?? '');
  const productId = String(formData.get('productId') ?? '');
  if (
    !uuidSchema.safeParse(id).success ||
    !uuidSchema.safeParse(productId).success
  ) {
    return actionError('Invalid variant.');
  }

  const product = await loadProduct(productId);
  if (!product) return actionError('Product not found.');

  const siblings = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.productId, productId),
        sql`${productVariants.deletedAt} IS NULL`,
      ),
    );
  if (siblings.length <= 1) {
    return actionError(
      'A product needs at least one variant — its price lives there.',
    );
  }

  // Soft delete. Order lines reference variants for reporting, and a hard
  // delete would either fail the foreign key or null out somebody's history.
  await db.transaction(async (tx) => {
    await tx
      .update(productVariants)
      .set({ deletedAt: new Date(), isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(productVariants.id, id),
          eq(productVariants.productId, productId),
        ),
      );

    const [remaining] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          sql`${productVariants.deletedAt} IS NULL`,
        ),
      )
      .orderBy(productVariants.sortOrder)
      .limit(1);

    // Retiring the default would otherwise leave the product with none, and
    // the quick-add button on the storefront would stop working.
    if (remaining) {
      await tx
        .update(productVariants)
        .set({ isDefault: true })
        .where(eq(productVariants.id, remaining.id));
    }

    await recordAudit({
      actor,
      action: 'product_variant.deleted',
      entityType: 'product_variant',
      entityId: id,
      changes: { deletedAt: { from: null, to: 'now' } },
      tx,
    });
  });

  catalogueRevalidate(product.slug, productId);
  return actionOk();
}

/* --- media ---------------------------------------------------------------- */

const mediaSchema = z.object({
  productId: uuidSchema,
  id: z.union([uuidSchema, z.literal('')]),
  kind: z.enum(mediaKindEnum.enumValues),
  url: z.string().trim().min(1, 'Enter a media URL.').max(500),
  posterUrl: optionalText(500),
  // Empty is allowed but must be deliberate: a decorative asset has an empty
  // alt, a missing one is a bug. See docs/ACCESSIBILITY.md.
  alt: z.string().trim().max(200),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

export async function saveProductMedia(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');

  const parsed = mediaSchema.safeParse({
    productId: formData.get('productId'),
    id: formData.get('id') ?? '',
    kind: formData.get('kind') || 'image',
    url: formData.get('url'),
    posterUrl: formData.get('posterUrl') ?? '',
    alt: formData.get('alt') ?? '',
    sortOrder: formData.get('sortOrder') || 0,
  });

  if (!parsed.success) {
    return actionError('Check the media fields.', toFieldErrors(parsed.error));
  }
  const input = parsed.data;

  const product = await loadProduct(input.productId);
  if (!product) return actionError('Product not found.');

  if (input.id) {
    const updated = await db
      .update(productMedia)
      .set({
        kind: input.kind,
        url: input.url,
        posterUrl: input.posterUrl,
        alt: input.alt,
        sortOrder: input.sortOrder,
      })
      .where(
        and(
          eq(productMedia.id, input.id),
          eq(productMedia.productId, input.productId),
        ),
      )
      .returning({ id: productMedia.id });
    if (!updated[0])
      return actionError('That asset belongs to another product.');
  } else {
    await db.insert(productMedia).values({
      productId: input.productId,
      kind: input.kind,
      url: input.url,
      posterUrl: input.posterUrl,
      alt: input.alt,
      sortOrder: input.sortOrder,
    });
  }

  await recordAudit({
    actor,
    action: input.id ? 'product_media.updated' : 'product_media.created',
    entityType: 'product',
    entityId: input.productId,
    changes: { url: { from: null, to: input.url } },
  });

  catalogueRevalidate(product.slug, input.productId);
  return actionOk();
}

export async function deleteProductMedia(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');
  const id = String(formData.get('id') ?? '');
  const productId = String(formData.get('productId') ?? '');
  if (
    !uuidSchema.safeParse(id).success ||
    !uuidSchema.safeParse(productId).success
  ) {
    return actionError('Invalid asset.');
  }

  const product = await loadProduct(productId);
  if (!product) return actionError('Product not found.');

  await db
    .delete(productMedia)
    .where(and(eq(productMedia.id, id), eq(productMedia.productId, productId)));

  await recordAudit({
    actor,
    action: 'product_media.deleted',
    entityType: 'product',
    entityId: productId,
    changes: { mediaId: { from: id, to: null } },
  });

  catalogueRevalidate(product.slug, productId);
  return actionOk();
}
