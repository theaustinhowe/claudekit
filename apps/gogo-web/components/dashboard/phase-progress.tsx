"use client";

import type { JobLog } from "@claudekit/gogo-shared";
import { cn } from "@claudekit/ui";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

// Phase definitions for the work progress indicator
type Phase = "setup" | "analysis" | "implementation" | "testing" | "complete";

const PHASES: { key: Phase; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "analysis", label: "Analysis" },
  { key: "implementation", label: "Implementation" },
  { key: "testing", label: "Testing" },
  { key: "complete", label: "Complete" },
];

/**
 * Detect which phases have been reached based on log content.
 * Returns a map of phase -> true/false.
 */
function detectPhases(logs: JobLog[]): Record<Phase, boolean> {
  const detected: Record<Phase, boolean> = {
    setup: false,
    analysis: false,
    implementation: false,
    testing: false,
    complete: false,
  };

  for (const log of logs) {
    const content = log.content.toLowerCase();

    // Setup phase
    if (
      content.includes("cloning") ||
      content.includes("worktree") ||
      content.includes("checkout") ||
      content.includes("initializing") ||
      content.includes("setting up")
    ) {
      detected.setup = true;
    }

    // Analysis phase
    if (
      content.includes("analyzing") ||
      content.includes("reading") ||
      content.includes("understanding") ||
      content.includes("exploring")
    ) {
      detected.analysis = true;
    }

    // Implementation phase
    if (
      content.includes("modifying") ||
      content.includes("editing") ||
      content.includes("creating file") ||
      content.includes("writing") ||
      content.includes("implementing")
    ) {
      detected.implementation = true;
    }

    // Testing phase
    if (
      content.includes("running tests") ||
      content.includes("npm test") ||
      content.includes("pnpm test") ||
      content.includes("linting") ||
      content.includes("type check")
    ) {
      detected.testing = true;
    }

    // Complete phase
    if (
      content.includes("creating pr") ||
      content.includes("pull request created") ||
      content.includes("complete") ||
      content.includes("finished")
    ) {
      detected.complete = true;
    }
  }

  return detected;
}

/**
 * Find current phase index (last detected phase that's true)
 */
function getCurrentPhaseIndex(detectedPhases: Record<Phase, boolean>): number {
  let lastIndex = -1;
  for (let i = 0; i < PHASES.length; i++) {
    if (detectedPhases[PHASES[i].key]) {
      lastIndex = i;
    }
  }
  return lastIndex;
}

/**
 * Convert a server-side phase string to a phase detection map.
 */
function getPhaseMapFromServerPhase(serverPhase: string): Record<Phase, boolean> {
  const phases: Record<Phase, boolean> = {
    setup: false,
    analysis: false,
    implementation: false,
    testing: false,
    complete: false,
  };

  const phaseOrder: Phase[] = ["setup", "analysis", "implementation", "testing", "complete"];

  const phaseIndex = phaseOrder.indexOf(serverPhase as Phase);
  if (phaseIndex >= 0) {
    // Mark all phases up to and including current as detected
    for (let i = 0; i <= phaseIndex; i++) {
      phases[phaseOrder[i]] = true;
    }
  }

  return phases;
}

interface PhaseProgressProps {
  logs: JobLog[];
  phase?: string | null;
  progress?: number | null;
  compact?: boolean;
  className?: string;
}

export function PhaseProgress({
  logs,
  phase: serverPhase,
  progress: _serverProgress,
  compact = false,
  className,
}: PhaseProgressProps) {
  // Prefer server-side phase data when available, fall back to client-side detection
  const detectedPhases = serverPhase ? getPhaseMapFromServerPhase(serverPhase) : detectPhases(logs);
  const currentPhaseIndex = getCurrentPhaseIndex(detectedPhases);

  // Don't render if no phases detected
  if (currentPhaseIndex < 0) return null;

  if (compact) {
    // Compact version for header/activity area
    const currentPhase = PHASES[currentPhaseIndex];
    const isComplete = currentPhase.key === "complete";

    return (
      <div className={cn("flex items-center gap-1.5 text-xs", className)}>
        {PHASES.map((phase, index) => {
          const isCompleted = index < currentPhaseIndex || (index === currentPhaseIndex && phase.key === "complete");
          const isCurrent = index === currentPhaseIndex && phase.key !== "complete";
          const isPending = index > currentPhaseIndex;

          return (
            <div
              key={phase.key}
              className={cn(
                "h-1.5 w-6 rounded-full transition-colors",
                isCompleted && "bg-green-500 dark:bg-green-400",
                isCurrent && "bg-blue-500 dark:bg-blue-400",
                isPending && "bg-muted",
              )}
              title={phase.label}
            />
          );
        })}
        <span className="ml-1 text-muted-foreground">{isComplete ? "Complete" : currentPhase.label}</span>
      </div>
    );
  }

  // Full version for log viewer
  return (
    <div className={cn("flex items-center gap-1 text-xs", className)}>
      {PHASES.map((phase, index) => {
        const isCompleted = index < currentPhaseIndex || (index === currentPhaseIndex && phase.key === "complete");
        const isCurrent = index === currentPhaseIndex && phase.key !== "complete";
        const isPending = index > currentPhaseIndex;

        return (
          <div key={phase.key} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full",
                isCompleted && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
                isCurrent && "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
                isPending && "bg-muted text-muted-foreground",
              )}
            >
              {isCompleted && <CheckCircle2 className="h-3 w-3" />}
              {isCurrent && <Loader2 className="h-3 w-3 animate-spin" />}
              {isPending && <Circle className="h-3 w-3" />}
              <span>{phase.label}</span>
            </div>
            {index < PHASES.length - 1 && (
              <div
                className={cn(
                  "w-4 h-0.5 mx-0.5",
                  index < currentPhaseIndex ? "bg-green-400 dark:bg-green-600" : "bg-muted",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
