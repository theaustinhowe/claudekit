import { claudeCodeRunner } from "./claude-code-runner.js";
import { agentRegistry } from "./registry.js";

// Auto-register Claude Code runner (always available)
agentRegistry.register(claudeCodeRunner);

export { KNOWN_AGENTS } from "./known-agents.js";
export { agentRegistry } from "./registry.js";
// Re-export everything
export * from "./types.js";
