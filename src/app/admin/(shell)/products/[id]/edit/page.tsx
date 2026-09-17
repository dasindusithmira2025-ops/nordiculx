import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import {
  getProductEditorReferences,
  getProductForEdit,
} from '@/lib/admin/product-detail';
import {
  deleteProductMedia,
  deleteProductVariant,
  saveProductMedia,
  saveProductVariant,
} from '@/app/actions/admin-products';
import {
  mediaKindEnum,
  publishStatusEnum,
  routineStepEnum,
  skinTypeEnum,
} from '@/lib/db/schema';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { adminField, Cell, PageHeader } from '@/components/admin/admin-ui';
import { RowForm } from '@/components/admin/row-form';
import { ProductForm } from '@/components/admin/products/product-form';

/**
 * Edit one product, completely.
 *
 * Reached by clicking any row on /admin/products. The list screen remains the
 * place to change a price across fifty products at once; this is the place to
 * change everything about one of them, which previously had no place at all.
 */

export const dynamic = 'force-dynamic';

/** Money is stored in cents and typed in dollars. The boundary is here. */
function moneyInput(amount: number | null) {
  return amount === null ? '' : (amount / 100).toFixed(2);
}

/** `<input type="date">` wants YYYY-MM-DD in the viewer's own terms. */
function dateInput(date: Date | null) {
  if (!date) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff('products.manage');
  const { id } = await params;

  const [product, refs] = await Promise.all([
    getProductForEdit(id),
    getProductEditorReferences(),
  ]);
  if (!product) notFound();

  const totalReserved = product.variants.reduce((n, v) => n + v.reserved, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Product"
        title={product.name}
        description={
          <>
            Everything about this product. Prices and stock sit with each
            variant below — a 30ml and a 100ml are different prices and
            different stock.{' '}
            <Link
              href={`/product/${product.slug}`}
              className="link-underline text-fg"
            >
              View on the storefront
            </Link>
            .
          </>
        }
        actions={
          <Link
            href="/admin/products"
            className="eyebrow text-fg-subtle hover:text-fg link-underline"
          >
            ← All products
          </Link>
        }
        stats={[
          { label: 'Variants', value: product.variants.length },
          { label: 'Sold', value: product.unitsSold },
          { label: 'Reserved', value: totalReserved },
        ]}
      />

      {product.deletedAt ? (
        <p
          role="status"
          className="border-line text-fg-muted border p-4 text-sm"
        >
          This product is soft-deleted and is not shown anywhere on the
          storefront. Its data and its order history are intact.
        </p>
      ) : null}

      <ProductForm
        values={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
          brandId: product.brandId,
          categoryId: product.categoryId ?? '',
          subtitle: product.subtitle ?? '',
          excerpt: product.excerpt ?? '',
          description: product.description ?? '',
          benefits: product.benefits.join('\n'),
          howToUse: product.howToUse ?? '',
          ingredientsList: product.ingredientsList ?? '',
          routineStep: product.routineStep ?? '',
          suitableSkinTypes: product.suitableSkinTypes,
          collectionIds: product.collectionIds,
          concernIds: product.concernIds,
          featured: product.featured,
          bestSeller: product.bestSeller,
          newUntil: dateInput(product.newUntil),
          seoTitle: product.seoTitle ?? '',
          seoDescription: product.seoDescription ?? '',
        }}
        brands={refs.brands}
        categories={refs.categories}
        collections={refs.collections}
        concerns={refs.concerns}
        statuses={publishStatusEnum.enumValues}
        skinTypes={skinTypeEnum.enumValues}
        routineSteps={routineStepEnum.enumValues}
        unitsSold={product.unitsSold}
      />

      {/* --- variants ------------------------------------------------------ */}
      <section aria-label="Variants" className="border-line border-t pt-8">
        <h2 className="font-display text-fg text-xl">
          Variants, pricing and stock
        </h2>
        <p className="text-fg-subtle mt-1 text-xs">
          Each row saves on its own. Stock is an absolute figure — the
          difference is written to the stock ledger as a stock take, and units
          reserved by open orders cannot be counted away.
        </p>

        <div className="mt-6 space-y-6">
          {product.variants.map((variant) => (
            <RowForm
              key={variant.id}
              id={variant.id}
              action={saveProductVariant}
              remove={deleteProductVariant}
              removeLabel="Retire variant"
              className="border-line border p-4"
            >
              <input type="hidden" name="productId" value={product.id} />

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Badge
                  tone={variant.status === 'published' ? 'success' : 'neutral'}
                >
                  {variant.sku}
                </Badge>
                {variant.isDefault ? (
                  <Badge tone="neutral">Default</Badge>
                ) : null}
                <span className="text-fg-subtle text-xs tabular-nums">
                  {variant.available} sellable · {variant.reserved} reserved ·{' '}
                  {formatMoney(variant.salePrice ?? variant.price)} live
                </span>
              </div>

              <VariantFields variant={variant} />
            </RowForm>
          ))}

          <details className="border-line border">
            <summary className="text-fg cursor-pointer px-4 py-3 text-sm">
              Add a variant
            </summary>
            <div className="border-line border-t p-4">
              <RowForm
                id=""
                action={saveProductVariant}
                saveLabel="Add variant"
              >
                <input type="hidden" name="productId" value={product.id} />
                <VariantFields variant={null} />
              </RowForm>
            </div>
          </details>
        </div>
      </section>

      {/* --- media --------------------------------------------------------- */}
      <section aria-label="Media" className="border-line border-t pt-8">
        <h2 className="font-display text-fg text-xl">Media</h2>
        <p className="text-fg-subtle mt-1 text-xs">
          The lowest position is the primary image; the next one is the hover
          shot on product cards. Alt text may be empty only for a genuinely
          decorative asset.
        </p>

        <div className="mt-6 space-y-4">
          {product.media.map((asset) => (
            <RowForm
              key={asset.id}
              id={asset.id}
              action={saveProductMedia}
              remove={deleteProductMedia}
              className="border-line border p-4"
            >
              <input type="hidden" name="productId" value={product.id} />
              <MediaFields asset={asset} />
            </RowForm>
          ))}

          {product.media.length === 0 ? (
            <p className="text-fg-muted text-sm">
              No imagery yet. Product cards fall back to a blank frame.
            </p>
          ) : null}

          <details className="border-line border">
            <summary className="text-fg cursor-pointer px-4 py-3 text-sm">
              Add an asset
            </summary>
            <div className="border-line border-t p-4">
              <RowForm id="" action={saveProductMedia} saveLabel="Add asset">
                <input type="hidden" name="productId" value={product.id} />
                <MediaFields asset={null} />
              </RowForm>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

function VariantFields({
  variant,
}: {
  variant: {
    name: string;
    sku: string;
    optionLabel: string | null;
    price: number;
    salePrice: number | null;
    compareAtPrice: number | null;
    weightGrams: number | null;
    volumeMl: number | null;
    barcode: string | null;
    imageUrl: string | null;
    status: string;
    isDefault: boolean;
    sortOrder: number;
    onHand: number;
    lowStockThreshold: number;
    allowBackorder: boolean;
  } | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Cell label="Variant name" hint="30ml, 100ml, Deep Sand…">
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={variant?.name ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell label="SKU">
          <input
            name="sku"
            required
            maxLength={80}
            defaultValue={variant?.sku ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell label="Second option" hint="Optional shade or finish.">
          <input
            name="optionLabel"
            maxLength={80}
            defaultValue={variant?.optionLabel ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell label="Status">
          <select
            name="status"
            defaultValue={variant?.status ?? 'published'}
            className={adminField}
          >
            {publishStatusEnum.enumValues.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Cell>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Cell label="Price (USD)">
          <input
            name="price"
            inputMode="decimal"
            required
            defaultValue={moneyInput(variant?.price ?? null)}
            className={adminField}
          />
        </Cell>
        <Cell label="Sale price (USD)" hint="Blank means not on sale.">
          <input
            name="salePrice"
            inputMode="decimal"
            defaultValue={moneyInput(variant?.salePrice ?? null)}
            className={adminField}
          />
        </Cell>
        <Cell
          label="RRP (USD)"
          hint="Struck through, when the brand publishes one."
        >
          <input
            name="compareAtPrice"
            inputMode="decimal"
            defaultValue={moneyInput(variant?.compareAtPrice ?? null)}
            className={adminField}
          />
        </Cell>
        <Cell label="Position">
          <input
            name="sortOrder"
            type="number"
            min={0}
            max={999}
            defaultValue={variant?.sortOrder ?? 0}
            className={adminField}
          />
        </Cell>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Cell label="Stock on hand" hint="Absolute count, not an adjustment.">
          <input
            name="onHand"
            type="number"
            min={0}
            defaultValue={variant?.onHand ?? 0}
            className={adminField}
          />
        </Cell>
        <Cell label="Low stock at">
          <input
            name="lowStockThreshold"
            type="number"
            min={0}
            defaultValue={variant?.lowStockThreshold ?? 5}
            className={adminField}
          />
        </Cell>
        <Cell label="Volume (ml or g)">
          <input
            name="volumeMl"
            inputMode="decimal"
            defaultValue={variant?.volumeMl ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell label="Shipping weight (g)">
          <input
            name="weightGrams"
            type="number"
            min={0}
            defaultValue={variant?.weightGrams ?? ''}
            className={adminField}
          />
        </Cell>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_9rem]">
        <Cell label="Variant image URL">
          <input
            name="imageUrl"
            maxLength={500}
            placeholder="/media/products/example.webp"
            defaultValue={variant?.imageUrl ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell label="Barcode">
          <input
            name="barcode"
            maxLength={80}
            defaultValue={variant?.barcode ?? ''}
            className={adminField}
          />
        </Cell>
        <label className="text-fg flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={variant?.isDefault ?? false}
            className="size-4"
          />
          Default
        </label>
        <label className="text-fg flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="allowBackorder"
            defaultChecked={variant?.allowBackorder ?? false}
            className="size-4"
          />
          Backorder
        </label>
      </div>
    </div>
  );
}

function MediaFields({
  asset,
}: {
  asset: {
    kind: string;
    url: string;
    posterUrl: string | null;
    alt: string;
    sortOrder: number;
  } | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[8rem_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1fr)_7rem]">
      <Cell label="Kind">
        <select
          name="kind"
          defaultValue={asset?.kind ?? 'image'}
          className={adminField}
        >
          {mediaKindEnum.enumValues.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </Cell>
      <Cell label="URL">
        <input
          name="url"
          required
          maxLength={500}
          placeholder="/media/products/example.webp"
          defaultValue={asset?.url ?? ''}
          className={adminField}
        />
      </Cell>
      <Cell label="Alt text" hint="Empty only for a decorative asset.">
        <input
          name="alt"
          maxLength={200}
          defaultValue={asset?.alt ?? ''}
          className={adminField}
        />
      </Cell>
      <Cell label="Poster frame" hint="Video only.">
        <input
          name="posterUrl"
          maxLength={500}
          defaultValue={asset?.posterUrl ?? ''}
          className={adminField}
        />
      </Cell>
      <Cell label="Position">
        <input
          name="sortOrder"
          type="number"
          min={0}
          max={999}
          defaultValue={asset?.sortOrder ?? 0}
          className={adminField}
        />
      </Cell>
    </div>
  );
}
