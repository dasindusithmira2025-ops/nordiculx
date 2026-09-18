import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getBrandForAdmin } from '@/lib/admin/brands';
import { PageHeader } from '@/components/admin/admin-ui';
import {
  BrandForm,
  DeleteBrandForm,
  type BrandFormValues,
} from '@/components/admin/brands/brand-form';

export const dynamic = 'force-dynamic';

export default async function EditBrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff('products.manage');
  const { id } = await params;
  const brand = await getBrandForAdmin(id);
  if (!brand) notFound();

  const values: BrandFormValues = {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    tagline: brand.tagline ?? '',
    description: brand.description ?? '',
    story: brand.story ?? '',
    logoUrl: brand.logoUrl ?? '',
    heroImageUrl: brand.heroImageUrl ?? '',
    originCountry: brand.originCountry ?? '',
    status: brand.status,
    featured: brand.featured,
    sortOrder: brand.sortOrder,
    merchandisingRank: brand.merchandisingRank,
    seoTitle: brand.seoTitle ?? '',
    seoDescription: brand.seoDescription ?? '',
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Brand management"
        title={brand.name}
        description={`${brand.products} linked catalogue product${brand.products === 1 ? '' : 's'}. Changes revalidate the storefront immediately.`}
        actions={
          <div className="flex gap-4 text-xs">
            <Link href={`/brands/${brand.slug}`} className="text-fg link-underline">
              View storefront
            </Link>
            <Link href="/admin/brands" className="text-fg link-underline">
              Back to brands
            </Link>
          </div>
        }
      />
      <BrandForm values={values} products={brand.products} isNew={false} />
      {brand.products === 0 ? (
        <DeleteBrandForm id={brand.id} name={brand.name} />
      ) : (
        <p className="border-line text-fg-subtle max-w-5xl border-t pt-6 text-xs">
          This brand cannot be deleted because products depend on it. Set its status to archived when it should leave the storefront.
        </p>
      )}
    </div>
  );
}
