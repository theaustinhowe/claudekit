"use client";

import { GlobalErrorPage } from "@devkit/ui/components/global-error-page";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <GlobalErrorPage reset={reset} />;
}
