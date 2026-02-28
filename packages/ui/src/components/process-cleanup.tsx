"use client";

import { Loader2, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./button";
import { Label } from "./label";

interface ProcessCleanupProps {
  /** Section label. Default: "Session Cleanup" */
  label?: string;
  /** API endpoint for cleanup. Default: "/api/sessions/cleanup" */
  cleanupUrl?: string;
  /** Noun for the items being cleaned up. Default: "session" */
  itemNoun?: string;
  className?: string;
}

function ProcessCleanup({
  label = "Session Cleanup",
  cleanupUrl = "/api/sessions/cleanup",
  itemNoun = "session",
}: ProcessCleanupProps) {
  const [running, setRunning] = useState<number | null>(null);
  const [killing, setKilling] = useState(false);

  const checkSessions = useCallback(async () => {
    try {
      const res = await fetch(cleanupUrl);
      if (res.ok) {
        const data = await res.json();
        setRunning(data.count);
      }
    } catch {
      setRunning(null);
    }
  }, [cleanupUrl]);

  useEffect(() => {
    checkSessions();
  }, [checkSessions]);

  const plural = running !== 1 ? `${itemNoun}s` : itemNoun;

  const handleCleanup = useCallback(async () => {
    setKilling(true);
    try {
      const res = await fetch(cleanupUrl, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Stopped ${data.stopped} ${data.stopped !== 1 ? `${itemNoun}s` : itemNoun}`);
        setRunning(0);
      }
    } catch {
      toast.error(`Failed to stop ${itemNoun}s`);
    } finally {
      setKilling(false);
    }
  }, [cleanupUrl, itemNoun]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <Label>{label}</Label>
        <p className="text-sm text-muted-foreground">
          {running === null
            ? `Check for background ${itemNoun}s`
            : running === 0
              ? `No ${itemNoun}s running`
              : `${running} ${plural} running`}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={handleCleanup} disabled={killing || running === 0}>
        {killing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Square className="w-4 h-4 mr-1.5" />}
        Stop All
      </Button>
    </div>
  );
}

export { ProcessCleanup, type ProcessCleanupProps };
