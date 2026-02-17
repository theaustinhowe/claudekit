"use client";

import { useAutoScroll } from "@devkit/hooks";
import { formatElapsed } from "@devkit/ui";
import { useCallback, useState } from "react";

interface LogEntry {
  log: string;
  logType: string;
}

interface SessionTerminalProps {
  logs: LogEntry[];
  progress: number;
  phase: string | null;
  status: "idle" | "connecting" | "streaming" | "done" | "error" | "cancelled" | "reconnecting";
  error: string | null;
  elapsed: number;
  label: string;
  onCancel?: () => void;
  onRetry?: () => void;
  minimized: boolean;
  onToggleMinimize: () => void;
}

function StatusIndicator({ status }: { status: SessionTerminalProps["status"] }) {
  if (status === "done") {
    return (
      <span className="text-success" style={{ fontSize: 14, lineHeight: 1 }}>
        &#10003;
      </span>
    );
  }
  if (status === "error" || status === "cancelled") {
    return (
      <span className="text-destructive" style={{ fontSize: 14, lineHeight: 1 }}>
        &#10007;
      </span>
    );
  }
  return (
    <div
      className="animate-pulse bg-primary opacity-70 shrink-0 rounded-full"
      style={{
        width: 8,
        height: 8,
      }}
    />
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const style: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.5,
    padding: "1px 0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  switch (entry.logType) {
    case "tool":
      style.color = "hsl(var(--info))";
      style.fontFamily = "var(--font-mono)";
      break;
    case "thinking":
      style.color = "hsl(var(--muted-foreground) / 0.7)";
      style.fontStyle = "italic";
      break;
    case "phase-separator":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
            color: "hsl(var(--muted-foreground))",
            fontSize: 11,
          }}
        >
          <div style={{ flex: 1, height: 1, background: "hsl(var(--border))" }} />
          <span>{entry.log}</span>
          <div style={{ flex: 1, height: 1, background: "hsl(var(--border))" }} />
        </div>
      );
    default:
      style.color = "hsl(var(--muted-foreground))";
      break;
  }

  return <div style={style}>{entry.log}</div>;
}

export function SessionTerminal({
  logs,
  progress,
  phase,
  status,
  error,
  elapsed,
  label,
  onCancel,
  onRetry,
  minimized,
  onToggleMinimize,
}: SessionTerminalProps) {
  const { containerRef, isAtBottom, scrollToBottom } = useAutoScroll(
    !minimized && (status === "streaming" || status === "connecting"),
  );
  const [copied, setCopied] = useState(false);

  const isActive = status === "streaming" || status === "connecting";

  const handleCopy = useCallback(() => {
    const text = logs.map((l) => l.log).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [logs]);

  return (
    <div
      className="bg-muted rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${
          status === "error"
            ? "hsl(var(--destructive))"
            : status === "done"
              ? "hsl(var(--success))"
              : "hsl(var(--border))"
        }`,
      }}
    >
      {/* Header */}
      {/* biome-ignore lint/a11y/useSemanticElements: header contains nested interactive buttons, cannot be a single button */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "10px 12px", cursor: "pointer" }}
        role="button"
        tabIndex={0}
        onClick={onToggleMinimize}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggleMinimize();
        }}
      >
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <StatusIndicator status={status} />
          <span className="text-xs truncate text-muted-foreground">{phase ?? label}</span>
          {elapsed > 0 && <span className="text-xs text-muted-foreground shrink-0">{formatElapsed(elapsed)}</span>}
        </div>

        {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper stops propagation to parent button-like div */}
        <div
          className="flex items-center gap-1"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {progress > 0 && isActive && (
            <span className="text-xs font-medium text-primary mr-1">{Math.round(progress)}%</span>
          )}

          {logs.length > 0 && (
            <button
              type="button"
              onClick={handleCopy}
              className={`text-xs px-1.5 py-0.5 bg-transparent border-none cursor-pointer rounded-sm ${copied ? "text-success" : "text-muted-foreground"}`}
              title="Copy logs"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}

          {isActive && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs px-1.5 py-0.5 text-destructive bg-transparent border-none cursor-pointer rounded-sm"
              title="Cancel session"
            >
              Cancel
            </button>
          )}

          {(status === "error" || status === "cancelled") && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs px-1.5 py-0.5 text-primary bg-transparent border-none cursor-pointer rounded-sm"
              title="Retry connection"
            >
              Retry
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMinimize}
            className="text-xs px-1 py-0.5 text-muted-foreground bg-transparent border-none cursor-pointer rounded-sm"
            style={{
              fontSize: 16,
              lineHeight: 1,
            }}
            title={minimized ? "Expand" : "Collapse"}
          >
            {minimized ? "\u25B8" : "\u25BE"}
          </button>
        </div>
      </div>

      {/* Progress bar (always visible when active) */}
      {isActive && progress > 0 && (
        <div className="bg-card mx-3" style={{ height: 2 }}>
          <div
            className="bg-primary rounded-full"
            style={{
              height: "100%",
              width: `${progress}%`,
              transition: "width 300ms ease",
            }}
          />
        </div>
      )}

      {/* Log area */}
      {!minimized && (
        <div className="relative">
          <div
            ref={containerRef}
            className="border-t border-border"
            style={{
              maxHeight: 320,
              overflowY: "auto",
              padding: "8px 12px",
            }}
          >
            {logs.length === 0 ? (
              <div className="text-xs text-muted-foreground" style={{ padding: "8px 0" }}>
                {isActive ? "Waiting for output..." : "No logs available"}
              </div>
            ) : (
              logs.map((entry, i) => (
                <LogLine
                  key={/* biome-ignore lint/suspicious/noArrayIndexKey: log entries have no stable key */ i}
                  entry={entry}
                />
              ))
            )}

            {/* Error display */}
            {error && (
              <div
                className="text-destructive rounded-sm border border-destructive/15 bg-destructive/[0.08]"
                style={{
                  marginTop: 8,
                  padding: "6px 8px",
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Scroll-to-bottom button */}
          {!isAtBottom && isActive && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-muted border border-border rounded-full text-muted-foreground cursor-pointer shadow-lg"
              style={{
                padding: "3px 10px",
                fontSize: 11,
              }}
            >
              &#8595; Follow output
            </button>
          )}
        </div>
      )}
    </div>
  );
}
