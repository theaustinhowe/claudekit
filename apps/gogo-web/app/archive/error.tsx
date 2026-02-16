"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@devkit/ui/components/button";

export default function ArchiveError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ArchiveError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-6 w-6" />
        <h2 className="text-lg font-semibold">Archive Error</h2>
      </div>
      <p className="text-sm text-muted-foreground">Failed to load archived jobs.</p>
      <Button onClick={reset} variant="outline" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}
