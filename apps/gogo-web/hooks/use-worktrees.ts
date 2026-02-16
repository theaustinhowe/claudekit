"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cleanupWorktree, fetchWorktrees } from "@/lib/api";

// Query key factory for worktrees
const worktreeKeys = {
  all: ["worktrees"] as const,
  list: () => [...worktreeKeys.all, "list"] as const,
};

// Fetch all worktrees with job status
export function useWorktrees() {
  return useQuery({
    queryKey: worktreeKeys.list(),
    queryFn: fetchWorktrees,
  });
}

// Cleanup a single worktree
export function useCleanupWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cleanupWorktree,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worktreeKeys.list() });
    },
  });
}
