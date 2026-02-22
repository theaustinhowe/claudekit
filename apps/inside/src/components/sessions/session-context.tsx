"use client";

import type { SessionRowBase } from "@claudekit/session";
import { type SessionPanelConfig, SessionProvider } from "@claudekit/ui/components/session-provider";
import type React from "react";
import { SESSION_TYPE_LABELS } from "@/lib/constants";

const insideSessionConfig: SessionPanelConfig = {
  typeLabels: SESSION_TYPE_LABELS,
  getContextLink(session: SessionRowBase): string | null {
    if (!session.context_type || !session.context_id) return null;
    if (session.context_type === "project") {
      return `/${session.context_id}`;
    }
    return null;
  },
  isOnContextPage(session: SessionRowBase): boolean {
    if (!session.context_type || !session.context_id) return false;
    const path = window.location.pathname;
    return path.startsWith(`/${session.context_id}`);
  },
};

export function InsideSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider config={insideSessionConfig}>{children}</SessionProvider>;
}
