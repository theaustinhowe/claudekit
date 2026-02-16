import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { JobStatus, LogStream } from "@devkit/gogo-shared";
import { execute, queryOne, withTransaction } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { emitLog, type LogState } from "../utils/job-logging.js";
import { broadcast } from "../ws/handler.js";
import { agentRegistry } from "./agents/index.js";
import type { AgentCallbacks, AgentConfig, AgentJobContext, AgentSignal, AgentStartResult } from "./agents/types.js";
import { AGENT_COMMENT_MARKER, createIssueCommentForRepo, getRepoConfigById } from "./github/index.js";
import { emitHealthEvent } from "./health-events.js";
import { getClaudeSettings, getCodexSettings } from "./settings-helper.js";
import { applyAction, applyTransitionAtomic } from "./state-machine.js";

/**
 * Track executor-level timeouts per job.
 * This is a safety net that enforces maxRuntimeMs even if the agent's
 * own timeout mechanism fails or is missing.
 */
const executorTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Set up an executor-level timeout for a job.
 * If the job is still RUNNING after maxRuntimeMs, transition to PAUSED.
 */
async function setupExecutorTimeout(jobId: string, agentType: string): Promise<void> {
  // Clear any existing timeout
  clearExecutorTimeout(jobId);

  // Get the configured max runtime for this agent type
  let maxRuntimeMs: number;
  if (agentType === "openai-codex") {
    const settings = await getCodexSettings();
    maxRuntimeMs = settings.max_runtime_ms;
  } else {
    const settings = await getClaudeSettings();
    maxRuntimeMs = settings.max_runtime_ms;
  }

  // Add 10% buffer over the agent's own timeout to let it handle timeout gracefully first
  const executorTimeoutMs = Math.round(maxRuntimeMs * 1.1);

  const timeoutId = setTimeout(async () => {
    executorTimeouts.delete(jobId);

    // Check if job is still running (agent's own timeout may have handled it)
    const conn = getConn();
    const job = await queryOne<{ status: string }>(conn, "SELECT status FROM jobs WHERE id = ?", [jobId]);
    if (!job || job.status !== "running") return;

    console.log(`[agent-executor] Executor timeout reached for job ${jobId} after ${executorTimeoutMs}ms`);

    const result = await applyTransitionAtomic(jobId, "paused", "Agent timed out (executor safety net)", {
      pause_reason: "Agent timed out - session preserved for resume",
    });

    if (result.success) {
      emitHealthEvent("agent_stopped", `Agent timed out for job ${jobId}`, {
        jobId,
        agentType,
        reason: "executor_timeout",
        timeoutMs: executorTimeoutMs,
      });
    }
  }, executorTimeoutMs);

  executorTimeouts.set(jobId, timeoutId);
}

/**
 * Clear the executor-level timeout for a job
 */
export function clearExecutorTimeout(jobId: string): void {
  const existing = executorTimeouts.get(jobId);
  if (existing) {
    clearTimeout(existing);
    executorTimeouts.delete(jobId);
  }
}

interface SessionValidationResult {
  valid: boolean;
  error?: string;
  canStartFresh?: boolean;
}

/**
 * Validate a Claude Code session exists and is usable
 * Claude stores sessions in ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 */
function validateClaudeSession(sessionId: string, worktreePath: string): SessionValidationResult {
  try {
    // Claude encodes the path by replacing / with - and prefixing with -
    const encodedPath = worktreePath.replace(/\//g, "-");
    const claudeDir = join(homedir(), ".claude", "projects", encodedPath);
    const sessionFile = join(claudeDir, `${sessionId}.jsonl`);

    if (!existsSync(sessionFile)) {
      return {
        valid: false,
        error: `Claude session file not found: ${sessionFile}`,
        canStartFresh: true,
      };
    }

    return { valid: true };
  } catch (error) {
    const err = error as Error;
    return {
      valid: false,
      error: `Failed to validate Claude session: ${err.message}`,
      canStartFresh: true,
    };
  }
}

/**
 * Validate an OpenAI Codex session exists in the database
 */
function validateCodexSession(agentSessionData: unknown): SessionValidationResult {
  if (!agentSessionData) {
    return {
      valid: false,
      error: "No session data stored for Codex agent",
      canStartFresh: true,
    };
  }

  const sessionData = agentSessionData as {
    conversationHistory?: unknown[];
  };

  if (
    !sessionData.conversationHistory ||
    !Array.isArray(sessionData.conversationHistory) ||
    sessionData.conversationHistory.length === 0
  ) {
    return {
      valid: false,
      error: "Codex session has no conversation history to resume from",
      canStartFresh: true,
    };
  }

  return { valid: true };
}

/**
 * Validate session before attempting resume
 * Returns validation result with error details if invalid
 */
export function validateSession(
  agentType: string,
  sessionId: string | null,
  worktreePath: string | null,
  agentSessionData: unknown,
): SessionValidationResult {
  if (!sessionId) {
    return {
      valid: false,
      error: "No session ID available",
      canStartFresh: true,
    };
  }

  switch (agentType) {
    case "claude-code":
      if (!worktreePath) {
        return {
          valid: false,
          error: "No worktree path for Claude session validation",
          canStartFresh: false,
        };
      }
      return validateClaudeSession(sessionId, worktreePath);

    case "openai-codex":
      return validateCodexSession(agentSessionData);

    default:
      // Unknown agent type - assume session is valid if ID exists
      return { valid: true };
  }
}

/**
 * Create callbacks for agent events
 */
function createAgentCallbacks(
  jobId: string,
  repositoryId: string,
  issueNumber: number,
  logState: LogState,
): AgentCallbacks {
  return {
    onLog: async (stream: LogStream, content: string) => {
      await emitLog(jobId, stream, content, logState);
    },

    onSignal: async (signal: AgentSignal) => {
      // Clear executor timeout when job transitions out of RUNNING
      clearExecutorTimeout(jobId);

      switch (signal.type) {
        case "ready_to_pr":
          await emitLog(jobId, "system", "Agent signaled READY_TO_PR", logState);
          await applyTransitionAtomic(jobId, "ready_to_pr", "Agent completed work");
          emitHealthEvent("agent_stopped", `Agent completed work for job ${jobId}`, {
            jobId,
            reason: "ready_to_pr",
          });
          break;

        case "needs_info":
          await emitLog(jobId, "system", `Agent needs info: ${signal.question}`, logState);
          // For manual jobs (negative issue number), skip GitHub comment
          if (issueNumber < 0) {
            await applyTransitionAtomic(jobId, "needs_info", signal.question, {
              needs_info_question: signal.question,
            });
          } else {
            try {
              const commentBody = `${AGENT_COMMENT_MARKER}\n**Agent Question:**\n\n${signal.question}`;
              const { id: commentId } = await createIssueCommentForRepo(repositoryId, issueNumber, commentBody);
              await applyTransitionAtomic(jobId, "needs_info", signal.question, {
                needs_info_question: signal.question,
                needs_info_comment_id: commentId,
                last_checked_comment_id: commentId,
              });
            } catch (error) {
              const err = error as Error;
              await emitLog(jobId, "stderr", `Failed to post question to GitHub: ${err.message}`, logState);
            }
          }
          break;

        case "error":
          await emitLog(jobId, "stderr", `Agent error: ${signal.message}`, logState);
          await applyTransitionAtomic(jobId, "failed", signal.message, {
            failure_reason: signal.message,
          });
          emitHealthEvent("agent_stopped", `Agent error for job ${jobId}: ${signal.message}`, {
            jobId,
            reason: "error",
          });
          break;

        case "completed":
          await emitLog(jobId, "system", signal.summary || "Agent completed", logState);
          emitHealthEvent("agent_stopped", `Agent completed for job ${jobId}`, {
            jobId,
            reason: "completed",
          });
          break;
      }
    },

    onSessionCreated: async (sessionId: string) => {
      const conn = getConn();
      await execute(conn, "UPDATE jobs SET claude_session_id = ?, updated_at = ? WHERE id = ?", [
        sessionId,
        new Date().toISOString(),
        jobId,
      ]);
      await emitLog(jobId, "system", `Session ID: ${sessionId}`, logState);
    },

    onPhaseChange: async (phase: string, progress?: number) => {
      const conn = getConn();
      await execute(conn, "UPDATE jobs SET phase = ?, progress = ?, updated_at = ? WHERE id = ?", [
        phase,
        progress ?? null,
        new Date().toISOString(),
        jobId,
      ]);

      // Broadcast updated job
      const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
      if (updated) {
        broadcast({ type: "job:updated", payload: updated });
      }
    },
  };
}

/**
 * Start an agent for a job
 */
export async function startAgent(jobId: string, agentType?: string): Promise<AgentStartResult> {
  const conn = getConn();

  // Get the job
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status !== "running" && job.status !== "planning") {
    return {
      success: false,
      error: `Job must be in 'running' or 'planning' state (current: ${job.status})`,
    };
  }

  if (!job.worktree_path || !job.branch) {
    return {
      success: false,
      error: "Job does not have a worktree path or branch set",
    };
  }

  if (!job.repository_id) {
    return {
      success: false,
      error: "Job does not have a repository ID",
    };
  }

  // Get repository config for multi-repo support
  const repoConfig = await getRepoConfigById(job.repository_id);

  // Get the agent runner
  const runner = agentType ? agentRegistry.get(agentType) : agentRegistry.getAll()[0]; // Use first registered agent as default

  if (!runner) {
    return {
      success: false,
      error: agentType ? `Unknown agent type: ${agentType}` : "No agents configured",
    };
  }

  // Build context
  const context: AgentJobContext = {
    jobId: job.id,
    issueNumber: job.issue_number,
    issueTitle: job.issue_title,
    issueBody: job.issue_body,
    worktreePath: job.worktree_path,
    branch: job.branch,
    repositoryOwner: repoConfig.owner,
    repositoryName: repoConfig.name,
  };

  // Build config (can be extended with settings lookup)
  const config: AgentConfig = {};

  // Create callbacks
  const logState: LogState = { sequence: 0 };
  const callbacks = createAgentCallbacks(job.id, job.repository_id, job.issue_number, logState);

  // Start the agent
  await emitLog(job.id, "system", `Starting ${runner.displayName} agent...`, logState);

  const effectiveAgentType = agentType || runner.type;
  const result = await runner.start(context, config, callbacks);

  if (result.success) {
    await setupExecutorTimeout(jobId, effectiveAgentType);
    emitHealthEvent("agent_started", `Started ${runner.displayName} for job ${jobId}`, {
      jobId,
      agentType: effectiveAgentType,
    });
  }

  return result;
}

/**
 * Resume an agent for a paused or needs_info job
 *
 * This function performs an atomic state transition from PAUSED/NEEDS_INFO to RUNNING
 * and starts the agent. It is idempotent - if the agent is already running, it returns
 * success without spawning a duplicate.
 */
export async function resumeAgent(jobId: string, message?: string, agentType?: string): Promise<AgentStartResult> {
  // Determine agent type from parameter or job's agent type, or default
  const type = agentType || "claude-code";
  const runner = agentRegistry.get(type);

  if (!runner) {
    return { success: false, error: `Unknown agent type: ${type}` };
  }

  // Idempotency check: if agent is already running, return success
  if (runner.isRunning(jobId)) {
    return { success: true }; // Already running, no action needed
  }

  const conn = getConn();

  // Get the job and validate state
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  // Validate job is in a resumable state
  const currentStatus = job.status as JobStatus;
  if (currentStatus !== "paused" && currentStatus !== "needs_info") {
    return {
      success: false,
      error: `Can only resume from paused or needs_info state (current: ${currentStatus})`,
    };
  }

  // Determine the actual session ID based on agent type
  const sessionId = type === "openai-codex" ? job.codex_session_id : job.claude_session_id;

  if (!sessionId) {
    return { success: false, error: "No session ID to resume from" };
  }

  if (!runner.capabilities.canResume || !runner.resume) {
    return {
      success: false,
      error: `Agent ${runner.displayName} does not support resume`,
    };
  }

  if (!job.worktree_path || !job.branch) {
    return { success: false, error: "Job is missing worktree path or branch" };
  }

  if (!job.repository_id) {
    return { success: false, error: "Job does not have a repository ID" };
  }

  // Validate session before attempting resume
  const agentSessionData = job.agent_session_data
    ? (() => {
        try {
          return JSON.parse(job.agent_session_data);
        } catch {
          return null;
        }
      })()
    : null;

  const sessionValidation = validateSession(type, sessionId, job.worktree_path, agentSessionData);

  if (!sessionValidation.valid) {
    const errorMessage = sessionValidation.error || "Session validation failed";

    if (sessionValidation.canStartFresh) {
      // Session is stale but we can start fresh - clear session and continue
      console.log(`[agent-executor] Session validation failed for job ${jobId}: ${errorMessage}. Will start fresh.`);

      // Clear the stale session ID
      const clearNow = new Date().toISOString();
      const clearClaudeSession = type === "claude-code" ? null : job.claude_session_id;
      const clearCodexSession = type === "openai-codex" ? null : job.codex_session_id;
      const clearSessionData = type === "openai-codex" ? null : job.agent_session_data;
      await execute(
        conn,
        "UPDATE jobs SET claude_session_id = ?, codex_session_id = ?, agent_session_data = ?, updated_at = ? WHERE id = ?",
        [clearClaudeSession, clearCodexSession, clearSessionData, clearNow, jobId],
      );

      // Return error with explanation - caller can decide to start fresh
      return {
        success: false,
        error: `${errorMessage}. Session has been cleared - you can retry to start fresh.`,
      };
    }

    return { success: false, error: errorMessage };
  }

  // Get repository config for multi-repo support
  const repoConfig = await getRepoConfigById(job.repository_id);

  // Apply atomic state transition using state machine
  const actionResult = applyAction(currentStatus, "resume_with_agent", {
    message: message || "Resume requested by user",
  });

  if (actionResult.error) {
    return { success: false, error: actionResult.error };
  }

  // Perform the state transition atomically in a transaction
  const transitionResult = await withTransaction(conn, async (conn) => {
    // Re-check job state within transaction (optimistic locking pattern)
    const currentJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
    if (!currentJob) {
      return { success: false, error: "Job not found" };
    }

    // Verify state hasn't changed
    if (currentJob.status !== currentStatus) {
      return {
        success: false,
        error: `Job state changed during resume (now: ${currentJob.status})`,
      };
    }

    // Update job status to running
    const transNow = new Date().toISOString();
    await execute(
      conn,
      "UPDATE jobs SET status = ?, pause_reason = NULL, needs_info_question = NULL, updated_at = ? WHERE id = ?",
      ["running", transNow, jobId],
    );

    // Record the resume event with message and metadata
    const eventMetadata = JSON.stringify({
      action: "resume_with_agent",
      initiator: "user",
      agentType: type,
      ...(message ? { userMessage: message } : {}),
    });
    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?)",
      [jobId, "user_action", currentStatus, "running", message || "Resume requested by user", eventMetadata, transNow],
    );

    const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    return { success: true, job: updated };
  });

  if (!transitionResult.success) {
    return { success: false, error: transitionResult.error };
  }

  // Broadcast the job update
  if (transitionResult.job) {
    broadcast({ type: "job:updated", payload: transitionResult.job });
  }

  // Now start the agent
  const context: AgentJobContext = {
    jobId: job.id,
    issueNumber: job.issue_number,
    issueTitle: job.issue_title,
    issueBody: job.issue_body,
    worktreePath: job.worktree_path,
    branch: job.branch,
    repositoryOwner: repoConfig.owner,
    repositoryName: repoConfig.name,
  };

  const session = {
    sessionId, // Use the validated sessionId (either claude or codex)
    agentType: type,
  };

  const config: AgentConfig = {};
  const logState: LogState = { sequence: 0 };
  const callbacks = createAgentCallbacks(job.id, job.repository_id, job.issue_number, logState);

  await emitLog(
    job.id,
    "system",
    message
      ? `Resuming ${runner.displayName} agent with message: ${message}`
      : `Resuming ${runner.displayName} agent...`,
    logState,
  );

  const startResult = await runner.resume(context, session, config, callbacks, message);

  if (startResult.success) {
    await setupExecutorTimeout(jobId, type);
    emitHealthEvent("agent_started", `Resumed ${runner.displayName} for job ${jobId}`, {
      jobId,
      agentType: type,
      resumed: true,
    });
  } else {
    // If agent start failed, log the error
    // Leave in running state - the user can retry or pause manually
    await emitLog(job.id, "stderr", `Failed to start agent: ${startResult.error}`, logState);
  }

  return startResult;
}

/**
 * List available agents
 */
export function listAgents() {
  return agentRegistry.getAll().map((agent) => ({
    type: agent.type,
    displayName: agent.displayName,
    capabilities: agent.capabilities,
  }));
}
