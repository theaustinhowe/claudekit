"use client";

import type { WsClientMessage, WsMessage } from "@claudekit/gogo-shared";
import { useCallback, useEffect, useRef, useState } from "react";

// Dynamically determine WebSocket URL based on current browser location
// This allows the app to work when accessed from other devices on the network
function getWsUrl(): string {
  // Use explicit env var if set
  let baseUrl: string;
  if (process.env.NEXT_PUBLIC_WS_URL) {
    baseUrl = process.env.NEXT_PUBLIC_WS_URL;
  } else if (typeof window === "undefined") {
    // In SSR context, fall back to localhost
    return "ws://localhost:2201/ws";
  } else {
    // Use the same hostname the browser is connected to
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const orchestratorPort = process.env.NEXT_PUBLIC_ORCHESTRATOR_PORT || "2201";
    baseUrl = `${protocol}//${hostname}:${orchestratorPort}/ws`;
  }

  // Add auth token as query param if available
  const token = typeof window !== "undefined" ? localStorage.getItem("gogo_api_token") : null;
  if (token) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }
  return baseUrl;
}

// Reconnection configuration
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const RECONNECT_BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 10;

export type ConnectionState = "connected" | "disconnected" | "reconnecting" | "failed";

interface UseWebSocketReturn {
  connected: boolean;
  connectionState: ConnectionState;
  reconnectAttempt: number;
  subscribe: (jobId: string) => void;
  unsubscribe: (jobId: string) => void;
  ping: () => void;
  triggerReconnect: () => void;
}

export function useWebSocket(onMessage: (msg: WsMessage) => void): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const isUnmountedRef = useRef(false);
  const isManualCloseRef = useRef(false);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const resubscribeAll = useCallback(() => {
    for (const jobId of subscriptionsRef.current) {
      sendMessage({ type: "subscribe", payload: { jobId } });
    }
  }, [sendMessage]);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Close any existing connection
    if (wsRef.current) {
      isManualCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    isManualCloseRef.current = false;

    ws.onopen = () => {
      if (isUnmountedRef.current) return;
      setConnectionState("connected");
      setReconnectAttempt(0);
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      // Re-subscribe to any jobs we were tracking
      resubscribeAll();
    };

    ws.onclose = (_event) => {
      if (isUnmountedRef.current) return;

      // Don't reconnect if this was a manual close or component unmount
      if (isManualCloseRef.current) {
        setConnectionState("disconnected");
        return;
      }

      // Schedule reconnection with exponential backoff
      setConnectionState("reconnecting");
      setReconnectAttempt((prev) => {
        const newAttempt = prev + 1;
        if (newAttempt > MAX_RECONNECT_ATTEMPTS) {
          setConnectionState("failed");
          return prev;
        }

        const delay = Math.min(reconnectDelayRef.current, MAX_RECONNECT_DELAY);
        clearReconnectTimeout();
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current *= RECONNECT_BACKOFF_MULTIPLIER;
          connect();
        }, delay);

        return newAttempt;
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        onMessage(msg);
      } catch {
        console.error("Failed to parse WebSocket message:", event.data);
      }
    };

    ws.onerror = () => {
      // WebSocket error events don't contain useful info, the close event will have details
    };
  }, [onMessage, resubscribeAll, clearReconnectTimeout]);

  const subscribe = useCallback(
    (jobId: string) => {
      subscriptionsRef.current.add(jobId);
      sendMessage({ type: "subscribe", payload: { jobId } });
    },
    [sendMessage],
  );

  const unsubscribe = useCallback(
    (jobId: string) => {
      subscriptionsRef.current.delete(jobId);
      sendMessage({ type: "unsubscribe", payload: { jobId } });
    },
    [sendMessage],
  );

  const ping = useCallback(() => {
    sendMessage({ type: "ping" });
  }, [sendMessage]);

  // Allow external trigger to force reconnection (e.g., from health check)
  const triggerReconnect = useCallback(() => {
    if (connectionState === "connected") return;
    // Reset backoff on manual trigger
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    setReconnectAttempt(0);
    clearReconnectTimeout();
    connect();
  }, [connectionState, connect, clearReconnectTimeout]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      isManualCloseRef.current = true;
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, clearReconnectTimeout]);

  // Background reconnect every 30s when in failed state
  useEffect(() => {
    if (connectionState !== "failed") return;

    const backgroundReconnect = setInterval(() => {
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      setReconnectAttempt(0);
      connect();
    }, 30000);

    return () => clearInterval(backgroundReconnect);
  }, [connectionState, connect]);

  return {
    connected: connectionState === "connected",
    connectionState,
    reconnectAttempt,
    subscribe,
    unsubscribe,
    ping,
    triggerReconnect,
  };
}
