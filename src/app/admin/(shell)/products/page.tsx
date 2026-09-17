import Image from 'next/image';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import {
  getAdminProductFacets,
  getAdminProductReferences,
  getRecentInventoryMovements,
  listProductsForAdmin,
  type AdminProductFilters,
} from '@/lib/admin/queries';
import {
  bulkEditProducts,
  createProduct,
  updateProductQuick,
} from '@/app/actions/admin';
import { formatMoney } from '@/lib/money';
import type { PublishStatus } from '@/lib/db/schema';
import { Badge } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { BulkSubmitButton } from '@/components/admin/products/bulk-submit-button';

type SearchParams = Record<string, string | string[] | undefined>;

const statusOptions: { value: PublishStatus; label: string }[] = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

async function updateProductQuickForm(formData: FormData) {
  'use server';
  await updateProductQuick(formData);
}

async function bulkEditProductsForm(formData: FormData) {
  'use server';
  await bulkEditProducts(formData);
}

async function createProductForm(formData: FormData) {
  'use server';
  await createProduct(formData);
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(params: SearchParams): AdminProductFilters {
  const status = first(params.status);
  const stock = first(params.stock);
  const promotion = first(params.promotion);
  return {
    query: first(params.q),
    brand: first(params.brand),
    category: first(params.category),
    status:
      status === 'published' || status === 'draft' || status === 'archived'
        ? status
        : undefined,
    stock:
      stock === 'in' || stock === 'low' || stock === 'out' ? stock : undefined,
    promotion: promotion === 'on' ? 'on' : undefined,
  };
}

function moneyInput(amount: number | null) {
  return amount === null ? '' : (amount / 100).toFixed(2);
}

function StatusBadge({ status }: { status: PublishStatus }) {
  if (status === 'published') return <Badge tone="success">Published</Badge>;
  if (status === 'archived') return <Badge tone="out">Archived</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireStaff('products.view');
  const params = await searchParams;
  const filters = parseFilters(params);

  const [products, facets, refs, movements] = await Promise.all([
    listProductsForAdmin(filters),
    getAdminProductFacets(),
    getAdminProductReferences(),
    getRecentInventoryMovements(12),
  ]);

  const low = products.filter((p) => p.lowStock);
  const out = products.filter((p) => p.available === 0);
  const onPromotion = products.filter((p) => p.onSale);

  return (
    <div className="space-y-8">
      <header className="border-line border-b pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow text-fg-subtle">Catalogue operations</p>
            <h1 className="font-display text-display-sm text-fg mt-3">
              {products.length} products
            </h1>
            <p className="text-fg-muted mt-3 max-w-2xl text-sm">
              Prices, sale prices, stock and visibility across the whole
              catalogue. Click a product to open its full editor — copy,
              imagery, ingredients, variants and SEO. Storefront pages
              revalidate after every save.
            </p>
            <p className="mt-3 text-xs">
              <Link href="/admin/brands" className="text-fg link-underline">
                Brand merchandising
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-right text-xs">
            <div>
              <p className="eyebrow text-fg-subtle">Low</p>
              <p className="text-fg mt-1 text-lg tabular-nums">{low.length}</p>
            </div>
            <div>
              <p className="eyebrow text-fg-subtle">Out</p>
              <p className="text-fg mt-1 text-lg tabular-nums">{out.length}</p>
            </div>
            <div>
              <p className="eyebrow text-fg-subtle">Promo</p>
              <p className="text-fg mt-1 text-lg tabular-nums">
                {onPromotion.length}
              </p>
            </div>
          </div>
        </div>
      </header>

      <section
        aria-label="Product filters"
        className="border-line border-b pb-6"
      >
        <form
          action="/admin/products"
          className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_repeat(5,minmax(8rem,auto))_auto]"
        >
          <label>
            <span className="eyebrow text-fg-subtle">Search products</span>
            <input
              name="q"
              defaultValue={filters.query ?? ''}
              placeholder="Name, SKU or brand"
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            />
          </label>
          <label>
            <span className="eyebrow text-fg-subtle">Brand</span>
            <select
              name="brand"
              defaultValue={filters.brand ?? ''}
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            >
              <option value="">All</option>
              {facets.brands.map((brand) => (
                <option key={brand.slug} value={brand.slug}>
                  {brand.name} ({brand.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="eyebrow text-fg-subtle">Category</span>
            <select
              name="category"
              defaultValue={filters.category ?? ''}
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            >
              <option value="">All</option>
              {facets.categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name} ({category.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="eyebrow text-fg-subtle">Status</span>
            <select
              name="status"
              defaultValue={filters.status ?? ''}
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            >
              <option value="">All</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="eyebrow text-fg-subtle">Stock</span>
            <select
              name="stock"
              defaultValue={filters.stock ?? ''}
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            >
              <option value="">All</option>
              <option value="in">In stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </label>
          <label>
            <span className="eyebrow text-fg-subtle">Promotion</span>
            <select
              name="promotion"
              defaultValue={filters.promotion ?? ''}
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            >
              <option value="">All</option>
              <option value="on">On sale</option>
            </select>
          </label>
          <Button type="submit" size="sm" className="self-end">
            Apply
          </Button>
        </form>
      </section>

      <section
        aria-label="Bulk product actions"
        className="border-line border p-4"
      >
        <form
          id="bulk-products"
          action={bulkEditProductsForm}
          className="grid gap-4 md:grid-cols-[minmax(12rem,1fr)_10rem_9rem_auto]"
        >
          <label>
            <span className="eyebrow text-fg-subtle">Bulk action</span>
            <select
              name="bulkAction"
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              required
            >
              <option value="">Choose action</option>
              <option value="set_price">Set exact price</option>
              <option value="increase_amount">Increase price by USD</option>
              <option value="decrease_amount">Decrease price by USD</option>
              <option value="increase_percent">Increase price by %</option>
              <option value="decrease_percent">Decrease price by %</option>
              <option value="clear_sale">Clear sale price</option>
              <option value="restock">Restock selected</option>
              <option value="publish">Publish selected</option>
              <option value="draft">Unpublish selected</option>
            </select>
          </label>
          <label>
            <span className="eyebrow text-fg-subtle">Amount</span>
            <input
              name="bulkAmount"
              inputMode="decimal"
              placeholder="25.00 or 10"
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            />
          </label>
          <label>
            <span className="eyebrow text-fg-subtle">Restock</span>
            <input
              name="bulkStockDelta"
              type="number"
              min={1}
              placeholder="+20"
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            />
          </label>
          <BulkSubmitButton formId="bulk-products" />
        </form>
        <p className="text-fg-subtle mt-3 text-xs">
          Only checked rows are changed. Review the selected rows and values
          before applying a bulk operation.
        </p>
      </section>

      <section aria-label="Products" className="overflow-x-auto">
        <table className="w-full min-w-[82rem] text-sm">
          <thead>
            <tr className="border-line border-b text-left">
              <th className="eyebrow text-fg-subtle py-3 font-normal">
                Select
              </th>
              <th className="eyebrow text-fg-subtle py-3 font-normal">
                Product
              </th>
              <th className="eyebrow text-fg-subtle py-3 font-normal">SKU</th>
              <th className="eyebrow text-fg-subtle py-3 font-normal">
                Status
              </th>
              <th className="eyebrow text-fg-subtle py-3 font-normal">Price</th>
              <th className="eyebrow text-fg-subtle py-3 font-normal">Sale</th>
              <th className="eyebrow text-fg-subtle py-3 font-normal">Stock</th>
              <th className="eyebrow text-fg-subtle py-3 font-normal">
                Adjust
              </th>
              <th className="eyebrow text-fg-subtle py-3 font-normal">Save</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const formId = `product-${product.variantId}`;
              return (
                <tr key={product.variantId} className="border-line border-b">
                  <td className="py-4 align-top">
                    <input
                      form="bulk-products"
                      type="checkbox"
                      name="variantId"
                      value={product.variantId}
                      aria-label={`Select ${product.name}`}
                      className="size-4"
                    />
                  </td>
                  <td className="py-4 align-top">
                    <div className="flex min-w-80 gap-3">
                      <div className="bg-surface-sunken relative size-14 shrink-0 overflow-hidden">
                        {product.imageUrl ? (
                          <Image
                            src={product.imageUrl}
                            alt={product.imageAlt ?? product.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        {/* The name opens the full editor, which is what
                            clicking a product in a catalogue screen is
                            expected to do. The storefront link is kept as a
                            separate, explicitly labelled action — merging the
                            two is how this row ended up offering no way to
                            edit anything but the price. */}
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          className="text-fg link-retract font-medium"
                        >
                          {product.name}
                        </Link>
                        <p className="text-fg-subtle mt-1 text-xs">
                          {product.brandName}
                          {product.categoryName
                            ? ` · ${product.categoryName}`
                            : ''}
                        </p>
                        <p className="text-fg-subtle mt-1 text-xs">
                          {product.variantCount > 1
                            ? `${product.variantCount} variants`
                            : 'Single variant'}
                        </p>
                        <p className="mt-2 flex gap-3 text-xs">
                          <Link
                            href={`/admin/products/${product.id}/edit`}
                            className="text-fg link-underline"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/product/${product.slug}`}
                            className="text-fg-subtle link-underline"
                          >
                            View
                          </Link>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-fg-muted py-4 align-top tabular-nums">
                    {product.sku}
                    <input
                      form={formId}
                      type="hidden"
                      name="variantId"
                      value={product.variantId}
                    />
                  </td>
                  <td className="py-4 align-top">
                    <div className="space-y-2">
                      <StatusBadge status={product.status} />
                      <select
                        form={formId}
                        name="status"
                        defaultValue={product.status}
                        className="border-line-strong focus:border-fg text-fg block w-32 border-0 border-b bg-transparent py-1 text-xs outline-none"
                      >
                        {statusOptions.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-4 align-top">
                    <label>
                      <span className="sr-only">Regular USD price</span>
                      <input
                        form={formId}
                        name="price"
                        inputMode="decimal"
                        defaultValue={moneyInput(product.price)}
                        className="border-line-strong focus:border-fg text-fg w-24 border-0 border-b bg-transparent py-1 text-sm tabular-nums outline-none"
                      />
                    </label>
                    <p className="text-fg-subtle mt-1 text-xs">
                      {formatMoney(product.price)}
                    </p>
                  </td>
                  <td className="py-4 align-top">
                    <label>
                      <span className="sr-only">Sale USD price</span>
                      <input
                        form={formId}
                        name="salePrice"
                        inputMode="decimal"
                        defaultValue={moneyInput(product.salePrice)}
                        placeholder="None"
                        className="border-line-strong focus:border-fg text-fg w-24 border-0 border-b bg-transparent py-1 text-sm tabular-nums outline-none"
                      />
                    </label>
                    <p className="text-fg-subtle mt-1 text-xs">
                      {product.onSale
                        ? `${formatMoney(product.salePrice!)} live`
                        : 'No sale'}
                    </p>
                  </td>
                  <td className="py-4 align-top">
                    <p className="text-fg tabular-nums">{product.available}</p>
                    <p className="text-fg-subtle mt-1 text-xs">
                      {product.onHand} on hand · {product.reserved} reserved
                    </p>
                    {product.lowStock ? (
                      <div className="mt-2">
                        <Badge tone="low">Low</Badge>
                      </div>
                    ) : null}
                    {/* Restocking this variant emails everybody counted here. */}
                    {product.waiting > 0 ? (
                      <p className="text-signal-warning mt-1 text-xs">
                        {product.waiting} waiting
                      </p>
                    ) : null}
                  </td>
                  <td className="py-4 align-top">
                    <div className="flex items-end gap-2">
                      <label>
                        <span className="sr-only">Stock adjustment</span>
                        <input
                          form={formId}
                          name="stockDelta"
                          type="number"
                          placeholder="+5"
                          className="border-line-strong focus:border-fg text-fg w-20 border-0 border-b bg-transparent py-1 text-sm tabular-nums outline-none"
                        />
                      </label>
                      <select
                        form={formId}
                        name="stockReason"
                        defaultValue="manual_adjustment"
                        className="border-line-strong focus:border-fg text-fg w-32 border-0 border-b bg-transparent py-1 text-xs outline-none"
                      >
                        <option value="received">Restock</option>
                        <option value="manual_adjustment">Adjustment</option>
                        <option value="damaged">Damaged</option>
                        <option value="lost">Lost</option>
                      </select>
                    </div>
                    <input
                      form={formId}
                      name="stockNote"
                      placeholder="Reason"
                      className="border-line-strong focus:border-fg text-fg mt-2 w-56 border-0 border-b bg-transparent py-1 text-xs outline-none"
                    />
                  </td>
                  <td className="py-4 align-top">
                    <form id={formId} action={updateProductQuickForm}>
                      <Button type="submit" size="sm" variant="secondary">
                        Save
                      </Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1fr_24rem]">
        <section className="border-line border p-5">
          <h2 className="font-display text-fg text-xl">Add product</h2>
          <form
            action={createProductForm}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <label>
              <span className="eyebrow text-fg-subtle">Name</span>
              <input
                name="name"
                required
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              />
            </label>
            <label>
              <span className="eyebrow text-fg-subtle">SKU</span>
              <input
                name="sku"
                required
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              />
            </label>
            <label>
              <span className="eyebrow text-fg-subtle">Brand</span>
              <select
                name="brandId"
                required
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              >
                <option value="">Choose brand</option>
                {refs.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="eyebrow text-fg-subtle">Category</span>
              <select
                name="categoryId"
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              >
                <option value="">Uncategorised</option>
                {refs.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="eyebrow text-fg-subtle">Variant</span>
              <input
                name="variantName"
                defaultValue="Standard"
                required
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              />
            </label>
            <label>
              <span className="eyebrow text-fg-subtle">USD price</span>
              <input
                name="price"
                inputMode="decimal"
                required
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              />
            </label>
            <label>
              <span className="eyebrow text-fg-subtle">Opening stock</span>
              <input
                name="stock"
                type="number"
                min={0}
                defaultValue={0}
                required
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              />
            </label>
            <label>
              <span className="eyebrow text-fg-subtle">Status</span>
              <select
                name="status"
                defaultValue="draft"
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="eyebrow text-fg-subtle">Image URL</span>
              <input
                name="imageUrl"
                placeholder="/media/products/example.webp"
                className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
              />
            </label>
            <label className="md:col-span-2">
              <span className="eyebrow text-fg-subtle">Description</span>
              <textarea
                name="description"
                rows={4}
                className="border-line-strong focus:border-fg text-fg mt-2 w-full resize-y border-0 border-b bg-transparent py-2 text-sm outline-none"
              />
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Add product</Button>
            </div>
          </form>
        </section>

        <section className="border-line border p-5">
          <h2 className="font-display text-fg text-xl">
            Recent stock movement
          </h2>
          <ul className="mt-5 space-y-4">
            {movements.map((movement) => (
              <li key={movement.id} className="border-line border-b pb-4">
                <p className="text-fg text-sm">{movement.product_name}</p>
                <p className="text-fg-subtle mt-1 text-xs">
                  {movement.sku} · {movement.reason}
                </p>
                <p className="mt-2 text-xs tabular-nums">
                  <span className="text-fg">
                    {movement.on_hand_delta > 0 ? '+' : ''}
                    {movement.on_hand_delta}
                  </span>{' '}
                  <span className="text-fg-subtle">
                    now {movement.on_hand_after} on hand
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
