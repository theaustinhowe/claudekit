"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import type { Phase, PhaseThread } from "@/lib/types";

/**
 * Debounced persistence of individual thread data (messages + decisions)
 * to /api/runs/[runId]/threads/[threadId].
 */
export function useThreadSync() {
  const { state } = useApp();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotsRef = useRef<Record<string, string>>({});
  const runIdRef = useRef<string | null>(null);

  runIdRef.current = state.runId;

  useEffect(() => {
    if (!state.runId) return;

    // Collect all threads that have changed
    const pendingUpdates: Array<{ threadId: string; thread: PhaseThread }> = [];

    for (let p = 1; p <= 7; p++) {
      const phase = p as Phase;
      for (const thread of state.threads[phase]) {
        const snapshot = JSON.stringify({
          messages: thread.messages,
          decisions: thread.decisions,
          status: thread.status,
        });
        if (snapshot !== lastSnapshotsRef.current[thread.id]) {
          pendingUpdates.push({ threadId: thread.id, thread });
          lastSnapshotsRef.current[thread.id] = snapshot;
        }
      }
    }

    if (pendingUpdates.length === 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const runId = runIdRef.current;
      if (!runId) return;

      for (const { threadId, thread } of pendingUpdates) {
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
        }).catch((err) => {
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
}
