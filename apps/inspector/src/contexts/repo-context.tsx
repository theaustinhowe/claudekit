"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export interface Repo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

interface RepoContextValue {
  repos: Repo[];
  selectedRepoId: string | "all";
  setSelectedRepoId: (id: string | "all") => void;
  selectedRepo: Repo | null;
  favorites: Set<string>;
  toggleFavorite: (repoId: string) => void;
}

const RepoContext = createContext<RepoContextValue | null>(null);

const STORAGE_KEY = "inspector-selected-repo";
const FAVORITES_KEY = "inspector-favorite-repos";

export function RepoProvider({ children, repos }: { children: ReactNode; repos: Repo[] }) {
  const [selectedRepoId, setSelectedRepoIdState] = useState<string | "all">("all");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored && (stored === "all" || repos.some((r) => r.id === stored))) {
      setSelectedRepoIdState(stored);
      return;
    }

    if (repos.length === 1) {
      const singleId = repos[0].id;
      setSelectedRepoIdState(singleId);
      localStorage.setItem(STORAGE_KEY, singleId);
      return;
    }

    setSelectedRepoIdState("all");
  }, [repos]);

  const setSelectedRepoId = (id: string | "all") => {
    setSelectedRepoIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const toggleFavorite = useCallback((repoId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const selectedRepo = selectedRepoId === "all" ? null : (repos.find((r) => r.id === selectedRepoId) ?? null);

  return (
    <RepoContext.Provider value={{ repos, selectedRepoId, setSelectedRepoId, selectedRepo, favorites, toggleFavorite }}>
      {children}
    </RepoContext.Provider>
  );
}

export function useRepoContext() {
  const context = useContext(RepoContext);
  if (!context) {
    throw new Error("useRepoContext must be used within a RepoProvider");
  }
  return context;
}
