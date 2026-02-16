import type { InjectMode } from "@devkit/gogo-shared";
import {
  CODEX_ERRORS,
  getActiveRunCount,
  getCodexAvailabilityError,
  injectCodexMessage,
  isCodexCliAvailable,
  isRunning,
  resumeCodexRun,
  startCodexRun,
  stopCodexRun,
} from "../openai-codex-agent.js";
import { hasOpenAIApiKey, isCodexEnabled } from "../settings-helper.js";

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
 * This runner spawns the Codex CLI for autonomous coding tasks,
 * mirroring the pattern used by the Claude Code runner.
 *
 * To enable:
 * 1. Set ENABLE_OPENAI_CODEX=true environment variable
 * 2. Set OPENAI_API_KEY environment variable
 * 3. Install the Codex CLI: npm install -g @openai/codex
 * 4. Optionally set OPENAI_MODEL (defaults to o4-mini)
 * 5. Restart the orchestrator
 */
export const openaiCodexRunner: AgentRunner = {
  type: "openai-codex",
  displayName: "OpenAI Codex",

  capabilities: {
    canResume: true,
    canInject: true,
    supportsStreaming: true,
  } as AgentCapabilities,

  async start(context: AgentJobContext, _config: AgentConfig, _callbacks: AgentCallbacks): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = await getCodexAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    return startCodexRun(context.jobId);
  },

  async resume(
    context: AgentJobContext,
    _session: AgentSession,
    _config: AgentConfig,
    _callbacks: AgentCallbacks,
    message?: string,
  ): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = await getCodexAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    return resumeCodexRun(context.jobId, message);
  },

  async inject(jobId: string, message: string, mode: InjectMode): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = await getCodexAvailabilityError();
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
export async function getCodexRunnerStatus(): Promise<{
  type: string;
  available: boolean;
  configured: boolean;
  featureFlagEnabled: boolean;
  apiKeySet: boolean;
  cliInstalled: boolean;
  registered: boolean;
  message: string;
  stub: boolean;
}> {
  const enabled = isCodexEnabled();
  const hasApiKey = hasOpenAIApiKey();
  const cliInstalled = enabled && hasApiKey ? await isCodexCliAvailable() : false;

  let message: string;
  if (!enabled) {
    message = CODEX_ERRORS.NOT_ENABLED;
  } else if (!hasApiKey) {
    message = CODEX_ERRORS.NO_API_KEY;
  } else if (!cliInstalled) {
    message = CODEX_ERRORS.CLI_NOT_FOUND;
  } else {
    message = "OpenAI Codex runner is ready";
  }

  return {
    type: "openai-codex",
    available: enabled && hasApiKey && cliInstalled,
    configured: enabled && hasApiKey && cliInstalled,
    featureFlagEnabled: enabled,
    apiKeySet: hasApiKey,
    cliInstalled,
    registered: enabled,
    message,
    stub: false,
  };
}
