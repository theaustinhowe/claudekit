"use client";

import { GlobalErrorPage } from "@claudekit/ui/components/global-error-page";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <GlobalErrorPage reset={reset} />;
}
