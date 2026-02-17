"use client";

import { SessionProgressCard } from "@/components/chat/session-progress-card";
import { B4UDirectoryPicker } from "@/components/ui/directory-picker-wrapper";
import { Tooltip } from "@/components/ui/tooltip";
import { usePhaseController } from "@/lib/phase-controller";
import { useApp } from "@/lib/store";
import type { ActionCard } from "@/lib/types";

interface ActionCardRendererProps {
  card: ActionCard;
}

export function ActionCardRenderer({ card }: ActionCardRendererProps) {
  const { state } = useApp();
  const controller = usePhaseController();

  switch (card.type) {
    case "folder-select":
      return (
        <div className="px-4 py-3.5 bg-muted border border-border rounded-lg space-y-2">
          <div className="text-sm font-medium">Select Project Folder</div>
          <div className="text-2xs text-muted-foreground/70">Choose a local web app directory to scan</div>
          <B4UDirectoryPicker
            value={process.env.NEXT_PUBLIC_DEFAULT_DIRECTORY ?? ""}
            onChange={(path) => controller.handleFolderSelected(path)}
          />
        </div>
      );

    case "project-summary":
      return (
        <div className="px-4 py-3.5 space-y-2.5 bg-muted border border-border rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-sm">DETECTED</span>
            <span className="text-sm font-semibold">{card.data.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-2xs">
            <div className="text-muted-foreground/70">Framework</div>
            <div className="text-muted-foreground">{card.data.framework}</div>
            <div className="text-muted-foreground/70">Directories</div>
            <div className="text-muted-foreground">{card.data.directories.join(", ")}</div>
            <div className="text-muted-foreground/70">Auth</div>
            <div className="text-muted-foreground">{card.data.auth}</div>
            <div className="text-muted-foreground/70">Database</div>
            <div className="text-muted-foreground">{card.data.database}</div>
          </div>
        </div>
      );

    case "approve": {
      const isCompleted = state.phaseStatuses[card.phase] === "completed";
      return (
        <div className="flex items-center gap-2.5 px-2 py-2.5">
          {isCompleted ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-primary bg-primary/10 rounded-md">
                <span>✓</span>
                <span>Approved</span>
              </div>
              <Tooltip label="Go back and re-edit this step" position="top">
                <button
                  type="button"
                  onClick={() => controller.handleGoBackToPhase(card.phase)}
                  className="px-2.5 py-2 text-xs transition-colors text-muted-foreground border border-border rounded-md hover:border-primary hover:text-primary"
                >
                  ↩
                </button>
              </Tooltip>
            </div>
          ) : (
            <>
              <Tooltip label="Approve and move to next step" position="top">
                <button
                  type="button"
                  onClick={() => controller.approvePhase(card.phase)}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-opacity bg-primary text-primary-foreground rounded-md hover:opacity-90"
                >
                  {card.label || "Approve & Continue"} →
                </button>
              </Tooltip>
              <Tooltip label="Request changes before continuing" position="top">
                <button
                  type="button"
                  onClick={() => controller.handleEditRequest(card.phase)}
                  className="px-3 py-2.5 text-xs transition-colors text-muted-foreground/70 border border-border rounded-md hover:border-primary hover:text-primary"
                >
                  Edit...
                </button>
              </Tooltip>
            </>
          )}
        </div>
      );
    }

    case "scanning":
      return (
        <div className="flex items-center gap-3 px-4 py-3.5 bg-muted border border-border rounded-lg">
          <div className="relative w-[16px] h-[16px]">
            <div className="absolute inset-0 rounded-full animate-pulse bg-primary opacity-60" />
          </div>
          <span className="text-xs text-muted-foreground">{card.label}</span>
        </div>
      );

    case "recording-complete":
      return (
        <div className="flex items-center gap-3 px-4 py-3.5 bg-primary/10 border border-primary rounded-lg">
          <span className="text-primary">✓</span>
          <span className="text-xs font-medium text-primary">All flows recorded successfully</span>
        </div>
      );

    case "processing":
      return (
        <div className="flex items-center gap-3 px-4 py-3.5 bg-muted border border-border rounded-lg">
          <div className="w-full h-[3px] overflow-hidden bg-card rounded-full">
            <div
              className="h-full bg-primary"
              style={{
                animation: "progress 3s ease-out forwards",
              }}
            />
          </div>
        </div>
      );

    case "final-ready":
      return (
        <div className="flex items-center gap-3 px-4 py-3.5 bg-primary/10 border border-primary rounded-lg">
          <span className="text-primary">▶</span>
          <span className="text-xs font-medium text-primary">Your feature walkthrough is ready!</span>
        </div>
      );

    case "session-progress":
      return <SessionProgressCard sessionId={card.sessionId} label={card.label} />;

    case "edit-request":
      return (
        <div
          className="flex items-center gap-3 px-4 py-3.5 bg-muted border border-primary rounded-lg"
          style={{ borderLeft: "3px solid hsl(var(--primary))" }}
        >
          <span className="text-primary">✎</span>
          <span className="text-xs text-muted-foreground">{card.request}</span>
        </div>
      );

    default:
      return null;
  }
}
