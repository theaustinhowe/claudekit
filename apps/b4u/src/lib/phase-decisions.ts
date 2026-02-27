import type { Phase, PhaseDecisionConfig } from "./types";

/**
 * Decision configs per phase. These define the structured decisions
 * that must be made before a phase can be completed.
 */
export const PHASE_DECISION_CONFIGS: Record<Phase, PhaseDecisionConfig[]> = {
  1: [
    { key: "folder-path", label: "Project folder", type: "text", required: true, gate: true },
    { key: "confirm-scan", label: "Confirm scan", type: "confirm", required: true },
  ],
  2: [{ key: "approve-outline", label: "Approve outline", type: "confirm", required: true }],
  3: [{ key: "approve-data-plan", label: "Approve data plan", type: "confirm", required: true }],
  4: [{ key: "approve-scripts", label: "Approve scripts", type: "confirm", required: true }],
  5: [{ key: "approve-recording", label: "Approve recording", type: "confirm", required: true }],
  6: [
    { key: "voice-selection", label: "Voice selection", type: "select", required: true, gate: true },
    { key: "approve-voiceover", label: "Approve voiceover", type: "confirm", required: true },
  ],
  7: [{ key: "review-output", label: "Video reviewed", type: "confirm", required: false }],
};
