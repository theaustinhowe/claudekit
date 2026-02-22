"use client";

import { useCallback, useEffect, useRef } from "react";
import { useApp } from "@/lib/store";

export function useStateSync() {
  const { state } = useApp();
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
    if (state.runId && state.messages.length > 0 && prevRunIdRef.current !== state.runId) {
      const payload = JSON.stringify({
        messages: state.messages,
        currentPhase: state.currentPhase,
        phaseStatuses: state.phaseStatuses,
        projectPath: state.projectPath,
        projectName: state.projectName,
      });

      fetch(`/api/runs/${state.runId}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
        .then(() => {
          lastJsonRef.current = payload;
          pendingPayloadRef.current = null;
        })
        .catch(console.error);
    }

    // Update ref AFTER both checks so the guards work correctly
    prevRunIdRef.current = state.runId;
  }, [state.runId, state.messages, state.currentPhase, state.phaseStatuses, state.projectPath, state.projectName]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      flushBeacon();
    };
  }, [flushBeacon]);

  // Debounced save on state changes
  useEffect(() => {
    if (!state.runId || state.messages.length === 0) return;

    const payload = JSON.stringify({
      messages: state.messages,
      currentPhase: state.currentPhase,
      phaseStatuses: state.phaseStatuses,
      projectPath: state.projectPath,
      projectName: state.projectName,
    });

    // Skip if nothing changed
    if (payload === lastJsonRef.current) return;

    // Always track latest unsaved payload for beacon flush
    pendingPayloadRef.current = payload;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      fetch(`/api/runs/${state.runId}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
        .then(() => {
          // Only mark as saved after successful persist
          lastJsonRef.current = payload;
          // Clear pending — successful save means beacon is unnecessary
          pendingPayloadRef.current = null;
        })
        .catch((err) => {
          console.error("[useStateSync] Failed to persist state:", err);
        });
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.runId, state.messages, state.currentPhase, state.phaseStatuses, state.projectPath, state.projectName]);
}
