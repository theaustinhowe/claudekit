"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAgentStatus, fetchAgents, fetchAllAgents } from "@/lib/api";

// Query key factory for consistent keys
const agentKeys = {
  all: ["agents"] as const,
  lists: () => [...agentKeys.all, "list"] as const,
  known: () => [...agentKeys.all, "known"] as const,
  status: (type: string) => [...agentKeys.all, "status", type] as const,
};

/**
 * Fetch all registered agents
 */
export function useAgents() {
  return useQuery({
    queryKey: agentKeys.lists(),
    queryFn: fetchAgents,
  });
}

/**
 * Fetch all known agents (including unconfigured)
 */
export function useAllAgents() {
  return useQuery({
    queryKey: agentKeys.known(),
    queryFn: fetchAllAgents,
  });
}

/**
 * Fetch status for a specific agent type
 */
export function useAgentStatus(type: string | null) {
  return useQuery({
    queryKey: agentKeys.status(type ?? ""),
    queryFn: async () => {
      if (!type) return null;
      return fetchAgentStatus(type);
    },
    enabled: !!type,
  });
}
