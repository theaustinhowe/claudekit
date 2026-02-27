"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type SyncStatusValue = "idle" | "saving" | "error";

interface SyncStatusContextValue {
  status: SyncStatusValue;
  reportSaving: () => void;
  reportSuccess: () => void;
  reportError: () => void;
}

export const SyncStatusContext = createContext<SyncStatusContextValue>({
  status: "idle",
  reportSaving: () => {},
  reportSuccess: () => {},
  reportError: () => {},
});

export function useSyncStatus(): SyncStatusContextValue {
  return useContext(SyncStatusContext);
}

export function useSyncStatusProvider(): SyncStatusContextValue {
  const [status, setStatus] = useState<SyncStatusValue>("idle");
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportSaving = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setStatus("saving");
  }, []);

  const reportSuccess = useCallback(() => {
    setStatus("idle");
  }, []);

  const reportError = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setStatus("error");
    // Auto-clear error after 10s
    clearTimerRef.current = setTimeout(() => {
      setStatus("idle");
    }, 10_000);
  }, []);

  return { status, reportSaving, reportSuccess, reportError };
}
