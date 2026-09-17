/**
 * Shown while the product and its reference lists load.
 *
 * Skeleton bars rather than a spinner: the editor is a long form, and a
 * centred spinner on an empty page gives no sense of how much is coming.
 */
export default function EditProductLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading product">
      <div className="border-line border-b pb-5">
        <div className="bg-surface-sunken h-3 w-24 animate-pulse" />
        <div className="bg-surface-sunken mt-3 h-8 w-80 max-w-full animate-pulse" />
        <div className="bg-surface-sunken mt-3 h-3 w-full max-w-2xl animate-pulse" />
      </div>

      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-4">
          <div className="bg-surface-sunken h-5 w-40 animate-pulse" />
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((field) => (
              <div key={field} className="space-y-2">
                <div className="bg-surface-sunken h-2 w-20 animate-pulse" />
                <div className="bg-surface-sunken h-7 w-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <span className="sr-only">Loading product…</span>
    </div>
  );
}
