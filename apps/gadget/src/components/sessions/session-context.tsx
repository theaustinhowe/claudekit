"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SESSION_TYPE_LABELS } from "@/lib/constants";
import type { SessionRow } from "@/lib/types";

interface SessionContextValue {
  sessions: SessionRow[];
  activeCount: number;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const SessionContext = createContext<SessionContextValue>({
  sessions: [],
  activeCount: 0,
  panelOpen: false,
  setPanelOpen: () => {},
});

export function useSessionContext() {
  return useContext(SessionContext);
}

const POLL_INTERVAL = 5_000;
const RECENT_CUTOFF_MS = 24 * 60 * 60 * 1000;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const previousIdsRef = useRef<Set<string>>(new Set());

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions?status=running,pending,done,error&limit=20");
      if (!res.ok) return;
      const data = (await res.json()) as SessionRow[];

      // Filter: keep all running/pending, only recent done/error
      const cutoff = Date.now() - RECENT_CUTOFF_MS;
      const filtered = data.filter((s) => {
        if (s.status === "running" || s.status === "pending") return true;
        const completedAt = s.completed_at ? new Date(s.completed_at).getTime() : 0;
        return completedAt > cutoff;
      });

      setSessions(filtered);

      // Detect transitions for toast notifications
      const currentIds = new Set(
        filtered.filter((s) => s.status === "running" || s.status === "pending").map((s) => s.id),
      );
      const prevIds = previousIdsRef.current;

      for (const s of filtered) {
        if (prevIds.has(s.id) && !currentIds.has(s.id)) {
          // Skip toast if user is already on the page for this session's context
          if (s.context_type && s.context_id) {
            const path = window.location.pathname;
            const prefix = s.context_type === "project" ? "/projects/" : "/repos/";
            if (path.startsWith(`${prefix}${s.context_id}`)) {
              continue;
            }
          }

          // Session was active, now completed/failed
          const typeLabel = SESSION_TYPE_LABELS[s.session_type] ?? s.session_type;
          if (s.status === "done") {
            toast.success(`${typeLabel} completed`, { description: s.label });
          } else if (s.status === "error") {
            toast.error(`${typeLabel} failed`, { description: s.error_message ?? s.label });
          }
        }
      }

      previousIdsRef.current = currentIds;
    } catch {
      // ignore fetch errors
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const activeCount = sessions.filter((s) => s.status === "running" || s.status === "pending").length;

  return (
    <SessionContext.Provider value={{ sessions, activeCount, panelOpen, setPanelOpen }}>
      {children}
    </SessionContext.Provider>
  );
}
