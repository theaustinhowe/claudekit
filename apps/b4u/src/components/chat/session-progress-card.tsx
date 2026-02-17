"use client";

import { useSessionStream } from "@devkit/hooks";
import { useState } from "react";
import { SessionTerminal } from "./session-terminal";

interface SessionProgressCardProps {
  sessionId: string;
  label: string;
}

export function SessionProgressCard({ sessionId, label }: SessionProgressCardProps) {
  const stream = useSessionStream({ sessionId });
  const { status, logs, phase, error, elapsed, cancel, reconnect, events } = stream;
  const progress = stream.progress ?? 0;
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const [expanded, setExpanded] = useState(false);

  const message = lastEvent?.message ?? label;
  const isDone = status === "done";
  const isError = status === "error";
  const isActive = status === "streaming" || status === "connecting";

  if (expanded) {
    return (
      <SessionTerminal
        logs={logs}
        progress={progress}
        phase={phase}
        status={status}
        error={error}
        elapsed={elapsed}
        label={label}
        onCancel={cancel}
        onRetry={reconnect}
        minimized={false}
        onToggleMinimize={() => setExpanded(false)}
      />
    );
  }

  return (
    <div
      className="min-w-[320px] px-4 py-3.5 bg-muted rounded-lg"
      style={{
        border: `1px solid ${isError ? "hsl(var(--destructive))" : isDone ? "hsl(var(--success))" : "hsl(var(--border))"}`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
          {isDone ? (
            <span className="text-success">&#10003;</span>
          ) : isError ? (
            <span className="text-destructive">&#10007;</span>
          ) : (
            <div className="w-[10px] h-[10px] rounded-full animate-pulse bg-primary opacity-60 shrink-0" />
          )}
          <span className="text-xs truncate text-muted-foreground">{message}</span>
          {elapsed > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {progress > 0 && isActive && (
            <span className="text-2xs font-medium text-primary">{Math.round(progress)}%</span>
          )}
          {isError && (
            <button
              type="button"
              onClick={reconnect}
              className="text-2xs font-medium px-2 py-0.5 rounded-sm transition-colors text-destructive border border-destructive/30 hover:bg-destructive/10"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-muted-foreground bg-transparent border-none cursor-pointer rounded-sm"
            style={{
              fontSize: 16,
              lineHeight: 1,
              padding: "0 2px",
            }}
            title="Expand terminal"
          >
            &#9654;
          </button>
        </div>
      </div>
      <div className="h-[3px] w-full overflow-hidden bg-card rounded-full">
        <div
          className="h-full transition-all"
          style={{
            width: `${progress}%`,
            background: isError ? "hsl(var(--destructive))" : isDone ? "hsl(var(--success))" : "hsl(var(--primary))",
            transition: "width 300ms ease",
          }}
        />
      </div>
    </div>
  );
}
