/**
 * OpenAI Codex Agent - Real Implementation
 *
 * This module implements the OpenAI Codex agent using the OpenAI Responses API
 * with custom tools for shell/file operations.
 *
 * To enable:
 * 1. Set ENABLE_OPENAI_CODEX=true
 * 2. Set OPENAI_API_KEY=sk-your-key
 * 3. Optionally set OPENAI_MODEL (defaults to gpt-4o)
 */

import type { InjectMode } from "@devkit/gogo-shared";
import { execute, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import {
  emitLog,
  type LogState,
  updateJobStatus,
} from "../utils/job-logging.js";
import type {
  AgentCallbacks,
  AgentConfig,
  AgentJobContext,
  AgentSignal,
} from "./agents/types.js";
import {
  AGENT_COMMENT_MARKER,
  createIssueCommentForRepo,
} from "./github/index.js";
import { getOpenAIClient, type OpenAIMessage } from "./openai/index.js";
import { executeTool, getAllTools } from "./openai/tools.js";
import { registerProcess, unregisterProcess } from "./process-manager.js";
import {
  DEFAULT_MAX_RUNTIME_MS,
  getCodexSettings,
  hasOpenAIApiKey,
  isCodexEnabled,
} from "./settings-helper.js";

/**
 * Error messages for configuration issues
 */
export const CODEX_ERRORS = {
  NOT_ENABLED:
    "OpenAI Codex runner not enabled. Set ENABLE_OPENAI_CODEX=true to enable.",
  NO_API_KEY:
    "OPENAI_API_KEY environment variable is not set. Export your OpenAI API key to use Codex.",
} as const;

/**
 * Active run state
 */
interface ActiveRun {
  jobId: string;
  conversationHistory: OpenAIMessage[];
  abortController: AbortController;
  logState: LogState;
  startTime: number;
  timeoutId?: NodeJS.Timeout;
  repositoryId: string;
}

// Track active runs
const activeRuns = new Map<string, ActiveRun>();

/**
 * Save conversation for potential resume
 */
async function saveSession(
  jobId: string,
  sessionId: string,
  conversationHistory: OpenAIMessage[],
): Promise<void> {
  const conn = getConn();
  await execute(
    conn,
    "UPDATE jobs SET codex_session_id = ?, agent_session_data = ?, updated_at = ? WHERE id = ?",
    [
      sessionId,
      JSON.stringify({ conversationHistory }),
      new Date().toISOString(),
      jobId,
    ],
  );
}

/**
 * Check if Codex is available and return appropriate error if not
 */
export function getCodexAvailabilityError(): string | null {
  if (!isCodexEnabled()) {
    return CODEX_ERRORS.NOT_ENABLED;
  }
  if (!hasOpenAIApiKey()) {
    return CODEX_ERRORS.NO_API_KEY;
  }
  return null;
}

/**
 * Build the system prompt for the agent
 */
function buildSystemPrompt(
  context: AgentJobContext,
  testCommand: string,
): string {
  return `You are a coding agent working on GitHub issue #${context.issueNumber}.

Repository: ${context.repositoryOwner}/${context.repositoryName}
Branch: ${context.branch}
Working directory: ${context.worktreePath}

## Issue: ${context.issueTitle}
${context.issueBody || "No description provided."}

## Instructions
1. First, explore the codebase to understand the context
2. Make the necessary changes to address the issue
3. Run tests with \`${testCommand}\` to verify your changes work
4. Commit your changes with a descriptive message
5. When complete, call the signal_ready_to_pr tool
6. If you need clarification, call signal_needs_info with your question

## Important
- Do NOT open PRs directly - the orchestrator handles that
- Do NOT force push
- Do NOT merge PRs automatically
- Only modify files within your working directory
- If tests fail, fix them before signaling ready`;
}

/**
 * Start a Codex run for a job
 */
export async function startCodexRun(
  context: AgentJobContext,
  config: AgentConfig,
  callbacks: AgentCallbacks,
): Promise<{ success: boolean; error?: string }> {
  // Check if already running
  if (activeRuns.has(context.jobId)) {
    return {
      success: false,
      error: "Codex run already in progress for this job",
    };
  }

  // Get job
  const conn = getConn();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [
    context.jobId,
  ]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status !== "running") {
    return {
      success: false,
      error: `Job must be in 'running' state (current: ${job.status})`,
    };
  }

  if (!job.repository_id) {
    return { success: false, error: "Job does not have a repository ID" };
  }

  const repositoryId = job.repository_id;

  // Get settings
  const codexSettings = await getCodexSettings();
  const model = process.env.OPENAI_MODEL ?? codexSettings.model ?? "gpt-4o";
  // Ensure we always have a valid timeout - never run indefinitely
  const maxRuntimeMs =
    config.maxRuntimeMs ??
    codexSettings.max_runtime_ms ??
    DEFAULT_MAX_RUNTIME_MS;
  const testCommand =
    config.testCommand ?? codexSettings.test_command ?? "npm test";

  // Check parallel job limit
  if (activeRuns.size >= codexSettings.max_parallel_jobs) {
    return {
      success: false,
      error: `Max parallel jobs reached (${codexSettings.max_parallel_jobs})`,
    };
  }

  const logState: LogState = { sequence: 0 };
  const sessionId = `codex-${context.jobId}-${Date.now()}`;

  // Create the run
  const run: ActiveRun = {
    jobId: context.jobId,
    conversationHistory: [
      { role: "system", content: buildSystemPrompt(context, testCommand) },
    ],
    abortController: new AbortController(),
    logState,
    startTime: Date.now(),
    repositoryId,
  };

  activeRuns.set(context.jobId, run);

  // Notify session created
  await callbacks.onSessionCreated(sessionId);

  // Set timeout
  run.timeoutId = setTimeout(async () => {
    console.log(
      `[codex] Job ${context.jobId} timed out after ${maxRuntimeMs}ms`,
    );
    await stopCodexRun(context.jobId, true);
    await callbacks.onLog(
      "stderr",
      `Codex run timed out after ${maxRuntimeMs / 1000}s`,
    );
    await callbacks.onSignal({ type: "error", message: "Execution timeout" });
  }, maxRuntimeMs);

  // Register for process tracking (no PID for API-based agent, but needed for orchestrator restart handling)
  await registerProcess(context.jobId, process.pid);

  await callbacks.onLog(
    "system",
    `Starting OpenAI Codex run with model ${model}...`,
  );

  // Run the agent loop in background
  runAgentLoop(run, model, context, callbacks, sessionId).catch(
    async (error) => {
      await callbacks.onLog("stderr", `Agent loop error: ${error}`);
      await callbacks.onSignal({ type: "error", message: String(error) });
    },
  );

  return { success: true };
}

/**
 * The main agent loop - executes tool calls until done or signaled
 */
async function runAgentLoop(
  run: ActiveRun,
  model: string,
  context: AgentJobContext,
  callbacks: AgentCallbacks,
  sessionId: string,
): Promise<void> {
  const client = getOpenAIClient();
  const tools = getAllTools();

  try {
    while (!run.abortController.signal.aborted) {
      // Stream response from OpenAI
      const stream = client.chatStream({
        model,
        messages: run.conversationHistory,
        tools,
      });

      let assistantContent = "";
      const toolCalls: Array<{ id: string; name: string; arguments: string }> =
        [];

      for await (const event of stream) {
        if (run.abortController.signal.aborted) break;

        switch (event.type) {
          case "content_delta":
            if (event.delta) {
              assistantContent += event.delta;
              await callbacks.onLog("stdout", event.delta);
            }
            break;

          case "tool_call":
            if (event.toolCall) {
              toolCalls.push(event.toolCall);
            }
            break;

          case "error":
            await callbacks.onLog("stderr", `API Error: ${event.error}`);
            await callbacks.onSignal({
              type: "error",
              message: event.error ?? "Unknown error",
            });
            return;

          case "done":
            // Streaming complete
            break;
        }
      }

      // Add assistant message to history
      if (assistantContent || toolCalls.length > 0) {
        run.conversationHistory.push({
          role: "assistant",
          content: assistantContent,
        });
      }

      // No tool calls means agent is done thinking
      if (toolCalls.length === 0) {
        await callbacks.onLog(
          "system",
          "Agent completed without signaling - saving session",
        );
        await saveSession(context.jobId, sessionId, run.conversationHistory);
        return;
      }

      // Execute tool calls
      for (const call of toolCalls) {
        await callbacks.onLog("system", `Executing tool: ${call.name}`);

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          args = {};
        }

        const result = await executeTool(call.name, args, {
          cwd: context.worktreePath,
          jobId: context.jobId,
        });

        // Log tool result (truncated for readability)
        const truncatedResult =
          result.result.length > 500
            ? `${result.result.slice(0, 500)}\n... (truncated)`
            : result.result;
        await callbacks.onLog(
          "system",
          `Tool ${call.name} result:\n${truncatedResult}`,
        );

        // Check for signals
        if (result.signal) {
          await handleSignal(result.signal, run, context, callbacks, sessionId);

          if (
            result.signal.type === "ready_to_pr" ||
            result.signal.type === "needs_info"
          ) {
            return; // Agent is done or blocked
          }
        }

        // Add tool result to conversation
        run.conversationHistory.push({
          role: "user",
          content: `Tool result for ${call.name}: ${result.result}`,
        });
      }
    }
  } finally {
    // Cleanup
    if (run.timeoutId) clearTimeout(run.timeoutId);
    activeRuns.delete(context.jobId);
    await unregisterProcess(context.jobId);
  }
}

/**
 * Handle a signal from the agent
 */
async function handleSignal(
  signal: AgentSignal,
  run: ActiveRun,
  context: AgentJobContext,
  callbacks: AgentCallbacks,
  sessionId: string,
): Promise<void> {
  await callbacks.onSignal(signal);

  switch (signal.type) {
    case "ready_to_pr":
      await callbacks.onLog("system", "Agent signaled READY_TO_PR");
      await saveSession(context.jobId, sessionId, run.conversationHistory);
      await updateJobStatus(
        context.jobId,
        "ready_to_pr",
        "running",
        "Agent completed work",
        { codex_session_id: sessionId },
      );
      run.abortController.abort();
      break;

    case "needs_info":
      await callbacks.onLog("system", `Agent needs info: ${signal.question}`);
      try {
        const commentBody = `${AGENT_COMMENT_MARKER}\n**Agent Question:**\n\n${signal.question}`;
        const { id: commentId } = await createIssueCommentForRepo(
          run.repositoryId,
          context.issueNumber,
          commentBody,
        );
        await saveSession(context.jobId, sessionId, run.conversationHistory);
        await updateJobStatus(
          context.jobId,
          "needs_info",
          "running",
          signal.question,
          {
            codex_session_id: sessionId,
            needs_info_question: signal.question,
            needs_info_comment_id: commentId,
            last_checked_comment_id: commentId,
          },
        );
        run.abortController.abort();
      } catch (error) {
        const err = error as Error;
        await callbacks.onLog(
          "stderr",
          `Failed to post question to GitHub: ${err.message}`,
        );
      }
      break;

    case "error":
      await callbacks.onLog("stderr", `Agent error: ${signal.message}`);
      await updateJobStatus(
        context.jobId,
        "failed",
        "running",
        signal.message,
        {
          failure_reason: signal.message,
          codex_session_id: sessionId,
        },
      );
      run.abortController.abort();
      break;
  }
}

/**
 * Stop a running Codex process
 */
/**
 * Stop a running Codex process
 * @param saveSessionFlag - Default true to preserve conversation history for resume
 */
export async function stopCodexRun(
  jobId: string,
  saveSessionFlag = true,
): Promise<boolean> {
  const run = activeRuns.get(jobId);
  if (!run) return false;

  // Clear timeout
  if (run.timeoutId) {
    clearTimeout(run.timeoutId);
  }

  // Save session if requested
  if (saveSessionFlag) {
    const sessionId = `codex-${jobId}-${run.startTime}`;
    await saveSession(jobId, sessionId, run.conversationHistory);
  }

  // Abort the run
  run.abortController.abort();

  // Cleanup
  activeRuns.delete(jobId);
  await unregisterProcess(jobId);

  return true;
}

/**
 * Pause a Codex run (saves session for later resume)
 */
export async function pauseCodexRun(jobId: string): Promise<boolean> {
  const run = activeRuns.get(jobId);
  if (!run) return false;

  await emitLog(jobId, "system", "Pausing Codex run...", run.logState);
  await stopCodexRun(jobId, true);

  return true;
}

/**
 * Resume a paused Codex run
 */
export async function resumeCodexRun(
  context: AgentJobContext,
  config: AgentConfig,
  callbacks: AgentCallbacks,
  injectedMessage?: string,
): Promise<{ success: boolean; error?: string }> {
  // Get job to restore conversation history
  const conn = getConn();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [
    context.jobId,
  ]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  // Restore conversation history
  const sessionData = (
    job.agent_session_data ? JSON.parse(job.agent_session_data) : null
  ) as {
    conversationHistory?: OpenAIMessage[];
  } | null;
  const conversationHistory = sessionData?.conversationHistory;

  if (!conversationHistory || conversationHistory.length === 0) {
    // No previous session - start fresh
    return startCodexRun(context, config, callbacks);
  }

  // Check if already running
  if (activeRuns.has(context.jobId)) {
    return {
      success: false,
      error: "Codex run already in progress for this job",
    };
  }

  if (!job.repository_id) {
    return { success: false, error: "Job does not have a repository ID" };
  }

  const repositoryId = job.repository_id;

  // Get settings
  const codexSettings = await getCodexSettings();
  const model = process.env.OPENAI_MODEL ?? codexSettings.model ?? "gpt-4o";
  // Ensure we always have a valid timeout - never run indefinitely
  const maxRuntimeMs =
    config.maxRuntimeMs ??
    codexSettings.max_runtime_ms ??
    DEFAULT_MAX_RUNTIME_MS;

  const logState: LogState = { sequence: 0 };
  const sessionId =
    job.codex_session_id ?? `codex-${context.jobId}-${Date.now()}`;

  // Create the run with restored history
  const run: ActiveRun = {
    jobId: context.jobId,
    conversationHistory: [...conversationHistory],
    abortController: new AbortController(),
    logState,
    startTime: Date.now(),
    repositoryId,
  };

  // Add the injected message if provided
  const resumeMessage = injectedMessage || "Continue from where you left off.";
  run.conversationHistory.push({ role: "user", content: resumeMessage });

  activeRuns.set(context.jobId, run);

  // Notify session created
  await callbacks.onSessionCreated(sessionId);

  // Set timeout
  run.timeoutId = setTimeout(async () => {
    console.log(
      `[codex] Job ${context.jobId} timed out after ${maxRuntimeMs}ms`,
    );
    await stopCodexRun(context.jobId, true);
    await callbacks.onLog(
      "stderr",
      `Codex run timed out after ${maxRuntimeMs / 1000}s`,
    );
    await callbacks.onSignal({ type: "error", message: "Execution timeout" });
  }, maxRuntimeMs);

  await registerProcess(context.jobId, process.pid);

  await callbacks.onLog(
    "system",
    `Resuming Codex run with message: ${resumeMessage}`,
  );

  // Run the agent loop in background
  runAgentLoop(run, model, context, callbacks, sessionId).catch(
    async (error) => {
      await callbacks.onLog("stderr", `Agent loop error: ${error}`);
      await callbacks.onSignal({ type: "error", message: String(error) });
    },
  );

  return { success: true };
}

/**
 * Inject a message into a running or paused job
 */
export async function injectCodexMessage(
  jobId: string,
  message: string,
  mode: InjectMode,
): Promise<{ success: boolean; error?: string }> {
  const conn = getConn();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [
    jobId,
  ]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (mode === "immediate") {
    // If running, inject into active run
    const run = activeRuns.get(jobId);
    if (run) {
      run.conversationHistory.push({ role: "user", content: message });
      await emitLog(
        jobId,
        "system",
        `Injected message: ${message}`,
        run.logState,
      );
      return { success: true };
    }

    // Not running - store as pending
    await execute(
      conn,
      "UPDATE jobs SET pending_injection = ?, updated_at = ? WHERE id = ?",
      [message, new Date().toISOString(), jobId],
    );

    return { success: true };
  }

  // Queued mode - store for next break
  await execute(
    conn,
    "UPDATE jobs SET pending_injection = ?, updated_at = ? WHERE id = ?",
    [message, new Date().toISOString(), jobId],
  );

  return { success: true };
}

/**
 * Check if a job has an active Codex run
 */
export function isRunning(jobId: string): boolean {
  return activeRuns.has(jobId);
}

/**
 * Get count of active Codex runs
 */
export function getActiveRunCount(): number {
  return activeRuns.size;
}
