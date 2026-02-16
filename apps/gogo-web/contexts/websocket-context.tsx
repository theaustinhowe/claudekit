"use client";

import type { Job, JobLog, WsMessage } from "@devkit/gogo-shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useRef } from "react";
import { appendLogToCache, invalidateJobsList, updateJobInCache } from "@/hooks/use-jobs";
import { type ConnectionState, useWebSocket } from "@/lib/ws";

interface WebSocketContextValue {
  connected: boolean;
  connectionState: ConnectionState;
  reconnectAttempt: number;
  subscribeToJob: (jobId: string) => void;
  unsubscribeFromJob: (jobId: string) => void;
  triggerReconnect: () => void;
  // Allows external coordination (e.g., health check) to signal backend is available
  notifyBackendAvailable: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const subscribedJobsRef = useRef<Set<string>>(new Set());

  const handleMessage = useCallback(
    (msg: WsMessage) => {
      switch (msg.type) {
        case "job:updated": {
          const job = msg.payload as Job;
          updateJobInCache(queryClient, job);
          break;
        }

        case "job:created": {
          // Invalidate the jobs list to refetch and include the new job
          invalidateJobsList(queryClient);
          break;
        }

        case "job:log": {
          const log = msg.payload as JobLog;
          // Only append if we're subscribed to this job's logs
          if (subscribedJobsRef.current.has(log.jobId)) {
            appendLogToCache(queryClient, log.jobId, log);
          }
          break;
        }

        case "research:output":
        case "research:updated":
        case "research:suggestion":
          // Research events — dispatched as custom DOM events for the research page
          window.dispatchEvent(new CustomEvent("research-ws", { detail: msg }));
          break;

        case "connection:established":
        case "subscribed":
        case "unsubscribed":
          // Connection lifecycle events - no action needed
          break;

        case "pong":
          // Heartbeat response, no action needed
          break;

        case "error":
          console.error("[WebSocket] Error:", msg.payload);
          break;

        default:
          console.warn("[WebSocket] Unknown message type:", msg.type);
      }
    },
    [queryClient],
  );

  const { connected, connectionState, reconnectAttempt, subscribe, unsubscribe, triggerReconnect } =
    useWebSocket(handleMessage);

  const subscribeToJob = useCallback(
    (jobId: string) => {
      subscribedJobsRef.current.add(jobId);
      subscribe(jobId);
    },
    [subscribe],
  );

  const unsubscribeFromJob = useCallback(
    (jobId: string) => {
      subscribedJobsRef.current.delete(jobId);
      unsubscribe(jobId);
    },
    [unsubscribe],
  );

  // Called when health check succeeds - if WebSocket is disconnected, try reconnecting
  const notifyBackendAvailable = useCallback(() => {
    if (connectionState !== "connected") {
      triggerReconnect();
    }
  }, [connectionState, triggerReconnect]);

  return (
    <WebSocketContext.Provider
      value={{
        connected,
        connectionState,
        reconnectAttempt,
        subscribeToJob,
        unsubscribeFromJob,
        triggerReconnect,
        notifyBackendAvailable,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within a WebSocketProvider");
  }
  return context;
}
