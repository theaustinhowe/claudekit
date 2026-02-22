"use client";

import { GlobalErrorPage } from "@claudekit/ui/components/global-error-page";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return <GlobalErrorPage reset={reset} />;
}
