"use client";

import { ErrorBoundary } from "@devkit/ui/components/error-boundary";
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

  return (
    <div className="h-full flex flex-col relative bg-card">
      <ErrorBoundary
        key={content ?? "empty"}
        fallbackLabel={content ? `Phase ${content} encountered an error` : undefined}
      >
        {phaseContent}
      </ErrorBoundary>

      {isViewingCompleted && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-10"
          style={{
            background: "rgba(20, 18, 22, 0.75)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div className="flex flex-col items-center gap-3 p-6 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>✓</span>
              <span>{PHASE_LABELS[content as Phase]} — completed</span>
            </div>
            <button
              type="button"
              onClick={handleEditClick}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-medium transition-all bg-muted border border-border rounded-md text-foreground"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--primary))";
                e.currentTarget.style.color = "hsl(var(--primary))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--border))";
                e.currentTarget.style.color = "hsl(var(--foreground))";
              }}
            >
              <span>✎</span>
              <span>Edit this step</span>
            </button>
            <div className="text-2xs text-muted-foreground">This will restart from this phase</div>
          </div>
        </div>
      )}
    </div>
  );
}
