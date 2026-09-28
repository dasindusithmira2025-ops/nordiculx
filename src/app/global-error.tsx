'use client';

import './globals.css';

/**
 * Last-resort boundary for a failure in the root layout itself. It replaces the
 * whole document, so it carries its own <html> and styles and depends on
 * nothing that might be what just broke.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-surface text-fg min-h-dvh antialiased">
        <title>Something went wrong — Nordic Lux</title>
        <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-28 text-center">
          <p className="text-xs tracking-widest uppercase opacity-60">
            Nordic Lux
          </p>
          <h1 className="mt-6 text-3xl">Something went wrong</h1>
          <p className="mt-5 opacity-80">
            We could not load the site just now. Please try again in a moment.
            {error.digest ? ` Reference: ${error.digest}` : null}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-10 border px-6 py-3 text-sm tracking-widest uppercase"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
