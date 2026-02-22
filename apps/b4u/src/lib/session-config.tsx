"use client";

import type { SessionPanelConfig } from "@claudekit/ui/components/session-provider";

const B4U_SESSION_TYPE_LABELS: Record<string, string> = {
  "analyze-project": "Analyze Project",
  "generate-outline": "Generate Outline",
  "generate-data-plan": "Data Plan",
  "generate-scripts": "Generate Scripts",
  "generate-voiceover": "Voiceover",
  "voiceover-audio": "Audio",
  recording: "Recording",
  "final-merge": "Final Merge",
  "edit-content": "Edit Content",
  chat: "Chat",
};

export const b4uSessionConfig: SessionPanelConfig = {
  typeLabels: B4U_SESSION_TYPE_LABELS,
};
