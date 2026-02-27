"use client";

import { useCallback, useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import type { Phase, PhaseThread } from "@/lib/types";

/**
 * Debounced persistence of individual thread data (messages + decisions)
 * to /api/runs/[runId]/threads/[threadId].
 * Includes sendBeacon fallback on tab close / visibility hidden.
 */
export function useThreadSync() {
  const { state } = useApp();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotsRef = useRef<Record<string, string>>({});
  const pendingUpdatesRef = useRef<Array<{ threadId: string; thread: PhaseThread; runId: string }>>([]);
  const runIdRef = useRef<string | null>(null);

  runIdRef.current = state.runId;

  const flushPendingBeacon = useCallback(() => {
    const updates = pendingUpdatesRef.current;
    if (updates.length === 0) return;

    for (const { threadId, thread, runId } of updates) {
      const blob = new Blob(
        [
          JSON.stringify({
            phase: thread.phase,
            revision: thread.revision,
            messages: thread.messages,
            decisions: thread.decisions,
            status: thread.status,
            createdAt: thread.createdAt,
          }),
        ],
        { type: "application/json" },
      );
      navigator.sendBeacon(`/api/runs/${runId}/threads/${threadId}`, blob);
    }
    pendingUpdatesRef.current = [];
  }, []);

  // beforeunload + visibilitychange listeners (registered once)
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPendingBeacon();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingBeacon();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushPendingBeacon]);

  useEffect(() => {
    if (!state.runId) return;

    // Collect all threads that have changed
    const newPending: Array<{ threadId: string; thread: PhaseThread; runId: string }> = [];

    for (let p = 1; p <= 7; p++) {
      const phase = p as Phase;
      for (const thread of state.threads[phase]) {
        const snapshot = JSON.stringify({
          messages: thread.messages,
          decisions: thread.decisions,
          status: thread.status,
        });
        if (snapshot !== lastSnapshotsRef.current[thread.id]) {
          newPending.push({ threadId: thread.id, thread, runId: state.runId });
          lastSnapshotsRef.current[thread.id] = snapshot;
        }
      }
    }

    if (newPending.length === 0) return;

    // Track pending for beacon flush
    pendingUpdatesRef.current = newPending;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const runId = runIdRef.current;
      if (!runId) return;

      for (const { threadId, thread } of newPending) {
        fetch(`/api/runs/${runId}/threads/${threadId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: thread.phase,
            revision: thread.revision,
            messages: thread.messages,
            decisions: thread.decisions,
            status: thread.status,
            createdAt: thread.createdAt,
          }),
          signal: AbortSignal.timeout(10_000),
        })
          .then(() => {
            // Clear pending for successfully saved threads
            pendingUpdatesRef.current = pendingUpdatesRef.current.filter((u) => u.threadId !== threadId);
          })
          .catch((err) => {
            console.error(`[useThreadSync] Failed to persist thread ${threadId}:`, err);
            // Remove from snapshot cache so it retries next cycle
            delete lastSnapshotsRef.current[threadId];
          });
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.runId, state.threads]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      flushPendingBeacon();
    };
  }, [flushPendingBeacon]);
}
