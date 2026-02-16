"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionEvent } from "@/lib/claude/types";

type StreamStatus = "idle" | "connecting" | "streaming" | "done" | "error" | "cancelled";

const MAX_LOGS = 500;

export interface LogEntry {
  log: string;
  logType: string;
}

interface UseSessionStreamResult {
  events: SessionEvent[];
  lastEvent: SessionEvent | null;
  status: StreamStatus;
  error: string | null;
  logs: LogEntry[];
  progress: number;
  phase: string | null;
  elapsed: number;
  cancel: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => void;
}

export function useSessionStream(sessionId: string | null): UseSessionStreamResult {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const appendLog = useCallback((log: string, logType: string) => {
    setLogs((prev) => {
      const next = [...prev, { log, logType }];
      if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
      return next;
    });
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const processEvent = useCallback(
    (event: SessionEvent) => {
      if (!mountedRef.current) return;

      setEvents((prev) => [...prev, event]);

      // Extract log
      if (event.log) {
        appendLog(event.log, event.logType ?? "status");
      }

      // Extract progress/phase
      if (event.progress !== undefined) {
        setProgress(event.progress);
      }
      if (event.phase) {
        setPhase(event.phase);
      }

      switch (event.type) {
        case "init":
          setStatus("streaming");
          startTimeRef.current = Date.now();
          break;
        case "progress":
        case "log":
        case "chunk":
          setStatus("streaming");
          break;
        case "done":
          setStatus("done");
          setProgress(event.progress ?? 100);
          stopElapsedTimer();
          break;
        case "error":
          setStatus("error");
          setError(event.message ?? "Unknown stream error");
          stopElapsedTimer();
          break;
        case "cancelled":
          setStatus("cancelled");
          stopElapsedTimer();
          break;
      }
    },
    [appendLog, stopElapsedTimer],
  );

  const startElapsedTimer = useCallback(() => {
    stopElapsedTimer();
    startTimeRef.current = startTimeRef.current ?? Date.now();
    elapsedTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
  }, [stopElapsedTimer]);

  const disconnectStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    stopElapsedTimer();
  }, [stopElapsedTimer]);

  const fetchDbLogs = useCallback(
    async (sid: string) => {
      try {
        const res = await fetch(`/api/sessions/${sid}/logs`);
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.logs || data.logs.length === 0) return false;

        for (const row of data.logs) {
          appendLog(row.log, row.log_type);
        }
        return true;
      } catch {
        return false;
      }
    },
    [appendLog],
  );

  const connectStream = useCallback(
    async (sid: string, retry: number = 0) => {
      if (!mountedRef.current) return;

      disconnectStream();

      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("connecting");

      try {
        const res = await fetch(`/api/sessions/${sid}/stream`, {
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          // If stream fails, try DB replay
          const replayed = await fetchDbLogs(sid);
          if (replayed) {
            setStatus("done");
          } else {
            setStatus("error");
            setError("Failed to connect to session stream");
          }
          return;
        }

        retryCountRef.current = 0;
        startElapsedTimer();

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const event: SessionEvent = JSON.parse(jsonStr);

              // Check for "session not found" — fall back to DB replay
              if (event.type === "error" && event.message === "Session not found") {
                const replayed = await fetchDbLogs(sid);
                if (replayed) {
                  setStatus("done");
                } else {
                  setStatus("error");
                  setError("Session not found");
                }
                return;
              }

              processEvent(event);
            } catch {
              // Ignore unparseable messages (heartbeats, etc.)
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;

        // Retry with exponential backoff
        if (retry < 3 && mountedRef.current) {
          retryCountRef.current = retry + 1;
          const delay = Math.min(1000 * 2 ** retry, 8000);
          setTimeout(() => {
            if (mountedRef.current && sessionIdRef.current === sid) {
              connectStream(sid, retry + 1);
            }
          }, delay);
        } else {
          if (mountedRef.current) {
            setStatus("error");
            setError("Stream connection lost");
          }
        }
      }
    },
    [disconnectStream, fetchDbLogs, processEvent, startElapsedTimer],
  );

  const reconnect = useCallback(() => {
    if (sessionIdRef.current) {
      setError(null);
      retryCountRef.current = 0;
      connectStream(sessionIdRef.current);
    }
  }, [connectStream]);

  // Main effect: connect when sessionId changes
  useEffect(() => {
    if (sessionId === sessionIdRef.current) return;
    sessionIdRef.current = sessionId;

    // Reset state
    disconnectStream();
    setEvents([]);
    setLogs([]);
    setError(null);
    setProgress(0);
    setPhase(null);
    setElapsed(0);
    startTimeRef.current = null;
    retryCountRef.current = 0;

    if (!sessionId) {
      setStatus("idle");
      return;
    }

    connectStream(sessionId);

    return () => {
      disconnectStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, connectStream, disconnectStream]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      stopElapsedTimer();
    };
  }, [stopElapsedTimer]);

  const cancel = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await fetch(`/api/sessions/${sessionIdRef.current}/cancel`, { method: "POST" });
    } catch {
      // Cancel is best-effort
    }
  }, []);

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  return {
    events,
    lastEvent,
    status,
    error,
    logs,
    progress,
    phase,
    elapsed,
    cancel,
    disconnect: disconnectStream,
    reconnect,
  };
}
