"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRepositories,
  fetchRepositoryBranches,
  fetchRepositorySettings,
  updateRepositorySettings,
} from "@/lib/api";

// Query key factory
export const repositoryKeys = {
  all: ["repositories"] as const,
  list: () => [...repositoryKeys.all, "list"] as const,
  detail: (id: string) => [...repositoryKeys.all, "detail", id] as const,
  settings: (id: string) => [...repositoryKeys.detail(id), "settings"] as const,
  branches: (id: string) => [...repositoryKeys.detail(id), "branches"] as const,
};

// Fetch all repositories
export function useRepositories() {
  return useQuery({
    queryKey: repositoryKeys.list(),
    queryFn: fetchRepositories,
  });
}

// Fetch repository settings
export function useRepositorySettings(repositoryId: string | null) {
  return useQuery({
    queryKey: repositoryKeys.settings(repositoryId ?? ""),
    queryFn: () => {
      if (!repositoryId) return null;
      return fetchRepositorySettings(repositoryId);
    },
    enabled: !!repositoryId,
  });
}

// Fetch repository branches from GitHub
export function useRepositoryBranches(repositoryId: string | null) {
  return useQuery({
    queryKey: repositoryKeys.branches(repositoryId ?? ""),
    queryFn: () => {
      if (!repositoryId) return null;
      return fetchRepositoryBranches(repositoryId);
    },
    enabled: !!repositoryId,
    staleTime: 5 * 60 * 1000, // 5 minutes - branches don't change often
  });
}

// Update repository settings
export function useUpdateRepositorySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      repositoryId,
      settings,
    }: {
      repositoryId: string;
      settings: {
        pollIntervalMs?: number;
        testCommand?: string | null;
        agentProvider?: string;
        triggerLabel?: string;
        branchPattern?: string;
        baseBranch?: string;
        autoCleanup?: boolean;
        autoStartJobs?: boolean;
        autoCreatePr?: boolean;
      };
    }) => updateRepositorySettings(repositoryId, settings),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: repositoryKeys.settings(variables.repositoryId),
      });
      queryClient.invalidateQueries({
        queryKey: repositoryKeys.list(),
      });
    },
  });
}
