"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  browseDirectory,
  completeSetup,
  discoverRepos,
  fetchSetupStatus,
  verifyGitHub,
  verifyRepository,
  verifyWorkspace,
} from "@/lib/api";
import { repositoryKeys } from "./use-repositories";

// Query key for setup status
export const setupKeys = {
  status: ["setup", "status"] as const,
};

// Fetch setup status
export function useSetupStatus() {
  return useQuery({
    queryKey: setupKeys.status,
    queryFn: fetchSetupStatus,
  });
}

// Verify GitHub token mutation
export function useVerifyGitHub() {
  return useMutation({
    mutationFn: (token: string) => verifyGitHub(token),
  });
}

// Verify repository mutation
export function useVerifyRepository() {
  return useMutation({
    mutationFn: ({
      owner,
      name,
      token,
      reuseTokenFromRepoId,
    }: {
      owner: string;
      name: string;
      token?: string;
      reuseTokenFromRepoId?: string;
    }) => verifyRepository(owner, name, { token, reuseTokenFromRepoId }),
  });
}

// Verify workspace mutation
export function useVerifyWorkspace() {
  return useMutation({
    mutationFn: (path: string) => verifyWorkspace(path),
  });
}

// Complete setup mutation
export function useCompleteSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      githubToken?: string;
      reuseTokenFromRepoId?: string;
      owner: string;
      name: string;
      triggerLabel: string;
      baseBranch: string;
      workdirPath: string;
    }) => completeSetup(data),
    onSuccess: () => {
      // Invalidate setup status so home page doesn't redirect back
      queryClient.invalidateQueries({ queryKey: setupKeys.status });
      // Invalidate repositories query so sidebar updates
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

// Discover repositories mutation
export function useDiscoverRepos() {
  return useMutation({
    mutationFn: ({ path, maxDepth }: { path: string; maxDepth?: number }) => discoverRepos(path, maxDepth),
  });
}

// Browse directory mutation
export function useBrowseDirectory() {
  return useMutation({
    mutationFn: (path: string) => browseDirectory(path),
  });
}
