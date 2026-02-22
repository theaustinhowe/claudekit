"use client";

import type { SessionRowBase } from "@claudekit/session";
import { ExternalLink, Square } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { cn, formatElapsed } from "../utils";
import { Button } from "./button";
import { Progress } from "./progress";
import { SessionBadge } from "./session-badge";
import { useSessionPanel } from "./session-provider";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

// ---------------------------------------------------------------------------
// SessionRowItem (internal)
// ---------------------------------------------------------------------------

function SessionRowItem({ session }: { session: SessionRowBase }) {
  const [cancelling, setCancelling] = useState(false);
  const { config } = useSessionPanel();
  const isActive = session.status === "running" || session.status === "pending";
  const contextLink = config.getContextLink?.(session) ?? null;
  const typeLabel = config.typeLabels[session.session_type] ?? session.session_type;
  const apiBase = config.apiBaseUrl ?? "";

  const elapsed =
    session.started_at && isActive
      ? Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
      : session.started_at && session.completed_at
        ? Math.floor((new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000)
        : 0;

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      await fetch(`${apiBase}/api/sessions/${session.id}/cancel`, { method: "POST" });
    } catch {
      // ignore
    }
    setCancelling(false);
  }, [session.id, apiBase]);

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-center gap-2">
        <SessionBadge status={session.status} elapsed={isActive ? elapsed : undefined} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{session.label}</div>
          <div className="text-[11px] text-muted-foreground">{typeLabel}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <TooltipProvider>
            {contextLink && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="View context" asChild>
                    <Link href={contextLink}>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View context</TooltipContent>
              </Tooltip>
            )}
            {isActive && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-6 w-6 text-red-500 hover:text-red-400 hover:bg-red-500/10",
                      cancelling && "opacity-50",
                    )}
                    disabled={cancelling}
                    onClick={handleCancel}
                    aria-label="Cancel session"
                  >
                    <Square className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* Progress bar for running sessions */}
      {isActive && session.progress > 0 && <Progress value={session.progress} className="h-1" />}

      {/* Phase text */}
      {isActive && session.phase && <span className="text-[10px] text-muted-foreground truncate">{session.phase}</span>}

      {/* Error message */}
      {session.status === "error" && session.error_message && (
        <span className="text-[10px] text-red-500 truncate">{session.error_message}</span>
      )}

      {/* Completed elapsed */}
      {!isActive && elapsed > 0 && (
        <span className="text-[10px] text-muted-foreground">Completed in {formatElapsed(elapsed)}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionPanel (main export)
// ---------------------------------------------------------------------------

export function SessionPanel() {
  const { sessions, panelOpen, setPanelOpen } = useSessionPanel();

  const activeSessions = sessions.filter((s) => s.status === "running" || s.status === "pending");
  const completedSessions = sessions.filter((s) => s.status !== "running" && s.status !== "pending");

  return (
    <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px] p-0">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-base">Sessions</SheetTitle>
          <SheetDescription className="text-xs">
            {activeSessions.length > 0
              ? `${activeSessions.length} active session${activeSessions.length !== 1 ? "s" : ""}`
              : "No active sessions"}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="overflow-y-auto flex-1">
            {/* Active sessions */}
            {activeSessions.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/50">
                  Active
                </div>
                {activeSessions.map((s) => (
                  <SessionRowItem key={s.id} session={s} />
                ))}
              </div>
            )}

            {/* Completed sessions */}
            {completedSessions.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/50">
                  Recent
                </div>
                {completedSessions.map((s) => (
                  <SessionRowItem key={s.id} session={s} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {sessions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <span className="text-sm">No active sessions</span>
                <span className="text-xs mt-1">Sessions will appear here when running</span>
              </div>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
