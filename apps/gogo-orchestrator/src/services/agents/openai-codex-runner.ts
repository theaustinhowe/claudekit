import type { InjectMode } from "@devkit/gogo-shared";
import {
  CODEX_ERRORS,
  getActiveRunCount,
  getCodexAvailabilityError,
  injectCodexMessage,
  isRunning,
  pauseCodexRun,
  resumeCodexRun,
  startCodexRun,
  stopCodexRun,
} from "../openai-codex-agent.js";

// Re-export for external use
export { pauseCodexRun };

import type {
  AgentCallbacks,
  AgentCapabilities,
  AgentConfig,
  AgentJobContext,
  AgentRunner,
  AgentSession,
  AgentStartResult,
} from "./types.js";

/**
 * OpenAI Codex agent runner
 *
 * This runner uses the OpenAI Responses API with custom tools
 * for shell/file operations to implement an autonomous coding agent.
 *
 * To enable:
 * 1. Set ENABLE_OPENAI_CODEX=true environment variable
 * 2. Set OPENAI_API_KEY environment variable
 * 3. Optionally set OPENAI_MODEL (defaults to gpt-4o)
 * 4. Restart the orchestrator
 *
 * See docs/openai.md for full documentation.
 */
export const openaiCodexRunner: AgentRunner = {
  type: "openai-codex",
  displayName: "OpenAI Codex",

  capabilities: {
    canResume: true,
    canInject: true,
    supportsStreaming: true,
  } as AgentCapabilities,

  async start(context: AgentJobContext, config: AgentConfig, callbacks: AgentCallbacks): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = getCodexAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    // Delegate to real implementation
    return startCodexRun(context, config, callbacks);
  },

  async resume(
    context: AgentJobContext,
    _session: AgentSession,
    config: AgentConfig,
    callbacks: AgentCallbacks,
    message?: string,
  ): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = getCodexAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    return resumeCodexRun(context, config, callbacks, message);
  },

  async inject(jobId: string, message: string, mode: InjectMode): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = getCodexAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    return injectCodexMessage(jobId, message, mode);
  },

  async stop(jobId: string, saveSession = false): Promise<boolean> {
    return stopCodexRun(jobId, saveSession);
  },

  isRunning(jobId: string): boolean {
    return isRunning(jobId);
  },

  getActiveRunCount(): number {
    return getActiveRunCount();
  },
};

/**
 * Get the status of the OpenAI Codex runner
 * Used by the /agents/:type/status API endpoint
 */
export function getCodexRunnerStatus(): {
  type: string;
  available: boolean;
  configured: boolean;
  featureFlagEnabled: boolean;
  apiKeySet: boolean;
  registered: boolean;
  message: string;
  stub: boolean;
} {
  const error = getCodexAvailabilityError();

  // Determine individual flags by checking env directly
  const enabled = process.env.ENABLE_OPENAI_CODEX === "true";
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  let message: string;
  if (!enabled) {
    message = CODEX_ERRORS.NOT_ENABLED;
  } else if (!hasApiKey) {
    message = CODEX_ERRORS.NO_API_KEY;
  } else {
    message = "OpenAI Codex runner is ready";
  }

  return {
    type: "openai-codex",
    available: !error,
    configured: enabled && hasApiKey,
    featureFlagEnabled: enabled,
    apiKeySet: hasApiKey,
    registered: enabled,
    message,
    stub: false, // No longer a stub!
  };
}
