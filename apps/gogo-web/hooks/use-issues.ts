"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CreateIssueParams, createIssue, createJobFromIssue, fetchIssues } from "@/lib/api";
import { jobKeys } from "./use-jobs";

// Query key factory for issues
const issueKeys = {
  all: ["issues"] as const,
  list: (repositoryId: string) => [...issueKeys.all, "list", repositoryId] as const,
  listWithParams: (repositoryId: string, params?: { state?: string; labels?: string; page?: number }) =>
    [...issueKeys.list(repositoryId), params] as const,
};

// Fetch issues for a repository
export function useIssues(
  repositoryId: string | undefined,
  params?: {
    state?: "open" | "closed" | "all";
    labels?: string;
    per_page?: number;
    page?: number;
  },
) {
  return useQuery({
    queryKey: issueKeys.listWithParams(repositoryId ?? "", params),
    queryFn: () => fetchIssues(repositoryId as string, params),
    enabled: !!repositoryId && repositoryId !== "all",
  });
}

// Create a new issue mutation
export function useCreateIssue(repositoryId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateIssueParams) => {
      if (!repositoryId || repositoryId === "all") {
        throw new Error("Repository ID is required");
      }
      return createIssue(repositoryId, params);
    },
    onSuccess: () => {
      if (repositoryId && repositoryId !== "all") {
        queryClient.invalidateQueries({
          queryKey: issueKeys.list(repositoryId),
        });
      }
    },
  });
}

// Create a job from an issue mutation
export function useCreateJobFromIssue(repositoryId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (issueNumber: number) => {
      if (!repositoryId || repositoryId === "all") {
        throw new Error("Repository ID is required");
      }
      return createJobFromIssue(repositoryId, issueNumber);
    },
    onSuccess: () => {
      // Invalidate both issues (to update hasJob) and jobs lists
      if (repositoryId && repositoryId !== "all") {
        queryClient.invalidateQueries({
          queryKey: issueKeys.list(repositoryId),
        });
      }
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}
