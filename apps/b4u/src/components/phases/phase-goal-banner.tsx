"use client";

import { cn } from "@claudekit/ui";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { useApp } from "@/lib/store";
import { getActiveThread, getMissingGateDecisions } from "@/lib/thread-utils";
import type { Phase } from "@/lib/types";

interface PhaseGoal {
  objective: string;
  guidance: string;
  criteria: { key: string; label: string }[];
}

const PHASE_GOALS: Record<Phase, PhaseGoal> = {
  1: {
    objective: "Select and scan a web app project",
    guidance: "Choose a local project folder with a web app. The scanner will detect routes, auth, and database info.",
    criteria: [{ key: "folder-path", label: "Project folder selected" }],
  },
  2: {
    objective: "Review and approve the app outline",
    guidance: "Review the detected routes and user flows. Edit names, reorder steps, or add new flows, then approve.",
    criteria: [{ key: "approve-outline", label: "Outline approved" }],
  },
  3: {
    objective: "Configure mock data and environment for recording",
    guidance: "Review the mock data entities, auth overrides, and env vars. Toggle what you need, then approve.",
    criteria: [{ key: "approve-data-plan", label: "Data plan approved" }],
  },
  4: {
    objective: "Review and finalize demo scripts for each user flow",
    guidance: "Check each flow's steps — URLs, actions, durations. Edit or reorder steps, then approve all scripts.",
    criteria: [{ key: "approve-scripts", label: "Scripts approved" }],
  },
  5: {
    objective: "Record all user flow walkthroughs",
    guidance: "The recorder will launch each flow in a browser. Watch progress and approve when all flows finish.",
    criteria: [{ key: "approve-recording", label: "Recordings approved" }],
  },
  6: {
    objective: "Select a voice and finalize voiceover narration",
    guidance: "Pick a voice, adjust speed, edit the narration script per flow. Preview audio before approving.",
    criteria: [
      { key: "voice-selection", label: "Voice selected" },
      { key: "approve-voiceover", label: "Voiceover approved" },
    ],
  },
  7: {
    objective: "Review and export the final walkthrough video",
    guidance: "Play the merged video, check chapter markers, and download video/audio/script files.",
    criteria: [{ key: "review-output", label: "Video reviewed" }],
  },
};

interface PhaseGoalBannerProps {
  phase: Phase;
}

export function PhaseGoalBanner({ phase }: PhaseGoalBannerProps) {
  const { state } = useApp();
  const { status: syncStatus } = useSyncStatus();
  const goal = PHASE_GOALS[phase];
  const phaseStatus = state.phaseStatuses[phase];
  const activeThread = getActiveThread(state.threads, state.activeThreadIds, phase);

  if (!goal) return null;

  // Completed phase — compact badge
  if (phaseStatus === "completed") {
    return (
      <div className="px-4 py-1.5 border-b border-border bg-primary/5 shrink-0">
        <div className="text-2xs text-primary flex items-center gap-1.5">
          <span>{"\u2713"}</span>
          Phase {phase} complete
        </div>
      </div>
    );
  }

  // Locked phase — not yet reachable
  if (phaseStatus !== "active") {
    return (
      <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0 opacity-60">
        <div className="text-2xs text-muted-foreground">
          Phase {phase}: {goal.objective}
        </div>
        <div className="text-2xs text-muted-foreground/60 mt-0.5">Complete previous phases first</div>
      </div>
    );
  }

  // Active phase — prominent with guidance
  const missing = activeThread ? getMissingGateDecisions(activeThread) : [];
  const missingKeys = new Set(missing.map((d) => d.key));

  return (
    <div className="px-4 py-2 border-b border-border border-l-2 border-l-primary bg-muted/50 shrink-0">
      <div className="text-xs font-medium text-muted-foreground mb-0.5">
        Phase {phase}: {goal.objective}
        {syncStatus === "error" && <span className="text-amber-500 ml-2">· unsaved changes</span>}
      </div>
      <div className="text-2xs text-muted-foreground/70 mb-1.5">{goal.guidance}</div>
      {goal.criteria.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {goal.criteria.map((c) => {
            const decision = activeThread?.decisions.find((d) => d.key === c.key);
            const isComplete = decision?.value !== null && decision?.value !== undefined;
            const isGateAndMissing = missingKeys.has(c.key);
            return (
              <span
                key={c.key}
                className={cn(
                  "text-2xs flex items-center gap-1",
                  isComplete && "text-primary",
                  !isComplete && !isGateAndMissing && "text-muted-foreground/60",
                  isGateAndMissing && "text-amber-500",
                )}
              >
                {isComplete ? "\u2713" : "\u25CB"} {c.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
