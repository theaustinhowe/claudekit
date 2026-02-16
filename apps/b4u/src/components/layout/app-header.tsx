"use client";

import { cn } from "@devkit/ui";
import { useApp } from "@/lib/store";
import { PHASE_LABELS, type Phase } from "@/lib/types";

export function PhaseStepper() {
  const { state, dispatch } = useApp();
  const phases = [1, 2, 3, 4, 5, 6, 7] as Phase[];

  const handlePhaseClick = (phase: Phase) => {
    const status = state.phaseStatuses[phase];
    if (status === "locked") return;
    dispatch({ type: "GOTO_PHASE", phase });
  };

  return (
    <div className="flex items-center h-12 px-6 gap-3">
      {/* Project name badge */}
      {state.projectName && (
        <div className="hidden md:flex items-center gap-1.5 mr-2 px-3 py-1.5 text-2xs bg-card border border-border rounded-lg text-muted-foreground">
          <span className="text-muted-foreground/60">project</span>
          <span className="text-primary font-medium">{state.projectName}</span>
        </div>
      )}

      {/* Phase stepper */}
      <nav aria-label="Phase progress" className="flex items-center gap-0.5 ml-auto overflow-x-auto scrollbar-none">
        {phases.map((phase, i) => {
          const status = state.phaseStatuses[phase];
          const isCompleted = status === "completed";
          const isActive = status === "active";
          const isViewing = state.rightPanelContent === phase;
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
                  isViewing && isCompleted && !isActive && "bg-primary/10 border-primary/30",
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
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
