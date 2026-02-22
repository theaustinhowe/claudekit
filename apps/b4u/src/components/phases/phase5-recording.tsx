"use client";

import { useSessionStream } from "@claudekit/hooks";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/api-state";
import { Phase5RecordingSkeleton } from "@/components/ui/phase-skeletons";
import { useApp } from "@/lib/store";
import type { FlowScript, RecordingStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const STATUS_LABELS: Record<RecordingStatus["status"], string> = {
  queued: "— Queued",
  seeding: "◇ Seeding Data",
  launching: "▸ Launching App",
  recording: "● Recording",
  processing: "↻ Processing",
  done: "✓ Done",
};
const STATUS_COLORS: Record<RecordingStatus["status"], string> = {
  queued: "hsl(var(--muted-foreground))",
  seeding: "hsl(var(--warning))",
  launching: "hsl(var(--info))",
  recording: "hsl(var(--destructive))",
  processing: "hsl(var(--primary))",
  done: "hsl(var(--success))",
};

interface Phase5RecordingProps {
  onComplete?: () => void;
}

export function Phase5Recording({ onComplete }: Phase5RecordingProps) {
  const { state } = useApp();
  const { data: flowScripts, loading, error, refetch } = useApi<FlowScript[]>(`/api/flow-scripts?runId=${state.runId}`);
  const { events, status: streamStatus } = useSessionStream({ sessionId: state.activeSessionId });
  const [recordings, setRecordings] = useState<RecordingStatus[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  // Check for recoverable recordings on mount
  useEffect(() => {
    if (recoveryChecked || !state.runId) return;
    setRecoveryChecked(true);

    fetch(`/api/recording/status?runId=${state.runId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.hasRecoverable && data.sessions?.length > 0) {
          // Check the last session status
          const lastSession = data.sessions[0];
          if (lastSession.status === "running" && state.activeSessionId) {
            // Already tracking this session — do nothing
          } else if (lastSession.status === "error") {
            // Show the error state — recordings failed, user can retry
            setRecordings((prev) =>
              prev.map((rec) => ({
                ...rec,
                status: "queued" as const,
                progress: 0,
              })),
            );
          }
        }
      })
      .catch(() => {
        // Silently ignore recovery check errors
      });
  }, [state.runId, state.activeSessionId, recoveryChecked]);

  // Initialize recordings from API data
  useEffect(() => {
    if (flowScripts && flowScripts.length > 0 && recordings.length === 0) {
      setRecordings(
        flowScripts.map((f) => ({
          flowId: f.flowId,
          flowName: f.flowName,
          status: "queued" as const,
          progress: 0,
        })),
      );
    }
  }, [flowScripts, recordings.length]);

  // Update recordings from real session stream events
  useEffect(() => {
    if (events.length === 0 || recordings.length === 0) return;

    const lastEvent = events[events.length - 1];

    // Update overall progress from stream events
    if (lastEvent.progress !== undefined) {
      setOverallProgress(lastEvent.progress);
    }

    // Update per-flow status from stream event data
    if (lastEvent.data) {
      const data = lastEvent.data as { flowId?: string; status?: string; progress?: number };
      if (data.flowId) {
        setRecordings((prev) =>
          prev.map((rec) => {
            if (rec.flowId === data.flowId) {
              return {
                ...rec,
                status: (data.status as RecordingStatus["status"]) ?? rec.status,
                progress: data.progress ?? rec.progress,
              };
            }
            return rec;
          }),
        );
      }
    }

    // On done event, mark all remaining as done
    if (lastEvent.type === "done") {
      setOverallProgress(100);
      setRecordings((prev) =>
        prev.map((rec) => ({
          ...rec,
          status: "done" as const,
          progress: 100,
        })),
      );
      onComplete?.();
    }
  }, [events, recordings.length, onComplete]);

  // Handle stream completion/error
  useEffect(() => {
    if (streamStatus === "done") {
      setOverallProgress(100);
      setRecordings((prev) => prev.map((rec) => ({ ...rec, status: "done" as const, progress: 100 })));
    }
  }, [streamStatus]);

  if (loading) return <Phase5RecordingSkeleton />;
  if (error || !flowScripts) return <ErrorState message={error || "No flow data"} onRetry={refetch} />;

  const allDone = recordings.length > 0 && recordings.every((r) => r.status === "done");

  return (
    <div className="h-full flex flex-col animate-slide-in-right">
      <div className="px-4 py-3 border-b border-border text-xs font-medium flex items-center gap-2 text-muted-foreground bg-card">
        <span style={{ color: allDone ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
          {allDone ? "\u2713" : "\u25CF"}
        </span>
        {allDone ? "RECORDING COMPLETE" : "RECORDING IN PROGRESS"}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Overall progress */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xs text-muted-foreground">OVERALL</span>
            <span className="text-2xs font-medium text-primary">{Math.round(overallProgress)}%</span>
          </div>
          <div
            className="h-[4px] w-full overflow-hidden bg-muted border border-border"
            style={{ borderRadius: "99px" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${overallProgress}%`,
                background: allDone ? "hsl(var(--success))" : "hsl(var(--primary))",
                transition: "width 300ms linear",
              }}
            />
          </div>
        </div>

        {/* Per-flow cards */}
        {recordings.map((rec) => (
          <div key={rec.flowId} className="p-3 bg-card border border-border rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">{rec.flowName}</span>
              <span
                className="text-2xs px-2 py-0.5 font-medium rounded-sm"
                style={{
                  color: STATUS_COLORS[rec.status],
                  background: `${STATUS_COLORS[rec.status]}15`,
                  border: `1px solid ${STATUS_COLORS[rec.status]}30`,
                }}
              >
                {STATUS_LABELS[rec.status]}
              </span>
            </div>
            <div className="h-[3px] w-full overflow-hidden bg-background" style={{ borderRadius: "99px" }}>
              <div
                className="h-full transition-all"
                style={{
                  width: `${rec.progress}%`,
                  background: STATUS_COLORS[rec.status],
                  transition: "width 300ms linear",
                }}
              />
            </div>
          </div>
        ))}

        {/* Status message from stream */}
        {!allDone && events.length > 0 && (
          <div className="text-2xs text-muted-foreground">{events[events.length - 1].message ?? "Recording..."}</div>
        )}
      </div>
    </div>
  );
}
