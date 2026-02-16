import { isCodexEnabled } from "../settings-helper.js";
import { claudeCodeRunner } from "./claude-code-runner.js";
import { openaiCodexRunner } from "./openai-codex-runner.js";
import { agentRegistry } from "./registry.js";

// Auto-register Claude Code runner (always available)
agentRegistry.register(claudeCodeRunner);

// Conditionally register Codex runner based on feature flag
if (isCodexEnabled()) {
  agentRegistry.register(openaiCodexRunner);
  console.log("[agents] OpenAI Codex runner registered (ENABLE_OPENAI_CODEX=true)");
}

export { KNOWN_AGENTS } from "./known-agents.js";
export { agentRegistry } from "./registry.js";
// Re-export everything
export * from "./types.js";
