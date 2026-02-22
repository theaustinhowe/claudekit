import type { InjectMode } from "@claudekit/gogo-shared";
import {
  CLAUDE_ERRORS,
  getActiveRunCount,
  getClaudeAvailabilityError,
  injectMessage as injectClaudeMessage,
  isClaudeCliAvailable,
  isRunning,
  resumeClaudeRun,
  startClaudeRun,
  stopClaudeRun,
} from "../claude-code-agent.js";
import { getClaudeSettings } from "../settings-helper.js";
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
 * Claude Code agent runner implementation
 *
 * This wraps the existing claude-code-agent.ts functionality
 * to conform to the AgentRunner interface.
 */
export const claudeCodeRunner: AgentRunner = {
  type: "claude-code",
  displayName: "Claude Code",

  capabilities: {
    canResume: true,
    canInject: true,
    supportsStreaming: true,
  } as AgentCapabilities,

  async start(context: AgentJobContext, _config: AgentConfig, _callbacks: AgentCallbacks): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = await getClaudeAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    // The existing startClaudeRun expects the job to already be in the database
    // and in 'running' state. It uses the jobId to look up all context.
    // The callbacks are handled internally via the existing emitLog and signal detection.
    return startClaudeRun(context.jobId);
  },

  async resume(
    context: AgentJobContext,
    _session: AgentSession,
    _config: AgentConfig,
    _callbacks: AgentCallbacks,
    message?: string,
  ): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = await getClaudeAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    // The existing resumeClaudeRun handles session restoration internally
    return resumeClaudeRun(context.jobId, message);
  },

  async inject(jobId: string, message: string, mode: InjectMode): Promise<AgentStartResult> {
    // Check availability first
    const availabilityError = await getClaudeAvailabilityError();
    if (availabilityError) {
      return { success: false, error: availabilityError };
    }

    return injectClaudeMessage(jobId, message, mode);
  },

  async stop(jobId: string, saveSession = false): Promise<boolean> {
    return stopClaudeRun(jobId, saveSession);
  },

  isRunning(jobId: string): boolean {
    return isRunning(jobId);
  },

  getActiveRunCount(): number {
    return getActiveRunCount();
  },
};

/**
 * Get the status of the Claude Code runner
 * Used by the /agents/:type/status API endpoint
 */
export async function getClaudeRunnerStatus(): Promise<{
  type: string;
  available: boolean;
  configured: boolean;
  cliInstalled: boolean;
  settingsEnabled: boolean;
  registered: boolean;
  message: string;
  stub: boolean;
}> {
  const settings = await getClaudeSettings();
  const cliInstalled = await isClaudeCliAvailable();

  let message: string;
  if (!settings.enabled) {
    message = CLAUDE_ERRORS.DISABLED;
  } else if (!cliInstalled) {
    message = CLAUDE_ERRORS.CLI_NOT_FOUND;
  } else {
    message = "Claude Code is ready";
  }

  return {
    type: "claude-code",
    available: settings.enabled && cliInstalled,
    configured: settings.enabled && cliInstalled,
    cliInstalled,
    settingsEnabled: settings.enabled,
    registered: true,
    message,
    stub: false,
  };
}
