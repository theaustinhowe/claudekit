"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

function getStorageKey(databaseId: string, tableName: string) {
  return `ducktails:column-visibility:${databaseId}:${tableName}`;
}

function getHiddenFromStorage(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string, cb: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)?.add(cb);
  return () => {
    listeners.get(key)?.delete(cb);
  };
}

function notify(key: string) {
  for (const cb of listeners.get(key) ?? []) cb();
}

export function useColumnVisibility(databaseId: string, tableName: string, allColumns: string[]) {
  const key = getStorageKey(databaseId, tableName);

  const hiddenColumns = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    () => {
      const set = getHiddenFromStorage(key);
      // Return a stable JSON string for comparison
      return JSON.stringify([...set].sort());
    },
    () => "[]",
  );

  const hiddenSet = useMemo(() => new Set(JSON.parse(hiddenColumns) as string[]), [hiddenColumns]);

  const visibleColumns = useMemo(() => allColumns.filter((c) => !hiddenSet.has(c)), [allColumns, hiddenSet]);

  const toggleColumn = useCallback(
    (column: string) => {
      const current = getHiddenFromStorage(key);
      if (current.has(column)) {
        current.delete(column);
      } else {
        // Prevent hiding all columns
        const wouldBeVisible = allColumns.filter((c) => !current.has(c) && c !== column);
        if (wouldBeVisible.length === 0) return;
        current.add(column);
      }
      localStorage.setItem(key, JSON.stringify([...current]));
      notify(key);
    },
    [key, allColumns],
  );

  const showAll = useCallback(() => {
    localStorage.removeItem(key);
    notify(key);
  }, [key]);

  return { hiddenColumns: hiddenSet, visibleColumns, toggleColumn, showAll };
}
