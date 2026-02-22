"use client";

import { ErrorPage } from "@claudekit/ui/components/error-page";
import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return <ErrorPage error={error} reset={reset} />;
}
