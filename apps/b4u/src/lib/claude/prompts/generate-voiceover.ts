export function buildGenerateVoiceoverPrompt(
  scripts: Array<{
    flowId: string;
    flowName: string;
    steps: Array<{ action: string; expectedOutcome: string; duration: string }>;
  }>,
): string {
  return `You are writing voiceover narration scripts for a software demo video.

Demo scripts to narrate: ${JSON.stringify(scripts, null, 2)}

Write natural, professional narration that a voice actor would read while the demo plays. Group related steps into paragraphs.

Your output MUST be valid JSON:
{
  "voiceovers": {
    "flow-id": [
      "First paragraph of narration covering the first few steps...",
      "Second paragraph covering the next steps..."
    ]
  },
  "timelineMarkers": {
    "flow-id": [
      { "timestamp": "0:00", "label": "Section Name", "paragraphIndex": 0 },
      { "timestamp": "0:08", "label": "Next Section", "paragraphIndex": 1 }
    ]
  }
}

Guidelines:
- Professional but friendly tone, like a product demo
- 2-4 paragraphs per flow
- Each paragraph should be 2-3 sentences
- Reference specific UI elements and user actions
- Explain WHY features matter, not just what they do
- Timeline timestamps should roughly match cumulative step durations
- Each paragraph maps to a timeline marker

Return ONLY the JSON object.`;
}
