import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { PageHeader } from '@/components/admin/admin-ui';
import { BrandForm, type BrandFormValues } from '@/components/admin/brands/brand-form';

export const dynamic = 'force-dynamic';

const emptyBrand: BrandFormValues = {
  id: '',
  name: '',
  slug: '',
  tagline: '',
  description: '',
  story: '',
  logoUrl: '',
  heroImageUrl: '',
  originCountry: '',
  status: 'draft',
  featured: false,
  sortOrder: 0,
  merchandisingRank: null,
  seoTitle: '',
  seoDescription: '',
};

export default async function NewBrandPage() {
  await requireStaff('products.manage');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Brand management"
        title="Add brand"
        description="Create a complete brand record, including its logo, story, storefront controls, and search metadata."
        actions={
          <Link href="/admin/brands" className="text-fg link-underline text-xs">
            Back to brands
          </Link>
        }
      />
      <BrandForm values={emptyBrand} products={0} isNew />
    </div>
  );
}
