"use client";

import { useCallback, useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import { useSyncStatus } from "./use-sync-status";

export function useStateSync() {
  const { state } = useApp();
  const { reportSaving, reportSuccess, reportError } = useSyncStatus();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastJsonRef = useRef<string>("");
  const pendingPayloadRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const prevRunIdRef = useRef<string | null>(null);

  // Keep runId in a ref so event listeners always see the latest value
  runIdRef.current = state.runId;

  const flushBeacon = useCallback(() => {
    const payload = pendingPayloadRef.current;
    const runId = runIdRef.current;
    if (!payload || !runId) return;

    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon(`/api/runs/${runId}/state`, blob);
    pendingPayloadRef.current = null;
  }, []);

  // beforeunload + visibilitychange listeners (registered once)
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushBeacon();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushBeacon();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushBeacon]);

  // Check if any threads exist (proxy for "has data to persist")
  const hasThreads = Object.values(state.threads).some((arr) => arr.length > 0);

  // Combined effect: flush old run's pending state, then eager-save new run's state
  useEffect(() => {
    // Flush pending state from previous run
    if (prevRunIdRef.current && prevRunIdRef.current !== state.runId) {
      const payload = pendingPayloadRef.current;
      if (payload) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(`/api/runs/${prevRunIdRef.current}/state`, blob);
        pendingPayloadRef.current = null;
        lastJsonRef.current = "";
      }
    }

    // Eager save for new run (only on runId change)
    if (state.runId && hasThreads && prevRunIdRef.current !== state.runId) {
      const payload = JSON.stringify({
        currentPhase: state.currentPhase,
        phaseStatuses: state.phaseStatuses,
        activeThreadIds: state.activeThreadIds,
        projectPath: state.projectPath,
        projectName: state.projectName,
      });

      reportSaving();
      fetch(`/api/runs/${state.runId}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      })
        .then(() => {
          lastJsonRef.current = payload;
          pendingPayloadRef.current = null;
          reportSuccess();
        })
        .catch((err) => {
          console.error("[useStateSync] Failed to persist state:", err);
          reportError();
        });
    }

    // Update ref AFTER both checks so the guards work correctly
    prevRunIdRef.current = state.runId;
  }, [
    state.runId,
    hasThreads,
    state.currentPhase,
    state.phaseStatuses,
    state.activeThreadIds,
    state.projectPath,
    state.projectName,
    reportSaving,
    reportSuccess,
    reportError,
  ]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      flushBeacon();
    };
  }, [flushBeacon]);

  // Debounced save on state changes
  useEffect(() => {
    if (!state.runId || !hasThreads) return;

    const payload = JSON.stringify({
      currentPhase: state.currentPhase,
      phaseStatuses: state.phaseStatuses,
      activeThreadIds: state.activeThreadIds,
      projectPath: state.projectPath,
      projectName: state.projectName,
    });

    // Skip if nothing changed
    if (payload === lastJsonRef.current) return;

    // Always track latest unsaved payload for beacon flush
    pendingPayloadRef.current = payload;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const attemptSave = (retry: boolean) => {
        reportSaving();
        fetch(`/api/runs/${state.runId}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        })
          .then(() => {
            lastJsonRef.current = payload;
            pendingPayloadRef.current = null;
            reportSuccess();
          })
          .catch((err) => {
            console.error("[useStateSync] Failed to persist state:", err);
            if (retry) {
              // Single retry after 2s
              setTimeout(() => attemptSave(false), 2000);
            } else {
              reportError();
            }
          });
      };
      attemptSave(true);
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    state.runId,
    hasThreads,
    state.currentPhase,
    state.phaseStatuses,
    state.activeThreadIds,
    state.projectPath,
    state.projectName,
    reportSaving,
    reportSuccess,
    reportError,
  ]);
}
