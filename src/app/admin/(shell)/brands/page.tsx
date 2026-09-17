import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { listBrandsForMerchandising } from '@/lib/admin/brands';
import { saveBrandMerchandising } from '@/app/actions/admin-products';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
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

/**
 * Brand merchandising.
 *
 * The homepage's Top Selling Brands row is ordered by units actually sold on
 * paid orders. That is the right default and it is not negotiable from here —
 * there is no field on this screen that can inflate a brand's sales.
 *
 * What staff CAN do is pin: a position puts a brand at that slot regardless of
 * the order book, for a launch or an exclusivity window that sales data has no
 * way of knowing about. Everything left blank keeps ranking on what people
 * bought — which is almost everything.
 */
export const dynamic = 'force-dynamic';

export default async function AdminBrandsPage() {
  await requireStaff('products.view');
  const brands = await listBrandsForMerchandising();

  const pinned = brands.filter((b) => b.merchandisingRank !== null).length;
  const selling = brands.filter((b) => b.units > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Merchandising"
        title="Brands"
        description={
          <>
            Leave the position blank — which is the normal case — and the brand
            ranks on what it has actually sold. A number pins it to that slot in
            the homepage Top Selling Brands row. Units and revenue below count
            paid orders only, excluding anything cancelled or returned.{' '}
            <Link href="/admin/products" className="link-underline text-fg">
              Back to products
            </Link>
            .
          </>
        }
        stats={[
          { label: 'Brands', value: brands.length },
          { label: 'Selling', value: selling },
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
            <Th>Merchandising</Th>
          </tr>
        </thead>
        <tbody>
          {brands.map((brand) => (
            <tr key={brand.id}>
              <Td>
                <span className="text-fg">{brand.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge
                    tone={brand.status === 'published' ? 'success' : 'neutral'}
                  >
                    {brand.status}
                  </Badge>
                  <Link
                    href={`/brands/${brand.slug}`}
                    className="text-fg-subtle link-underline text-xs"
                  >
                    /brands/{brand.slug}
                  </Link>
                </span>
              </Td>
              <Td className="tabular-nums">{brand.publishedProducts}</Td>
              <Td className="tabular-nums">{brand.units}</Td>
              <Td className="tabular-nums">{formatMoney(brand.revenue)}</Td>
              <Td>
                <RowForm id={brand.id} action={saveBrandMerchandising}>
                  <div className="flex flex-wrap items-end gap-4">
                    <Cell label="Pin to position" className="w-28">
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
                    <label className="text-fg flex items-center gap-2 pb-2 text-sm">
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
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
