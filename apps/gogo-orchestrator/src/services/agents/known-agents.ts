import type { AgentCapabilities } from "./types.js";

/**
 * Metadata for a known agent type
 */
export interface KnownAgentMetadata {
  type: string;
  displayName: string;
  description: string;
  capabilities: AgentCapabilities;
  /** Environment variables required to enable this agent */
  envVars: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  /** URL to documentation or installation instructions */
  docsUrl: string | null;
  /** Brief installation instructions */
  installInstructions: string;
}

/**
 * All known agents that can be configured in the system.
 * This is the source of truth for available agent types.
 */
export const KNOWN_AGENTS: KnownAgentMetadata[] = [
  {
    type: "claude-code",
    displayName: "Claude Code",
    description:
      "Anthropic's Claude Code CLI for autonomous coding tasks. Requires the Claude CLI to be installed and authenticated.",
    capabilities: {
      canResume: true,
      canInject: true,
      supportsStreaming: true,
    },
    envVars: [],
    docsUrl: "https://claude.ai/code",
    installInstructions:
      "Install the Claude CLI: npm install -g @anthropic-ai/claude-code, then run 'claude login' to authenticate.",
  },
  {
    type: "openai-codex",
    displayName: "OpenAI Codex",
    description:
      "OpenAI's GPT-4 based coding agent using the Responses API. Requires an OpenAI API key and feature flag enabled.",
    capabilities: {
      canResume: true,
      canInject: true,
      supportsStreaming: true,
    },
    envVars: [
      {
        name: "ENABLE_OPENAI_CODEX",
        description: "Set to 'true' to enable the OpenAI Codex agent",
        required: true,
      },
      {
        name: "OPENAI_API_KEY",
        description: "Your OpenAI API key",
        required: true,
      },
      {
        name: "OPENAI_MODEL",
        description: "Model to use (defaults to gpt-4o)",
        required: false,
      },
    ],
    docsUrl: "/docs/openai.md",
    installInstructions:
      "Set ENABLE_OPENAI_CODEX=true and OPENAI_API_KEY in your environment, then restart the orchestrator.",
  },
];
