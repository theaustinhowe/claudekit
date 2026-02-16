import { isCodexEnabled } from "../settings-helper.js";
import { claudeCodeRunner } from "./claude-code-runner.js";
import { openaiCodexRunner } from "./openai-codex-runner.js";
import { agentRegistry } from "./registry.js";

// Auto-register Claude Code runner (always available)
agentRegistry.register(claudeCodeRunner);

// Conditionally register Codex runner based on feature flag
if (isCodexEnabled()) {
  agentRegistry.register(openaiCodexRunner);
  console.log(
    "[agents] OpenAI Codex runner registered (ENABLE_OPENAI_CODEX=true)",
  );
}

export { claudeCodeRunner } from "./claude-code-runner.js";
export { KNOWN_AGENTS } from "./known-agents.js";
export { openaiCodexRunner } from "./openai-codex-runner.js";
export { agentRegistry } from "./registry.js";
// Re-export everything
export * from "./types.js";
