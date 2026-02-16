"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelResearch,
  convertSuggestion,
  fetchResearchSession,
  fetchResearchSessions,
  startResearch,
} from "@/lib/api";

export const researchKeys = {
  all: ["research"] as const,
  sessions: () => [...researchKeys.all, "sessions"] as const,
  session: (id: string) => [...researchKeys.all, "session", id] as const,
};

export function useResearchSessions() {
  return useQuery({
    queryKey: researchKeys.sessions(),
    queryFn: fetchResearchSessions,
    refetchInterval: 5000, // Poll while sessions may be running
  });
}

export function useResearchSession(id: string | null) {
  return useQuery({
    queryKey: researchKeys.session(id ?? ""),
    queryFn: () => {
      if (!id) return null;
      return fetchResearchSession(id);
    },
    enabled: !!id,
    refetchInterval: 3000, // Poll more frequently for active session
  });
}

export function useStartResearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { repositoryId: string; focusAreas: string[] }) => startResearch(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: researchKeys.sessions() });
    },
  });
}

export function useCancelResearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => cancelResearch(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: researchKeys.all });
    },
  });
}

export function useConvertSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { sessionId: string; suggestionId: string; convertTo: "github_issue" | "manual_job" }) =>
      convertSuggestion(params.sessionId, params.suggestionId, params.convertTo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: researchKeys.all });
    },
  });
}
