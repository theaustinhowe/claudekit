"use client";

import { cn } from "@claudekit/ui";
import { ErrorBoundary } from "@claudekit/ui/components/error-boundary";
import { usePhaseController } from "@/lib/phase-controller";
import { useApp } from "@/lib/store";
import { PHASE_LABELS, type Phase } from "@/lib/types";
import { Phase1Empty } from "./phase1-empty";
import { Phase1Tree } from "./phase1-tree";
import { Phase2Outline } from "./phase2-outline";
import { Phase3DataPlan } from "./phase3-data-plan";
import { Phase4Scripts } from "./phase4-scripts";
import { Phase5Recording } from "./phase5-recording";
import { Phase6Voiceover } from "./phase6-voiceover";
import { Phase7Output } from "./phase7-output";

export function RightPanel() {
  const { state } = useApp();
  const controller = usePhaseController();

  const content = state.rightPanelContent;
  const hasProject = !!state.projectName;

  // Viewing a completed phase that isn't the current active one = read-only
  const isViewingCompleted =
    content !== null && state.phaseStatuses[content] === "completed" && content !== state.currentPhase;

  const threadCount = content !== null ? (state.threads[content as Phase]?.length ?? 0) : 0;

  const handleEditClick = () => {
    if (content !== null) {
      controller.handleEditPhaseFromPanel(content as Phase);
    }
  };

  const phaseContent =
    content === null || (content === 1 && !hasProject) ? (
      <Phase1Empty />
    ) : content === 1 ? (
      <Phase1Tree />
    ) : content === 2 ? (
      <Phase2Outline />
    ) : content === 3 ? (
      <Phase3DataPlan />
    ) : content === 4 ? (
      <Phase4Scripts />
    ) : content === 5 ? (
      <Phase5Recording onComplete={controller.handleRecordingComplete} />
    ) : content === 6 ? (
      <Phase6Voiceover />
    ) : content === 7 ? (
      <Phase7Output />
    ) : (
      <Phase1Empty />
    );

  const phaseLabel = content !== null ? PHASE_LABELS[content as Phase] : null;

  return (
    <section className="h-full flex flex-col relative bg-card" aria-label="Phase content panel">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {phaseLabel ? `Now showing: ${phaseLabel}` : ""}
      </div>

      {isViewingCompleted && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-primary/30 bg-primary/5 shrink-0">
          <span className="text-primary text-xs">{"\u2713"}</span>
          <span className="text-xs text-muted-foreground flex-1">
            {PHASE_LABELS[content as Phase]} — completed (read-only)
            {threadCount > 1 && (
              <span className="text-2xs text-muted-foreground/60 ml-1">({threadCount} revisions)</span>
            )}
          </span>
          <button
            type="button"
            onClick={handleEditClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-2xs font-medium transition-all border border-border rounded-md text-muted-foreground hover:border-primary hover:text-primary"
          >
            <span>{"\u270E"}</span>
            <span>New Revision</span>
          </button>
        </div>
      )}

      <ErrorBoundary
        key={`${content ?? "empty"}`}
        fallbackLabel={content ? `Phase ${content} encountered an error` : undefined}
      >
        <div
          className={cn("flex-1 overflow-hidden", isViewingCompleted && "opacity-80 pointer-events-none select-none")}
        >
          {phaseContent}
        </div>
      </ErrorBoundary>
    </section>
  );
}
