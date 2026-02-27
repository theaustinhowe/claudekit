"use client";

import type { SessionRowBase } from "@claudekit/session";
import { type SessionPanelConfig, SessionProvider } from "@claudekit/ui/components/session-provider";
import type React from "react";

const SESSION_TYPE_LABELS: Record<string, string> = {
  account_sync: "Account Sync",
  skill_analysis: "Skill Analysis",
  skill_rule_analysis: "Rule Generation",
  split_analysis: "Split Analysis",
  split_execution: "Split Execution",
  comment_fix: "Comment Fix",
  fix_execution: "Fix Execution",
};

const SESSION_TYPE_PAGE: Partial<Record<string, string>> = {
  account_sync: "/",
  skill_analysis: "/skills",
  skill_rule_analysis: "/skills",
  split_analysis: "/splitter",
  split_execution: "/splitter",
  comment_fix: "/resolver",
  fix_execution: "/resolver",
};

const inspectorSessionConfig: SessionPanelConfig = {
  typeLabels: SESSION_TYPE_LABELS,
  getContextLink(session: SessionRowBase): string | null {
    return SESSION_TYPE_PAGE[session.session_type] ?? null;
  },
  isOnContextPage(session: SessionRowBase): boolean {
    const targetPage = SESSION_TYPE_PAGE[session.session_type];
    if (!targetPage) return false;
    const path = window.location.pathname;
    if (targetPage === "/") return path === "/";
    return path.startsWith(targetPage);
  },
};

export function InspectorSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider config={inspectorSessionConfig}>{children}</SessionProvider>;
}
