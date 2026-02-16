"use client";

import { useAutoScroll } from "@devkit/hooks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Pause, Play, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@devkit/ui";

interface LogEntry {
  level: number;
  time: number;
  msg: string;
  app?: string;
  service?: string;
  [key: string]: unknown;
}

interface LogViewerClientProps {
  app: string;
  initialLogs: LogEntry[];
}

const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

const LEVEL_COLORS: Record<number, string> = {
  10: "text-muted-foreground",
  20: "text-muted-foreground",
  30: "text-blue-400",
  40: "text-yellow-400",
  50: "text-red-400",
  60: "text-red-500 font-bold",
};

const MSG_COLORS: Record<number, string> = {
  10: "text-muted-foreground/70",
  20: "text-muted-foreground",
  40: "text-yellow-300/90",
  50: "text-red-300",
  60: "text-red-400 font-bold",
};

const ROW_BG_COLORS: Record<number, string> = {
  40: "bg-yellow-500/5",
  50: "bg-red-500/8",
  60: "bg-red-500/15",
};

function getLevelName(level: number): string {
  return LEVEL_NAMES[level] || `L${level}`;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 });
}

export function LogViewerClient({ app, initialLogs }: LogViewerClientProps) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<Set<number>>(new Set());
  const [tailing, setTailing] = useState(true);
  const { containerRef, isAtBottom, scrollToBottom } = useAutoScroll(tailing);
  const eventSourceRef = useRef<EventSource | null>(null);

  // SSE connection for real-time tailing
  useEffect(() => {
    if (!tailing) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const es = new EventSource(`/api/logs/${app}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry;
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > 5000 ? next.slice(-5000) : next;
        });
      } catch {
        // Skip non-JSON messages
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [app, tailing]);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (levelFilter.size > 0) {
      result = result.filter((e) => levelFilter.has(e.level));
    }
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((e) => {
        const text = `${e.msg} ${e.service || ""} ${JSON.stringify(e)}`.toLowerCase();
        return text.includes(q);
      });
    }
    return result;
  }, [logs, filter, levelFilter]);

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 24,
    overscan: 20,
  });

  const toggleLevel = useCallback((level: number) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="border-b px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm"
          />
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setLevelFilter(new Set())}
            className={cn(
              "px-2 py-1 text-xs rounded border transition-colors",
              levelFilter.size === 0
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-accent",
            )}
          >
            All
          </button>
          {[10, 20, 30, 40, 50, 60].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleLevel(level)}
              className={cn(
                "px-2 py-1 text-xs rounded border transition-colors",
                levelFilter.has(level)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent",
              )}
            >
              {getLevelName(level)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setTailing(!tailing)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors",
            tailing ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent",
          )}
        >
          {tailing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {tailing ? "Pause" : "Tail"}
        </button>

        <span className="text-xs text-muted-foreground">{filteredLogs.length} entries</span>
      </div>

      {/* Log entries */}
      <div ref={containerRef} className="flex-1 overflow-auto font-mono text-xs" style={{ contain: "strict" }}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const entry = filteredLogs[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={cn(
                  "flex items-center px-4 hover:bg-accent/50 border-b border-border/30",
                  ROW_BG_COLORS[entry.level],
                )}
              >
                <span className="w-20 flex-shrink-0 text-muted-foreground">{formatTimestamp(entry.time)}</span>
                <span className={cn("w-12 flex-shrink-0 font-semibold", LEVEL_COLORS[entry.level] || "")}>
                  {getLevelName(entry.level)}
                </span>
                {entry.service && (
                  <span className="w-24 flex-shrink-0 text-muted-foreground truncate">[{entry.service}]</span>
                )}
                <span className={cn("truncate", MSG_COLORS[entry.level])}>{entry.msg}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="fixed bottom-6 right-6 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
