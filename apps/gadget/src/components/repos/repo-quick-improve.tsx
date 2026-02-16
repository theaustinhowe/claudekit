"use client";

import { useSessionStream } from "@devkit/hooks";
import { Button } from "@devkit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@devkit/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Brush, ChevronDown, Code2, Eraser, Shield, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SessionTerminal } from "@/components/sessions/session-terminal";
import type { QuickImprovePersona } from "@/lib/services/quick-improve-prompts";
import { PERSONA_CONFIGS } from "@/lib/services/quick-improve-prompts";
import type { Repo } from "@/lib/types";

interface QuickImproveSession {
  id: string;
  persona: QuickImprovePersona;
}

export function useQuickImprove(repo: Pick<Repo, "id" | "name" | "git_remote">) {
  const [sessions, setSessions] = useState<QuickImproveSession[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  const isImproving = runningIds.size > 0;

  // Recovery: reconnect to running sessions on mount
  useEffect(() => {
    let cancelled = false;
    async function recover() {
      try {
        const res = await fetch(`/api/sessions?contextId=${encodeURIComponent(repo.id)}&type=quick_improve&limit=5`);
        if (!res.ok || cancelled) return;
        const fetched = (await res.json()) as Array<{
          id: string;
          status: string;
          metadata_json: string;
        }>;
        if (fetched.length === 0 || cancelled) return;

        const recovered: QuickImproveSession[] = [];
        for (const s of fetched) {
          if (s.status === "running" || s.status === "pending") {
            let meta: Record<string, unknown> = {};
            try {
              meta = JSON.parse(s.metadata_json || "{}");
            } catch {
              // skip
            }
            recovered.push({
              id: s.id,
              persona: (meta.persona as QuickImprovePersona) ?? "uiux",
            });
          }
        }
        if (recovered.length > 0 && !cancelled) {
          setSessions(recovered);
          // All recovered sessions start minimized (expandedId stays null)
        }
      } catch {
        // recovery is best-effort
      }
    }
    recover();
    return () => {
      cancelled = true;
    };
  }, [repo.id]);

  const handleQuickImprove = useCallback(
    async (persona: QuickImprovePersona) => {
      if (!repo.git_remote) {
        toast.error("Quick Improve requires a git remote");
        return;
      }

      const labels: Record<QuickImprovePersona, string> = {
        uiux: "UI/UX",
        "dry-kiss": "DRY/KISS",
        security: "Security",
        cleanup: "Cleanup",
      };

      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "quick_improve",
            label: `Quick Improve (${labels[persona]}) for ${repo.name}`,
            contextType: "repo",
            contextId: repo.id,
            contextName: repo.name,
            metadata: { persona, repoId: repo.id },
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to start session");
        }

        const { sessionId } = await res.json();
        setSessions((prev) => [...prev, { id: sessionId, persona }]);
        setExpandedId(sessionId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Quick Improve failed";
        toast.error(message);
      }
    },
    [repo.id, repo.name, repo.git_remote],
  );

  const dismissSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setRunningIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setExpandedId((prev) => (prev === id ? null : prev));
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const markRunning = useCallback((id: string, running: boolean) => {
    setRunningIds((prev) => {
      const next = new Set(prev);
      if (running) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  return {
    sessions,
    expandedId,
    isImproving,
    handleQuickImprove,
    dismissSession,
    toggleExpand,
    markRunning,
  };
}

interface QuickImproveTerminalProps {
  sessionId: string;
  persona: QuickImprovePersona;
  minimized: boolean;
  onToggleMinimize: () => void;
  onDismiss: () => void;
  onMarkRunning: (running: boolean) => void;
  onRetry: () => void;
}

export function QuickImproveTerminal({
  sessionId,
  persona,
  minimized,
  onToggleMinimize,
  onDismiss,
  onMarkRunning,
  onRetry,
}: QuickImproveTerminalProps) {
  const router = useRouter();
  const [completionData, setCompletionData] = useState<{
    prUrl?: string;
    branchName?: string;
    diffSummary?: { filesChanged: number; insertions: number; deletions: number };
    noChanges?: boolean;
  } | null>(null);

  const session = useSessionStream({
    sessionId,
    onComplete: (event) => {
      router.refresh();
      if (event.type === "cancelled") {
        onDismiss();
      } else if (event.type === "done" && event.data?.prUrl) {
        setCompletionData({
          prUrl: event.data.prUrl as string,
          branchName: event.data.branchName as string | undefined,
          diffSummary: event.data.diffSummary as
            | { filesChanged: number; insertions: number; deletions: number }
            | undefined,
        });
        toast.success("Pull request created!", {
          action: {
            label: "View PR",
            onClick: () => window.open(event.data?.prUrl as string, "_blank"),
          },
        });
      } else if (event.type === "done") {
        setCompletionData({ noChanges: true });
      }
    },
  });

  const isRunning = session.status === "streaming" || session.status === "connecting";

  // Report running state back to parent
  // biome-ignore lint/correctness/useExhaustiveDependencies: onMarkRunning is stable
  useEffect(() => {
    onMarkRunning(isRunning);
  }, [isRunning]);

  return (
    <SessionTerminal
      logs={session.logs}
      progress={session.progress}
      phase={session.phase}
      status={session.status}
      error={session.error}
      elapsed={session.elapsed}
      title={`Quick Improve — ${PERSONA_CONFIGS[persona].label}`}
      completionData={completionData ?? undefined}
      onCancel={session.cancel}
      onRetry={onRetry}
      onDismiss={onDismiss}
      variant="compact"
      minimized={minimized}
      onToggleMinimize={onToggleMinimize}
    />
  );
}

interface QuickImproveDropdownProps {
  onSelect: (persona: QuickImprovePersona) => void;
  disabled: boolean;
  hasRemote: boolean;
}

export function QuickImproveDropdown({ onSelect, disabled, hasRemote }: QuickImproveDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <Sparkles className="w-4 h-4 mr-1.5" />
          Quick Improve
          <ChevronDown className="w-3.5 h-3.5 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DropdownMenuItem disabled={!hasRemote} onClick={() => onSelect("uiux")}>
                  <Brush className="w-4 h-4 mr-2" />
                  UI/UX
                </DropdownMenuItem>
              </span>
            </TooltipTrigger>
            {!hasRemote && <TooltipContent side="left">Requires a git remote</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DropdownMenuItem disabled={!hasRemote} onClick={() => onSelect("dry-kiss")}>
                  <Code2 className="w-4 h-4 mr-2" />
                  DRY/KISS
                </DropdownMenuItem>
              </span>
            </TooltipTrigger>
            {!hasRemote && <TooltipContent side="left">Requires a git remote</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DropdownMenuItem disabled={!hasRemote} onClick={() => onSelect("security")}>
                  <Shield className="w-4 h-4 mr-2" />
                  Security
                </DropdownMenuItem>
              </span>
            </TooltipTrigger>
            {!hasRemote && <TooltipContent side="left">Requires a git remote</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DropdownMenuItem disabled={!hasRemote} onClick={() => onSelect("cleanup")}>
                  <Eraser className="w-4 h-4 mr-2" />
                  Cleanup
                </DropdownMenuItem>
              </span>
            </TooltipTrigger>
            {!hasRemote && <TooltipContent side="left">Requires a git remote</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
