import { PHASE_LABELS, type Phase } from "@/lib/types";

export function buildChatResponsePrompt(message: string, phase: Phase, phaseData: Record<string, unknown>): string {
  const phaseLabel = PHASE_LABELS[phase];
  const dataSummary = Object.entries(phaseData)
    .map(([key, val]) => {
      if (Array.isArray(val)) return `${key}: ${val.length} items`;
      if (typeof val === "object" && val !== null) return `${key}: ${JSON.stringify(val).slice(0, 200)}`;
      return `${key}: ${val}`;
    })
    .join("\n  ");

  return `You are an AI assistant helping a user create a demo walkthrough video of their web application using B4U (a video generation tool).

Current phase: ${phase} — ${phaseLabel}

Phase data summary:
  ${dataSummary || "No data loaded yet"}

The user said: "${message}"

Respond helpfully in 1-3 concise sentences. Be specific to the current phase context.

If the user is asking to make changes, suggest they use the edit features in the right panel or click "Edit..." on the approve card.
If the user seems confused, briefly explain what the current phase does and what they should do next.
If the user wants to move forward, remind them to review the right panel and click the approve button.

Return valid JSON in this exact format:
{
  "response": "Your helpful response here",
  "suggestedAction": null
}

The suggestedAction can be null, "edit", "approve", or "help". Use "edit" if the user wants to change something, "approve" if they want to continue, "help" if they need more information.`;
}
