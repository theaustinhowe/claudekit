"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

function getStorageKey(databaseId: string, tableName: string) {
  return `ducktails:column-order:${databaseId}:${tableName}`;
}

function getOrderFromStorage(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
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

export function useColumnOrder(databaseId: string, tableName: string, allColumns: string[]) {
  const key = getStorageKey(databaseId, tableName);

  const storedOrder = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    () => {
      const order = getOrderFromStorage(key);
      return JSON.stringify(order);
    },
    () => "[]",
  );

  const orderedColumns = useMemo(() => {
    const stored = JSON.parse(storedOrder) as string[];
    if (stored.length === 0) return allColumns;

    // Keep only columns that still exist, then append any new ones
    const existing = stored.filter((c) => allColumns.includes(c));
    const newCols = allColumns.filter((c) => !stored.includes(c));
    return [...existing, ...newCols];
  }, [storedOrder, allColumns]);

  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      // Start from current effective order
      const current = (() => {
        const stored = getOrderFromStorage(key);
        if (stored.length === 0) return [...allColumns];
        const existing = stored.filter((c) => allColumns.includes(c));
        const newCols = allColumns.filter((c) => !stored.includes(c));
        return [...existing, ...newCols];
      })();

      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);

      localStorage.setItem(key, JSON.stringify(current));
      notify(key);
    },
    [key, allColumns],
  );

  const resetOrder = useCallback(() => {
    localStorage.removeItem(key);
    notify(key);
  }, [key]);

  return { orderedColumns, reorder, resetOrder };
}
