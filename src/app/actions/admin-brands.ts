'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { brands, products, publishStatusEnum } from '@/lib/db/schema';
import { requireStaff } from '@/lib/auth';
import { diff, recordAudit } from '@/lib/admin/audit';
import {
  actionError,
  actionOk,
  toFieldErrors,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';

const publishStatusSchema = z.enum(publishStatusEnum.enumValues);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value));

const optionalMediaUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => value === '' || /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value),
      'Use an HTTPS URL or a local path such as /media/brands/name.svg.',
    )
    .transform((value) => (value === '' ? null : value));

const brandSchema = z.object({
  id: z.union([uuidSchema, z.literal('')]),
  name: z.string().trim().min(2, 'Enter a brand name.').max(120),
  slug: z.string().trim().max(140),
  tagline: optionalText(180),
  description: optionalText(1600),
  story: optionalText(8000),
  logoUrl: optionalMediaUrl(500),
  heroImageUrl: optionalMediaUrl(500),
  originCountry: optionalText(100),
  status: publishStatusSchema,
  featured: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  merchandisingRank: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= 1 && value <= 99),
      'Use a position from 1 to 99, or leave it blank.',
    ),
  seoTitle: optionalText(200),
  seoDescription: optionalText(400),
});

const slugSchema = z
  .string()
  .min(2, 'Use at least two URL-safe characters.')
  .max(140)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single hyphens.',
  );

type BrandInput = z.infer<typeof brandSchema> & { slug: string };

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function parseBrand(formData: FormData):
  | { ok: true; data: BrandInput }
  | { ok: false; result: ActionResult } {
  const parsed = brandSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    name: formData.get('name'),
    slug: String(formData.get('slug') ?? ''),
    tagline: formData.get('tagline') ?? '',
    description: formData.get('description') ?? '',
    story: formData.get('story') ?? '',
    logoUrl: formData.get('logoUrl') ?? '',
    heroImageUrl: formData.get('heroImageUrl') ?? '',
    originCountry: formData.get('originCountry') ?? '',
    status: formData.get('status') ?? 'draft',
    featured: formData.get('featured') === 'on',
    sortOrder: String(formData.get('sortOrder') ?? '0'),
    merchandisingRank: String(formData.get('merchandisingRank') ?? ''),
    seoTitle: formData.get('seoTitle') ?? '',
    seoDescription: formData.get('seoDescription') ?? '',
  });

  if (!parsed.success) {
    return {
      ok: false,
      result: actionError(
        'Check the brand fields.',
        toFieldErrors(parsed.error),
      ),
    };
  }

  const slug = parsed.data.slug || slugify(parsed.data.name);
  const validSlug = slugSchema.safeParse(slug);
  if (!validSlug.success) {
    return {
      ok: false,
      result: actionError('Choose a valid brand URL.', {
        slug: validSlug.error.issues[0]?.message ?? 'Invalid brand URL.',
      }),
    };
  }

  return { ok: true, data: { ...parsed.data, slug } };
}

function brandFields(input: BrandInput) {
  return {
    name: input.name,
    slug: input.slug,
    tagline: input.tagline,
    description: input.description,
    story: input.story,
    logoUrl: input.logoUrl,
    heroImageUrl: input.heroImageUrl,
    originCountry: input.originCountry,
    status: input.status,
    featured: input.featured,
    sortOrder: input.sortOrder,
    merchandisingRank: input.merchandisingRank,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  };
}

function revalidateBrandPaths(slugs: (string | null | undefined)[]) {
  revalidatePath('/admin/brands');
  revalidatePath('/brands');
  revalidatePath('/');
  revalidatePath('/admin/products');
  revalidatePath('/brands/[slug]', 'page');
  for (const slug of slugs) {
    if (slug) revalidatePath(`/brands/${slug}`);
  }
}

export async function saveBrand(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireStaff('products.manage');
  const parsed = parseBrand(formData);
  if (!parsed.ok) return parsed.result as ActionResult<{ id: string }>;
  const input = parsed.data;

  const slugWhere = input.id
    ? and(eq(brands.slug, input.slug), ne(brands.id, input.id))
    : eq(brands.slug, input.slug);
  const [slugTaken] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(slugWhere)
    .limit(1);
  if (slugTaken) {
    return actionError('That brand URL is already in use.', {
      slug: 'Choose a different brand URL.',
    });
  }

  const before = input.id
    ? (
        await db
          .select()
          .from(brands)
          .where(eq(brands.id, input.id))
          .limit(1)
      )[0]
    : null;
  if (input.id && !before) return actionError('Brand not found.');

  const values = {
    name: input.name,
    slug: input.slug,
    tagline: input.tagline,
    description: input.description,
    story: input.story,
    logoUrl: input.logoUrl,
    heroImageUrl: input.heroImageUrl,
    originCountry: input.originCountry,
    status: input.status,
    featured: input.featured,
    sortOrder: input.sortOrder,
    merchandisingRank: input.merchandisingRank,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    updatedAt: new Date(),
  };

  let brandId = input.id;
  await db.transaction(async (tx) => {
    if (before) {
      await tx.update(brands).set(values).where(eq(brands.id, before.id));
      await recordAudit({
        actor,
        action: 'brand.updated',
        entityType: 'brand',
        entityId: before.id,
        changes: diff(
          {
            name: before.name,
            slug: before.slug,
            tagline: before.tagline,
            description: before.description,
            story: before.story,
            logoUrl: before.logoUrl,
            heroImageUrl: before.heroImageUrl,
            originCountry: before.originCountry,
            status: before.status,
            featured: before.featured,
            sortOrder: before.sortOrder,
            merchandisingRank: before.merchandisingRank,
            seoTitle: before.seoTitle,
            seoDescription: before.seoDescription,
          },
          brandFields(input),
        ),
        tx,
      });
      return;
    }

    const [created] = await tx
      .insert(brands)
      .values(values)
      .returning({ id: brands.id });
    brandId = created!.id;
    await recordAudit({
      actor,
      action: 'brand.created',
      entityType: 'brand',
      entityId: brandId,
      changes: {
        name: { from: null, to: input.name },
        slug: { from: null, to: input.slug },
        status: { from: null, to: input.status },
        logoUrl: { from: null, to: input.logoUrl },
      },
      tx,
    });
  });

  revalidateBrandPaths([before?.slug, input.slug]);
  return actionOk({ id: brandId });
}

export async function saveBrandMerchandising(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');
  const parsed = z
    .object({
      id: uuidSchema,
      merchandisingRank: z
        .string()
        .trim()
        .transform((value) => (value === '' ? null : Number(value)))
        .refine(
          (value) =>
            value === null ||
            (Number.isInteger(value) && value >= 1 && value <= 99),
          'Enter a position between 1 and 99, or leave it blank.',
        ),
      featured: z.boolean(),
    })
    .safeParse({
      id: formData.get('id'),
      merchandisingRank: String(formData.get('merchandisingRank') ?? ''),
      featured: formData.get('featured') === 'on',
    });
  if (!parsed.success) {
    return actionError('Check the merchandising fields.', toFieldErrors(parsed.error));
  }

  const input = parsed.data;
  const before = (
    await db
      .select({
        name: brands.name,
        merchandisingRank: brands.merchandisingRank,
        featured: brands.featured,
        slug: brands.slug,
      })
      .from(brands)
      .where(eq(brands.id, input.id))
      .limit(1)
  )[0];
  if (!before) return actionError('Brand not found.');

  await db.transaction(async (tx) => {
    await tx
      .update(brands)
      .set({
        merchandisingRank: input.merchandisingRank,
        featured: input.featured,
        updatedAt: new Date(),
      })
      .where(eq(brands.id, input.id));
    await recordAudit({
      actor,
      action: 'brand.merchandising_updated',
      entityType: 'brand',
      entityId: input.id,
      changes: diff(
        {
          merchandisingRank: before.merchandisingRank,
          featured: before.featured,
        },
        {
          merchandisingRank: input.merchandisingRank,
          featured: input.featured,
        },
      ),
      tx,
    });
  });

  revalidateBrandPaths([before.slug]);
  return actionOk();
}

export async function deleteBrand(formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff('products.manage');
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return actionError('Invalid brand.');

  const [brand] = await db
    .select({ id: brands.id, name: brands.name, slug: brands.slug })
    .from(brands)
    .where(eq(brands.id, id.data))
    .limit(1);
  if (!brand) return actionError('Brand not found.');

  const linked = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.brandId, brand.id))
    .limit(1);
  if (linked[0]) {
    return actionError(
      'This brand has products. Archive it instead so catalogue and order history stay intact.',
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(brands).where(eq(brands.id, brand.id));
    await recordAudit({
      actor,
      action: 'brand.deleted',
      entityType: 'brand',
      entityId: brand.id,
      changes: { name: { from: brand.name, to: null } },
      tx,
    });
  });

  revalidateBrandPaths([brand.slug]);
  redirect('/admin/brands');
}
