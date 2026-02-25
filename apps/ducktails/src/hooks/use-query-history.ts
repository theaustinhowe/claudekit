"use client";

import { useCallback, useState } from "react";

export interface QueryHistoryEntry {
  sql: string;
  timestamp: number;
}

const MAX_HISTORY = 20;

function getStorageKey(databaseId: string): string {
  return `ducktails:query-history:${databaseId}`;
}

export function useQueryHistory(databaseId: string) {
  const [history, setHistory] = useState<QueryHistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(getStorageKey(databaseId));
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const addEntry = useCallback(
    (sql: string) => {
      setHistory((prev) => {
        const filtered = prev.filter((e) => e.sql !== sql);
        const next = [{ sql, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
        try {
          localStorage.setItem(getStorageKey(databaseId), JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [databaseId],
  );

  const removeEntry = useCallback(
    (timestamp: number) => {
      setHistory((prev) => {
        const next = prev.filter((e) => e.timestamp !== timestamp);
        try {
          localStorage.setItem(getStorageKey(databaseId), JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [databaseId],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(getStorageKey(databaseId));
    } catch {}
  }, [databaseId]);

  return { history, addEntry, removeEntry, clearHistory };
}
