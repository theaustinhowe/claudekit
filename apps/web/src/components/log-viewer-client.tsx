"use client";

import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { Calendar } from "@claudekit/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@claudekit/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, CalendarIcon, Check, Copy, Pause, Play, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  date: string;
  isToday: boolean;
  initialLogs: LogEntry[];
  availableDates: string[];
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
  30: "text-info",
  40: "text-warning",
  50: "text-destructive",
  60: "text-destructive font-bold",
};

const MSG_COLORS: Record<number, string> = {
  10: "text-muted-foreground/70",
  20: "text-muted-foreground",
  40: "text-warning/90",
  50: "text-destructive/80",
  60: "text-destructive font-bold",
};

const ROW_BG_COLORS: Record<number, string> = {
  40: "bg-warning/8",
  50: "bg-destructive/10",
  60: "bg-destructive/20",
};

function getLevelName(level: number): string {
  return LEVEL_NAMES[level] || `L${level}`;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 });
}

export function LogViewerClient({ app, date, isToday, initialLogs, availableDates }: LogViewerClientProps) {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<Set<number>>(new Set());
  const [tailing, setTailing] = useState(isToday);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const userScrolledRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setIsAtBottom(true);
    userScrolledRef.current = false;
  }, []);

  // Track scroll position to detect when user scrolls away from bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distanceFromBottom < 50;
      setIsAtBottom(atBottom);
      userScrolledRef.current = !atBottom;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Set of available date strings for calendar highlighting
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);

  // SSE connection for real-time tailing (only when viewing today)
  useEffect(() => {
    if (!tailing || !isToday) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const es = new EventSource(`/api/logs/${app}/stream?date=${date}`);
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
  }, [app, date, tailing, isToday]);

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

  // Auto-scroll to bottom when new logs arrive (only if user hasn't scrolled up)
  const prevLogCountRef = useRef(filteredLogs.length);
  useEffect(() => {
    if (filteredLogs.length > prevLogCountRef.current && !userScrolledRef.current && tailing) {
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    prevLogCountRef.current = filteredLogs.length;
  }, [filteredLogs.length, tailing]);

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 32,
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

  const handleDateSelect = useCallback(
    (selected: Date | undefined) => {
      if (!selected) return;
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, "0");
      const d = String(selected.getDate()).padStart(2, "0");
      router.push(`/logs/${app}?date=${y}-${m}-${d}`);
    },
    [app, router],
  );

  const selectedDate = useMemo(() => new Date(`${date}T00:00:00`), [date]);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRowClick = useCallback((entry: LogEntry, index: number) => {
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    setCopiedIndex(index);
    copyTimeoutRef.current = setTimeout(() => setCopiedIndex(null), 1500);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden rounded-lg border">
      {/* Toolbar */}
      <div className="border-b px-5 py-3 flex items-center gap-3 flex-shrink-0 bg-muted/30">
        {/* Calendar day picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              {new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              disabled={(d) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                const ds = `${y}-${m}-${day}`;
                return !availableDateSet.has(ds);
              }}
              defaultMonth={selectedDate}
            />
          </PopoverContent>
        </Popover>

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

        {isToday && (
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
        )}
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto font-mono text-[13px] leading-relaxed"
        style={{ contain: "strict" }}
      >
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
              <Tooltip key={virtualItem.key}>
                <TooltipTrigger asChild>
                  {/* biome-ignore lint/a11y/useSemanticElements: virtualized list row with custom positioning */}
                  <div
                    role="button"
                    tabIndex={0}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className={cn(
                      "group flex items-center px-5 hover:bg-accent/50 border-b border-border/30 cursor-pointer select-none",
                      ROW_BG_COLORS[entry.level],
                    )}
                    onClick={() => handleRowClick(entry, virtualItem.index)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handleRowClick(entry, virtualItem.index);
                    }}
                  >
                    <span className="w-20 flex-shrink-0 text-muted-foreground">{formatTimestamp(entry.time)}</span>
                    <span className={cn("w-12 flex-shrink-0 font-semibold", LEVEL_COLORS[entry.level] || "")}>
                      {getLevelName(entry.level)}
                    </span>
                    {entry.service && (
                      <span className="w-24 flex-shrink-0 text-muted-foreground truncate">[{entry.service}]</span>
                    )}
                    <span className={cn("truncate flex-1", MSG_COLORS[entry.level])}>{entry.msg}</span>
                    <span className="flex-shrink-0 ml-2 w-5">
                      {copiedIndex === virtualItem.index ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  sideOffset={2}
                  className="max-w-xl max-h-64 overflow-auto font-mono text-xs whitespace-pre p-3"
                >
                  {JSON.stringify(entry, null, 2)}
                </TooltipContent>
              </Tooltip>
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
