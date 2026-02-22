"use client";

import type { Repository } from "@claudekit/gogo-shared";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

interface RepositoryContextValue {
  repositories: Repository[];
  selectedRepoId: string | "all";
  setSelectedRepoId: (id: string | "all") => void;
  selectedRepository: Repository | null;
  isLoading: boolean;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

const STORAGE_KEY = "gogo-selected-repo";

export function RepositoryProvider({
  children,
  repositories,
  isLoading,
}: {
  children: ReactNode;
  repositories: Repository[];
  isLoading: boolean;
}) {
  const [selectedRepoId, setSelectedRepoIdState] = useState<string | "all">("all");

  // Load from localStorage on mount, with auto-select for single repo
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    // Valid stored value - use it
    if (stored && (stored === "all" || repositories.some((r) => r.id === stored))) {
      setSelectedRepoIdState(stored);
      return;
    }

    // Auto-select if exactly 1 repo (backwards compatibility for single-repo users)
    if (repositories.length === 1) {
      const singleRepoId = repositories[0].id;
      setSelectedRepoIdState(singleRepoId);
      localStorage.setItem(STORAGE_KEY, singleRepoId);
      return;
    }

    // Default to "all" for multiple repos
    setSelectedRepoIdState("all");
  }, [repositories]);

  const setSelectedRepoId = (id: string | "all") => {
    setSelectedRepoIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const selectedRepository =
    selectedRepoId === "all" ? null : (repositories.find((r) => r.id === selectedRepoId) ?? null);

  return (
    <RepositoryContext.Provider
      value={{
        repositories,
        selectedRepoId,
        setSelectedRepoId,
        selectedRepository,
        isLoading,
      }}
    >
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositoryContext() {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error("useRepositoryContext must be used within a RepositoryProvider");
  }
  return context;
}
