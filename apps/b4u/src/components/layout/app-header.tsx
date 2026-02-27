"use client";

import { cn } from "@claudekit/ui";
import { Tooltip } from "@/components/ui/tooltip";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { PHASE_DECISION_CONFIGS } from "@/lib/phase-decisions";
import { useApp } from "@/lib/store";
import { getActiveThread } from "@/lib/thread-utils";
import { PHASE_LABELS, type Phase } from "@/lib/types";

function SyncIndicator() {
  const { status } = useSyncStatus();
  if (status === "idle") return null;
  return (
    <Tooltip label={status === "saving" ? "Saving changes..." : "Changes not saved"} position="bottom">
      <div
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          status === "saving" && "bg-primary animate-pulse",
          status === "error" && "bg-amber-500",
        )}
        aria-label={status === "saving" ? "Saving" : "Save error"}
      />
    </Tooltip>
  );
}

function getGateProgress(
  state: { threads: Record<Phase, import("@/lib/types").PhaseThread[]>; activeThreadIds: Record<Phase, string | null> },
  phase: Phase,
): { done: number; total: number } | null {
  const configs = PHASE_DECISION_CONFIGS[phase];
  const gateConfigs = configs.filter((c) => c.gate);
  if (gateConfigs.length === 0) return null;

  const thread = getActiveThread(state.threads, state.activeThreadIds, phase);
  if (!thread) return null;

  const gateKeys = new Set(gateConfigs.map((c) => c.key));
  const gateDecisions = thread.decisions.filter((d) => gateKeys.has(d.key));
  const done = gateDecisions.filter((d) => d.value !== null).length;
  return { done, total: gateConfigs.length };
}

export function PhaseStepper() {
  const { state, dispatch } = useApp();
  const phases = [1, 2, 3, 4, 5, 6, 7] as Phase[];

  const handlePhaseClick = (phase: Phase) => {
    const status = state.phaseStatuses[phase];
    if (status === "locked") return;
    dispatch({ type: "SET_VIEWING_PHASE", phase });
  };

  return (
    <div className="flex items-center h-12 px-6 gap-3">
      <SyncIndicator />
      {/* Phase stepper */}
      <nav aria-label="Phase progress" className="flex items-center gap-0.5 ml-auto overflow-x-auto scrollbar-none">
        {phases.map((phase, i) => {
          const status = state.phaseStatuses[phase];
          const isCompleted = status === "completed";
          const isActive = status === "active";
          const isViewing = state.viewingPhase === phase;
          const threadCount = state.threads[phase]?.length ?? 0;
          const gateProgress = isActive ? getGateProgress(state, phase) : null;
          return (
            <div key={phase} className="flex items-center shrink-0">
              {i > 0 && <div className={cn("w-5 md:w-8 h-px", status === "locked" ? "bg-border" : "bg-primary/40")} />}
              <button
                type="button"
                onClick={() => handlePhaseClick(phase)}
                title={PHASE_LABELS[phase]}
                aria-label={`Phase ${phase}: ${PHASE_LABELS[phase]} — ${status}`}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 py-1.5 text-2xs transition-all px-2 md:px-3 rounded-lg border",
                  isCompleted && "cursor-pointer hover:opacity-80 text-primary border-transparent",
                  isActive && "text-primary-foreground bg-primary border-primary",
                  !isCompleted && !isActive && "cursor-default text-foreground/60 border-transparent",
                  isViewing && !isActive && "bg-primary/10 border-primary/30",
                  status === "locked" && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "w-5 h-5 flex items-center justify-center shrink-0 rounded-full text-[9px] font-semibold",
                    isCompleted && "bg-primary text-primary-foreground",
                    isActive && "bg-primary-foreground/20 text-primary-foreground",
                    !isCompleted && !isActive && "border-2 border-foreground/25 text-foreground/60",
                  )}
                >
                  {isCompleted ? "\u2713" : phase}
                </span>
                <span className="hidden lg:inline">{PHASE_LABELS[phase]}</span>
                {threadCount > 1 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 text-[8px] font-bold rounded-full bg-primary/15 text-primary">
                    {threadCount}
                  </span>
                )}
                {gateProgress && gateProgress.done < gateProgress.total && (
                  <span className="inline-flex items-center justify-center min-w-4 h-4 px-0.5 text-[8px] font-bold rounded-full bg-primary-foreground/20 text-primary-foreground">
                    {gateProgress.done}/{gateProgress.total}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
