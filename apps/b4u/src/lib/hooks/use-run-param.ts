"use client";

import { useCallback, useState } from "react";

export function useRunParam() {
  const [initialRunId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("run") || null;
  });

  const setRunId = useCallback((id: string | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("run", id);
    } else {
      url.searchParams.delete("run");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);

  return { initialRunId, setRunId };
}
