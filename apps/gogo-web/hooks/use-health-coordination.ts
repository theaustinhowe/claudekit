"use client";

import { useEffect, useRef } from "react";
import { useWebSocketContext } from "@/contexts/websocket-context";
import { useHealth } from "@/hooks/use-jobs";

/**
 * Coordinates health check responses with WebSocket reconnection.
 * When the health check succeeds but WebSocket is disconnected,
 * this hook triggers a reconnection attempt.
 *
 * Should be used in a component mounted high in the tree (e.g., Providers).
 */
export function useHealthCoordination() {
  const { data: health, isError: healthError } = useHealth();
  const { connectionState, notifyBackendAvailable } = useWebSocketContext();

  // Track previous health state to detect recovery
  const wasHealthyRef = useRef<boolean | null>(null);
  const wasConnectedRef = useRef<boolean>(false);

  useEffect(() => {
    const isHealthy = health?.status === "ok" && !healthError;
    const isConnected = connectionState === "connected";

    // Detect backend recovery: was unhealthy/unknown, now healthy
    const backendRecovered = wasHealthyRef.current === false && isHealthy === true;

    // Detect WebSocket disconnection while backend is healthy
    const wsDisconnectedButBackendHealthy = !isConnected && isHealthy && wasConnectedRef.current;

    if (backendRecovered || wsDisconnectedButBackendHealthy) {
      notifyBackendAvailable();
    }

    // Update refs for next comparison
    wasHealthyRef.current = isHealthy;
    wasConnectedRef.current = isConnected;
  }, [health, healthError, connectionState, notifyBackendAvailable]);
}
