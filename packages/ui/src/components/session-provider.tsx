"use client";

import type { SessionRowBase } from "@devkit/session";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SessionPanelConfig {
  /** Map session_type → human-readable label (e.g. { scan: "Scan", chat: "Chat" }) */
  typeLabels: Record<string, string>;
  /** Return a route path for the session's context page, or null if none */
  getContextLink?: (session: SessionRowBase) => string | null;
  /** Return true if the user is already on the context page for this session (suppresses toast) */
  isOnContextPage?: (session: SessionRowBase) => boolean;
  /** Base URL for API calls (default: "" = relative) */
  apiBaseUrl?: string;
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs?: number;
  /** Only show completed sessions newer than this cutoff in ms (default: 24hrs) */
  recentCutoffMs?: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SessionPanelContextValue {
  sessions: SessionRowBase[];
  activeCount: number;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  config: SessionPanelConfig;
}

const SessionPanelContext = createContext<SessionPanelContextValue>({
  sessions: [],
  activeCount: 0,
  panelOpen: false,
  setPanelOpen: () => {},
  config: { typeLabels: {} },
});

export function useSessionPanel() {
  return useContext(SessionPanelContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL = 5_000;
const DEFAULT_RECENT_CUTOFF_MS = 24 * 60 * 60 * 1000;

export function SessionProvider({ config, children }: { config: SessionPanelConfig; children: React.ReactNode }) {
  const [sessions, setSessions] = useState<SessionRowBase[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const configRef = useRef(config);
  configRef.current = config;

  const fetchSessions = useCallback(async () => {
    try {
      const base = configRef.current.apiBaseUrl ?? "";
      const res = await fetch(`${base}/api/sessions?status=running,pending,done,error&limit=20`);
      if (!res.ok) return;
      const data = (await res.json()) as SessionRowBase[];

      // Filter: keep all running/pending, only recent done/error
      const cutoff = Date.now() - (configRef.current.recentCutoffMs ?? DEFAULT_RECENT_CUTOFF_MS);
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
          // Skip toast if user is already on the context page for this session
          if (configRef.current.isOnContextPage?.(s)) {
            continue;
          }

          // Session was active, now completed/failed
          const typeLabel = configRef.current.typeLabels[s.session_type] ?? s.session_type;
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
    const interval = setInterval(fetchSessions, configRef.current.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const activeCount = sessions.filter((s: SessionRowBase) => s.status === "running" || s.status === "pending").length;

  return (
    <SessionPanelContext.Provider value={{ sessions, activeCount, panelOpen, setPanelOpen, config }}>
      {children}
    </SessionPanelContext.Provider>
  );
}
