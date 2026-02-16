"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 p-8">
          <h2 className="text-lg font-semibold text-destructive">Application Error</h2>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            A critical error occurred. Please try refreshing the page.
          </p>
          <button type="button" onClick={reset} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
