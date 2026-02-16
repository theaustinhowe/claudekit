"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SessionStreamEvent {
  type: "init" | "progress" | "log" | "chunk" | "done" | "error" | "cancelled" | "heartbeat";
  message?: string;
  log?: string;
  logType?: string;
  progress?: number;
  phase?: string;
  data?: Record<string, unknown>;
}

export interface UseSessionStreamOptions {
  sessionId: string | null;
  autoConnect?: boolean;
  onEvent?: (event: SessionStreamEvent) => void;
  onComplete?: (event: SessionStreamEvent) => void;
  maxLogs?: number;
  /** Base URL for session API. Default: "" (relative to current host) */
  baseUrl?: string;
}

export type StreamStatus = "idle" | "connecting" | "streaming" | "done" | "error" | "reconnecting";

export interface UseSessionStreamReturn {
  status: StreamStatus;
  logs: Array<{ log: string; logType: string }>;
  progress: number | null;
  phase: string | null;
  error: string | null;
  elapsed: number;
  events: SessionStreamEvent[];
  disconnect: () => void;
  reconnect: () => void;
  cancel: () => Promise<void>;
}

const MAX_RETRIES = 3;

export function useSessionStream({
  sessionId,
  autoConnect = true,
  onEvent,
  onComplete,
  maxLogs = 500,
  baseUrl = "",
}: UseSessionStreamOptions): UseSessionStreamReturn {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [logs, setLogs] = useState<Array<{ log: string; logType: string }>>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [events, setEvents] = useState<SessionStreamEvent[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const onEventRef = useRef(onEvent);
  const onCompleteRef = useRef(onComplete);
  const maxLogsRef = useRef(maxLogs);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onEventRef.current = onEvent;
  onCompleteRef.current = onComplete;
  maxLogsRef.current = maxLogs;

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, [stopTimer]);

  const disconnect = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    retryCountRef.current = 0;
    stopTimer();
  }, [stopTimer]);

  const handleEvent = useCallback((event: SessionStreamEvent) => {
    setEvents((prev) => [...prev, event]);
    onEventRef.current?.(event);

    if (event.progress !== undefined) {
      setProgress(event.progress);
    }
    if (event.phase !== undefined) {
      setPhase(event.phase);
    }

    if (event.log) {
      setLogs((prev) => {
        const next = [...prev, { log: event.log as string, logType: event.logType ?? "status" }];
        return next.length > maxLogsRef.current ? next.slice(-maxLogsRef.current) : next;
      });
    }

    if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
      if (event.type === "error") {
        setError(event.message ?? "Unknown error");
        setStatus("error");
      } else {
        setStatus("done");
      }
      onCompleteRef.current?.(event);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!sessionId) return;

    disconnect();
    setStatus("connecting");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/stream`, {
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream request failed: ${res.status}`);
      }

      setStatus("streaming");
      retryCountRef.current = 0;
      startTimer();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            stopTimer();
            setStatus("done");
            return;
          }

          try {
            const data = JSON.parse(payload) as SessionStreamEvent;
            if (data.type === "heartbeat") continue;
            handleEvent(data);
          } catch {
            // Skip malformed JSON
          }
        }
      }

      if (!controller.signal.aborted) {
        stopTimer();
        setStatus("done");
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      stopTimer();

      const isNetworkError =
        err instanceof TypeError || (err instanceof Error && /network|connection|failed to fetch/i.test(err.message));

      if (isNetworkError && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        const delay = 2 ** (retryCountRef.current - 1) * 1000;
        setStatus("reconnecting");
        setError(null);
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          connect();
        }, delay);
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    }
  }, [sessionId, baseUrl, disconnect, startTimer, stopTimer, handleEvent]);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  const cancel = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/cancel`, { method: "POST" });
      if (res.ok) {
        disconnect();
        setStatus("done");
        onCompleteRef.current?.({ type: "cancelled", message: "Session cancelled" });
      }
    } catch {
      // ignore
    }
  }, [sessionId, baseUrl, disconnect]);

  // Auto-connect on mount or sessionId change
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reconnect when sessionId or autoConnect changes
  useEffect(() => {
    if (autoConnect && sessionId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [sessionId, autoConnect]);

  return {
    status,
    logs,
    progress,
    phase,
    error,
    elapsed,
    events,
    disconnect,
    reconnect,
    cancel,
  };
}
