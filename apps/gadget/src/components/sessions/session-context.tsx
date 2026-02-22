"use client";

import type { SessionRowBase } from "@claudekit/session";
import { type SessionPanelConfig, SessionProvider } from "@claudekit/ui/components/session-provider";
import type React from "react";
import { SESSION_TYPE_LABELS } from "@/lib/constants";

const SESSION_TYPE_TAB: Partial<Record<string, string>> = {
  ai_file_gen: "ai-files",
  finding_fix: "findings",
  cleanup: "overview",
  scan: "findings",
  quick_improve: "overview",
};

const gadgetSessionConfig: SessionPanelConfig = {
  typeLabels: SESSION_TYPE_LABELS,
  getContextLink(session: SessionRowBase): string | null {
    if (!session.context_type || !session.context_id) return null;
    if (session.context_type !== "repo") return null;
    const base = `/repositories/${session.context_id}`;
    const tab = SESSION_TYPE_TAB[session.session_type];
    return tab ? `${base}?tab=${tab}` : base;
  },
  isOnContextPage(session: SessionRowBase): boolean {
    if (!session.context_type || !session.context_id) return false;
    const path = window.location.pathname;
    return path.startsWith(`/repos/${session.context_id}`);
  },
};

export function GadgetSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider config={gadgetSessionConfig}>{children}</SessionProvider>;
}
