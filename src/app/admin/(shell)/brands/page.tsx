import Link from 'next/link';
import { can, requireStaff } from '@/lib/auth';
import { listBrandsForAdmin } from '@/lib/admin/brands';
import { saveBrandMerchandising } from '@/app/actions/admin-brands';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { BrandLogo } from '@/components/catalogue/brand-logo';
import {
  adminField,
  Cell,
  NoRows,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/admin/admin-ui';
import { RowForm } from '@/components/admin/row-form';

export const dynamic = 'force-dynamic';

export default async function AdminBrandsPage() {
  const user = await requireStaff('products.view');
  const canManage = can(user.staffRole, 'products.manage');
  const brands = await listBrandsForAdmin();

  const published = brands.filter((brand) => brand.status === 'published').length;
  const featured = brands.filter((brand) => brand.featured).length;
  const pinned = brands.filter((brand) => brand.merchandisingRank !== null).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue operations"
        title="Brands"
        description="Create and maintain every brand identity, storefront setting, logo, story, search field, and homepage placement from one workspace."
        actions={
          canManage ? (
            <ButtonLink href="/admin/brands/new" size="sm">
              Add brand
            </ButtonLink>
          ) : null
        }
        stats={[
          { label: 'Brands', value: brands.length },
          { label: 'Published', value: published },
          { label: 'Featured', value: featured },
          { label: 'Pinned', value: pinned },
        ]}
      />

      {brands.length === 0 ? <NoRows>No brands yet.</NoRows> : null}

      <Table>
        <thead>
          <tr>
            <Th>Brand</Th>
            <Th>Products</Th>
            <Th>Units sold</Th>
            <Th>Revenue</Th>
            <Th>Status</Th>
            <Th>Storefront</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {brands.map((brand) => (
            <tr key={brand.id}>
              <Td>
                <div className="flex items-center gap-3">
                  <BrandLogo
                    slug={brand.slug}
                    name={brand.name}
                    logoUrl={brand.logoUrl}
                    stage={34}
                    className="w-24 shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-fg block">{brand.name}</span>
                    <span className="text-fg-subtle mt-1 block text-xs">
                      {brand.slug}
                    </span>
                  </div>
                </div>
              </Td>
              <Td className="tabular-nums">
                <span>{brand.publishedProducts}</span>
                <span className="text-fg-subtle ml-1 text-xs">
                  / {brand.products} total
                </span>
              </Td>
              <Td className="tabular-nums">{brand.units}</Td>
              <Td className="tabular-nums">{formatMoney(brand.revenue)}</Td>
              <Td>
                <Badge tone={brand.status === 'published' ? 'success' : 'neutral'}>
                  {brand.status}
                </Badge>
              </Td>
              <Td>
                {canManage ? (
                  <RowForm id={brand.id} action={saveBrandMerchandising}>
                    <div className="flex flex-wrap items-end gap-3">
                      <Cell label="Pin" className="w-20">
                        <input
                          name="merchandisingRank"
                          type="number"
                          min={1}
                          max={99}
                          placeholder="Auto"
                          defaultValue={brand.merchandisingRank ?? ''}
                          className={adminField}
                        />
                      </Cell>
                      <label className="text-fg flex items-center gap-2 pb-2 text-xs">
                        <input
                          type="checkbox"
                          name="featured"
                          defaultChecked={brand.featured}
                          className="size-4"
                        />
                        Featured
                      </label>
                    </div>
                  </RowForm>
                ) : (
                  <span className="text-fg-subtle text-xs">
                    {brand.featured ? 'Featured' : 'Sales ranked'}
                  </span>
                )}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <Link
                    href={`/brands/${brand.slug}`}
                    className="text-fg link-underline"
                  >
                    View
                  </Link>
                  {canManage ? (
                    <Link
                      href={`/admin/brands/${brand.id}/edit`}
                      className="text-fg link-underline"
                    >
                      Edit
                    </Link>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
