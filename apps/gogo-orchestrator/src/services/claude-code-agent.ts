import { randomUUID } from "node:crypto";
import type { ClaudeStreamEvent } from "@claudekit/claude-runner";
import { isClaudeCliAvailable as checkClaudeCli, spawnClaude } from "@claudekit/claude-runner";
import { execute, queryOne } from "@claudekit/duckdb";
import type { InjectMode, JobStatus } from "@claudekit/gogo-shared";
import type { SessionRunner } from "@claudekit/session";
import { getDb } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { emitLog, type LogState, updateJobStatus } from "../utils/job-logging.js";
import { createServiceLogger } from "../utils/logger.js";
import { broadcast } from "../ws/handler.js";
import { AGENT_COMMENT_MARKER, createIssueCommentForRepo, getRepoConfigById } from "./github/index.js";
import {
  cancelSession,
  createSessionRecord,
  getActiveSessionCount,
  getLiveSession,
  safeTerminateProcess,
  setCleanupFn,
  setSessionPid,
  startSession,
  trackSession,
  untrackSession,
} from "./session-bridge.js";
import { type ClaudeCodeSettings, getClaudeSettings } from "./settings-helper.js";

const log = createServiceLogger("claude-code-agent");

/**
 * Error messages for configuration issues
 */
export const CLAUDE_ERRORS = {
  CLI_NOT_FOUND: "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code",
  DISABLED: "Claude Code is disabled in settings. Enable it in the Settings page.",
} as const;

/**
 * Check if the Claude CLI is available on the system
 */
export async function isClaudeCliAvailable(): Promise<boolean> {
  return checkClaudeCli();
}

/**
 * Check if Claude Code is available and return appropriate error if not
 */
export async function getClaudeAvailabilityError(): Promise<string | null> {
  const settings = await getClaudeSettings();
  if (!settings.enabled) {
    return CLAUDE_ERRORS.DISABLED;
  }
  if (!(await isClaudeCliAvailable())) {
    return CLAUDE_ERRORS.CLI_NOT_FOUND;
  }
  return null;
}

/**
 * Build the structured prompt for Claude Code
 *
 * @param phase - "implementing" (default), "planning" (create plan only), or "implementing_with_plan" (follow approved plan)
 * @param approvedPlan - The approved plan to follow (when phase is "implementing_with_plan")
 * @param feedback - Feedback from human to incorporate when revising a plan
 */
export function buildPrompt(
  job: {
    issueNumber: number;
    issueTitle: string;
    issueBody: string | null;
    worktreePath: string | null;
    branch: string | null;
    source?: string;
  },
  workspaceSettings: {
    owner: string;
    name: string;
  },
  claudeSettings: ClaudeCodeSettings,
  options?: {
    phase?: "implementing" | "planning" | "implementing_with_plan";
    approvedPlan?: string;
    feedback?: string;
  },
): string {
  const testCommand = claudeSettings.test_command || "npm test";
  const isManual = job.source === "manual" || job.issueNumber < 0;
  const phase = options?.phase || "implementing";

  const header = isManual ? `## Task: ${job.issueTitle}` : `## Issue #${job.issueNumber}: ${job.issueTitle}`;

  const repoContext = `## Repository Context
- Owner: ${workspaceSettings.owner}
- Repository: ${workspaceSettings.name}
- Working Directory: ${job.worktreePath}
- Branch: ${job.branch}`;

  // Planning phase - analyze and create plan only
  if (phase === "planning") {
    const feedbackSection = options?.feedback
      ? `\n## Previous Plan Feedback\nThe human reviewer provided the following feedback on your previous plan. Please revise accordingly:\n\n${options.feedback}\n`
      : "";

    return `# Planning Phase

${header}

${job.issueBody || "No description provided."}

${repoContext}
${feedbackSection}
## Instructions
You are in the PLANNING phase. Your job is to:
1. Analyze the codebase and understand the requirements
2. Create a detailed implementation plan
3. Output "PLAN:" followed by your plan in markdown format

## Constraints
- Do NOT implement any code changes
- Do NOT create or modify any files
- Do NOT run tests
- Do NOT output "READY_TO_PR" or "NEEDS_INFO"
- ONLY analyze and create a plan
- Output "NEEDS_INFO: <question>" ONLY if you absolutely cannot create a plan without more information

## Output Format
When your plan is ready, output exactly:
PLAN:
<your detailed markdown plan here>

The plan should include:
- Summary of changes needed
- List of files to create/modify
- Implementation approach for each change
- Any risks or considerations
- Suggested testing approach
`;
  }

  // Implementing with an approved plan
  if (phase === "implementing_with_plan" && options?.approvedPlan) {
    const blockedConstraint = isManual
      ? "3. If blocked, stop and ask"
      : "3. If blocked, stop and ask - question will be posted to GitHub issue";

    return `# Task Assignment (Approved Plan)

${header}

${job.issueBody || "No description provided."}

${repoContext}

## Approved Implementation Plan
The following plan has been reviewed and approved by a human. Follow it closely:

${options.approvedPlan}

## Constraints
1. Run tests: \`${testCommand}\` before considering work complete
2. Do NOT create PR until all tests pass
${blockedConstraint}
4. Never force push
5. Do not merge PRs automatically
6. Only modify files within the worktree
7. Follow the approved plan above

## Instructions
1. Implement the solution following the approved plan
2. Run tests, fix failures
3. Output "READY_TO_PR" when ready
4. Output "NEEDS_INFO: <question>" if blocked
`;
  }

  // Default: standard implementation (no planning)
  const blockedConstraint = isManual
    ? "3. If blocked, stop and ask"
    : "3. If blocked, stop and ask - question will be posted to GitHub issue";

  return `# Task Assignment

${header}

${job.issueBody || "No description provided."}

${repoContext}

## Constraints
1. Run tests: \`${testCommand}\` before considering work complete
2. Do NOT create PR until all tests pass
${blockedConstraint}
4. Never force push
5. Do not merge PRs automatically
6. Only modify files within the worktree

## Instructions
1. Analyze requirements
2. Implement solution
3. Run tests, fix failures
4. Output "READY_TO_PR" when ready
5. Output "NEEDS_INFO: <question>" if blocked
`;
}

type ParsedLine = {
  type: "text" | "tool" | "error" | "session" | "signal" | "unknown";
  content?: string;
  sessionId?: string;
  signal?: "READY_TO_PR" | "NEEDS_INFO" | "PLAN";
  question?: string;
  planContent?: string;
};

/**
 * Check text for agent signals (READY_TO_PR, NEEDS_INFO, PLAN).
 * Returns a signal result if found, or null.
 */
export function detectSignal(text: string): ParsedLine | null {
  if (text.includes("READY_TO_PR")) {
    return { type: "signal", signal: "READY_TO_PR", content: text };
  }

  const needsInfoMatch = text.match(/NEEDS_INFO:\s*(.+)/s);
  if (needsInfoMatch) {
    return {
      type: "signal",
      signal: "NEEDS_INFO",
      question: needsInfoMatch[1].trim(),
      content: text,
    };
  }

  const planMatch = text.match(/PLAN:\s*([\s\S]*)/);
  if (planMatch) {
    return {
      type: "signal",
      signal: "PLAN",
      planContent: planMatch[1].trim(),
      content: text,
    };
  }

  return null;
}

/**
 * Detect the current agent phase from parsed output.
 * Returns null if phase cannot be determined from this line.
 */
export function detectPhase(parsed: ParsedLine): { phase: string; progress?: number } | null {
  if (parsed.type === "tool") {
    const toolName = parsed.content?.replace("Tool: ", "").toLowerCase() || "";
    // Read/search tools indicate analysis phase
    if (
      toolName.includes("read") ||
      toolName.includes("search") ||
      toolName.includes("glob") ||
      toolName.includes("grep") ||
      toolName.includes("list")
    ) {
      return { phase: "analysis", progress: 25 };
    }
    // Write/edit tools indicate implementation phase
    if (
      toolName.includes("write") ||
      toolName.includes("edit") ||
      toolName.includes("create") ||
      toolName.includes("patch")
    ) {
      return { phase: "implementation", progress: 50 };
    }
    // Bash with test commands indicates testing phase
    if (toolName.includes("bash") || toolName.includes("execute") || toolName.includes("run")) {
      return { phase: "testing", progress: 75 };
    }
  }
  if (parsed.type === "text" && parsed.content) {
    const lower = parsed.content.toLowerCase();
    if (lower.includes("analyzing") || lower.includes("exploring") || lower.includes("reading")) {
      return { phase: "analysis", progress: 25 };
    }
    if (lower.includes("implementing") || lower.includes("writing") || lower.includes("editing")) {
      return { phase: "implementation", progress: 50 };
    }
    if (lower.includes("running tests") || lower.includes("testing") || lower.includes("linting")) {
      return { phase: "testing", progress: 75 };
    }
  }
  if (parsed.type === "signal" && parsed.signal === "READY_TO_PR") {
    return { phase: "complete", progress: 100 };
  }
  return null;
}

/**
 * Parse a line of stream-json output from Claude CLI
 */
export function parseStreamJsonLine(line: string): ParsedLine {
  if (!line.trim()) {
    return { type: "unknown" };
  }

  try {
    const msg: ClaudeStreamEvent = JSON.parse(line);

    // Handle different message types
    if (msg.type === "error") {
      return {
        type: "error",
        content: msg.error?.message || "Unknown error",
      };
    }

    if (msg.type === "result" && msg.result?.session_id) {
      return {
        type: "session",
        sessionId: msg.result.session_id,
      };
    }

    // Handle content block delta (streaming text)
    if (msg.type === "content_block_delta" && msg.delta?.text) {
      const text = msg.delta.text;
      return detectSignal(text) ?? { type: "text", content: text };
    }

    // Handle message content (both "message" and "assistant" types have same structure)
    if ((msg.type === "message" || msg.type === "assistant") && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          return detectSignal(block.text) ?? { type: "text", content: block.text };
        }

        if (block.type === "tool_use" && block.tool_use) {
          return {
            type: "tool",
            content: `Tool: ${block.tool_use.name}`,
          };
        }
      }
    }

    return { type: "unknown" };
  } catch {
    // Not JSON, treat as plain text
    const text = line.trim();
    return detectSignal(text) ?? { type: "text", content: text };
  }
}

/**
 * Start a Claude Code run for a job.
 *
 * Creates a @claudekit/session session and wraps the Claude process as a SessionRunner.
 * The session manages the ring buffer, batch log flushing, PID tracking, and cleanup.
 */
export async function startClaudeRun(
  jobId: string,
  resumeWithMessage?: string,
): Promise<{ success: boolean; error?: string }> {
  // Check if already running via session
  const existingSession = getLiveSession(jobId);
  if (existingSession && (existingSession.status === "running" || existingSession.status === "pending")) {
    return {
      success: false,
      error: "Claude run already in progress for this job",
    };
  }

  // Get job
  const conn = await getDb();
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

  if (!job.worktree_path) {
    return { success: false, error: "Job does not have a worktree path set" };
  }

  if (!job.repository_id) {
    return { success: false, error: "Job does not have a repository ID" };
  }

  // Capture for closures
  const repositoryId = job.repository_id;
  const worktreePath = job.worktree_path;

  // Get repository config
  const repoConfig = await getRepoConfigById(repositoryId);
  if (!repoConfig) {
    return { success: false, error: "Repository configuration not found" };
  }

  // Get Claude settings
  const claudeSettings = await getClaudeSettings();
  if (!claudeSettings.enabled) {
    return { success: false, error: "Claude Code is disabled in settings" };
  }

  // Check parallel job limit
  const activeCount = getActiveSessionCount();
  if (activeCount >= claudeSettings.max_parallel_jobs) {
    return {
      success: false,
      error: `Max parallel jobs reached (${claudeSettings.max_parallel_jobs})`,
    };
  }

  const logState: LogState = { sequence: 0 };

  // Track the Claude session ID (for resume capability)
  let claudeSessionId = job.claude_session_id;
  let prompt: string;

  // Resume mode or new run
  if (resumeWithMessage && job.claude_session_id) {
    prompt = resumeWithMessage;
    await emitLog(jobId, "system", `Resuming Claude session with message: ${resumeWithMessage}`, logState);
  } else {
    // Generate a new Claude session ID upfront
    claudeSessionId = randomUUID();

    // Save immediately for resume support
    const now = new Date().toISOString();
    await execute(conn, "UPDATE jobs SET claude_session_id = ?, updated_at = ? WHERE id = ?", [
      claudeSessionId,
      now,
      jobId,
    ]);

    // Consume pending injection
    if (job.pending_injection) {
      await execute(conn, "UPDATE jobs SET pending_injection = NULL, updated_at = ? WHERE id = ?", [
        new Date().toISOString(),
        jobId,
      ]);
      await emitLog(jobId, "system", `Including pending message: ${job.pending_injection}`, logState);
    }

    prompt = buildPrompt(
      {
        issueNumber: job.issue_number,
        issueTitle: job.issue_title,
        issueBody: job.issue_body,
        worktreePath: job.worktree_path,
        branch: job.branch,
        source: job.source,
      },
      repoConfig,
      claudeSettings,
    );
    await emitLog(jobId, "system", `Starting new Claude Code run (session: ${claudeSessionId})...`, logState);
  }

  // Create session record in DB
  await createSessionRecord({
    id: jobId,
    sessionType: "claude_run",
    label: job.issue_title || `Job ${jobId.slice(0, 8)}`,
    contextType: "job",
    contextId: jobId,
    metadata: { claudeSessionId, repositoryId },
  });

  // Build the SessionRunner that wraps the Claude process
  const runner: SessionRunner = async (ctx) => {
    const { onProgress, signal } = ctx;
    return new Promise<{ result?: Record<string, unknown> }>((resolve, reject) => {
      // Spawn Claude process
      const spawnOpts: Parameters<typeof spawnClaude>[0] = {
        cwd: worktreePath,
        prompt,
        dangerouslySkipPermissions: true,
        env: { FORCE_COLOR: "0", NO_COLOR: "1" },
      };
      if (resumeWithMessage && job.claude_session_id) {
        spawnOpts.resume = job.claude_session_id;
      } else if (claudeSessionId) {
        spawnOpts.sessionId = claudeSessionId;
      }
      const proc = spawnClaude(spawnOpts);

      // Track PID via session manager
      if (proc.pid) {
        setSessionPid(jobId, proc.pid);
        // Also update jobs table for stale-job-monitor compatibility
        execute(conn, "UPDATE jobs SET process_pid = ?, process_started_at = ?, updated_at = ? WHERE id = ?", [
          proc.pid,
          new Date().toISOString(),
          new Date().toISOString(),
          jobId,
        ]).catch(() => {});
        emitLog(jobId, "system", `Claude process started (PID: ${proc.pid})`, logState);
      } else {
        log.error("Failed to spawn claude process - no PID");
        reject(new Error("Failed to spawn Claude process - no PID assigned"));
        return;
      }

      // Register cleanup function (kills process on cancel)
      setCleanupFn(jobId, async () => {
        if (proc.pid) {
          await safeTerminateProcess(proc.pid);
        }
        // Clear PID from jobs table
        execute(conn, "UPDATE jobs SET process_pid = NULL, process_started_at = NULL, updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          jobId,
        ]).catch(() => {});
      });

      // Set up timeout
      const timeoutId = setTimeout(async () => {
        proc.child.kill("SIGTERM");
        await emitLog(jobId, "stderr", `Claude run timed out after ${claudeSettings.max_runtime_ms / 1000}s`, logState);
        await updateJobStatus(jobId, "paused", "running", "Timed out - session saved", {
          pause_reason: "Execution timeout",
        });
      }, claudeSettings.max_runtime_ms);

      let currentClaudeSessionId = claudeSessionId;
      let planAccumulator = "";
      let isAccumulatingPlan = false;
      let hasResolved = false;

      const resolveOnce = (result: Record<string, unknown>) => {
        if (hasResolved) return;
        hasResolved = true;
        clearTimeout(timeoutId);
        resolve({ result });
      };

      // Handle abort signal (cancellation)
      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        proc.child.kill("SIGTERM");
        // Force kill after 5s if still running
        setTimeout(() => {
          try {
            proc.child.kill("SIGKILL");
          } catch {
            // Already dead
          }
        }, 5000);
      });

      // Handle stdout via line-buffered handler
      proc.onRawLine(async (line) => {
        if (hasResolved) return;
        const parsed = parseStreamJsonLine(line);

        // Detect phase changes
        const phaseInfo = detectPhase(parsed);
        if (phaseInfo) {
          onProgress({
            type: "progress",
            phase: phaseInfo.phase,
            progress: phaseInfo.progress,
          });
          // Also update jobs table for WS broadcast
          execute(conn, "UPDATE jobs SET phase = ?, progress = ?, updated_at = ? WHERE id = ?", [
            phaseInfo.phase,
            phaseInfo.progress ?? null,
            new Date().toISOString(),
            jobId,
          ])
            .then(() =>
              queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]).then((updated) => {
                if (updated) broadcast({ type: "job:updated", payload: updated });
              }),
            )
            .catch(() => {});
        }

        // Plan accumulation
        if (isAccumulatingPlan && parsed.type === "text" && parsed.content) {
          planAccumulator += `\n${parsed.content}`;
          await emitLog(jobId, "stdout:content", parsed.content, logState);
          return;
        }

        switch (parsed.type) {
          case "text":
            if (parsed.content) {
              await emitLog(jobId, "stdout:content", parsed.content, logState);
            }
            break;

          case "tool":
            if (parsed.content) {
              await emitLog(jobId, "stdout:tool", parsed.content, logState);
            }
            break;

          case "error":
            if (parsed.content) {
              await emitLog(jobId, "stderr", parsed.content, logState);
            }
            break;

          case "session":
            if (parsed.sessionId) {
              currentClaudeSessionId = parsed.sessionId;
              await execute(conn, "UPDATE jobs SET claude_session_id = ?, updated_at = ? WHERE id = ?", [
                parsed.sessionId,
                new Date().toISOString(),
                jobId,
              ]);
              await emitLog(jobId, "system", `Session ID: ${parsed.sessionId}`, logState);
            }
            break;

          case "signal":
            if (parsed.signal === "PLAN") {
              await emitLog(jobId, "system", "Agent submitted implementation plan", logState);
              isAccumulatingPlan = true;
              planAccumulator = parsed.planContent || "";
              if (parsed.content) {
                await emitLog(jobId, "stdout:content", parsed.content, logState);
              }
            } else if (parsed.signal === "READY_TO_PR") {
              await emitLog(jobId, "system", "Agent signaled READY_TO_PR", logState);
              // Stop the process gracefully
              proc.child.kill("SIGTERM");
              // Transition to ready_to_pr
              await updateJobStatus(jobId, "ready_to_pr", "running", "Agent completed work", {
                claude_session_id: currentClaudeSessionId,
              });
              resolveOnce({ signal: "ready_to_pr" });
            } else if (parsed.signal === "NEEDS_INFO" && parsed.question) {
              await emitLog(jobId, "system", `Agent needs info: ${parsed.question}`, logState);
              proc.child.kill("SIGTERM");

              if (job.issue_number < 0) {
                await updateJobStatus(jobId, "needs_info", "running", parsed.question, {
                  claude_session_id: currentClaudeSessionId,
                  needs_info_question: parsed.question,
                });
              } else {
                try {
                  const commentBody = `${AGENT_COMMENT_MARKER}\n**Agent Question:**\n\n${parsed.question}`;
                  const { id: commentId } = await createIssueCommentForRepo(
                    repositoryId,
                    job.issue_number,
                    commentBody,
                  );
                  await updateJobStatus(jobId, "needs_info", "running", parsed.question, {
                    claude_session_id: currentClaudeSessionId,
                    needs_info_question: parsed.question,
                    needs_info_comment_id: commentId,
                    last_checked_comment_id: commentId,
                  });
                } catch (error) {
                  const err = error as Error;
                  await emitLog(jobId, "stderr", `Failed to post question to GitHub: ${err.message}`, logState);
                }
              }
              resolveOnce({ signal: "needs_info", question: parsed.question });
            }
            break;
        }
      });

      // Handle stderr
      proc.onStderr(async (content) => {
        await emitLog(jobId, "stderr", content, logState);
      });

      // Handle process exit
      proc.onExit(async (code) => {
        clearTimeout(timeoutId);

        // Clear PID from jobs table
        execute(conn, "UPDATE jobs SET process_pid = NULL, process_started_at = NULL, updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          jobId,
        ]).catch(() => {});

        // Check if job is still in running or planning state
        const currentJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
        if (!currentJob) {
          resolveOnce({});
          return;
        }

        // Handle accumulated plan content on process exit
        if (isAccumulatingPlan && planAccumulator.trim() && currentJob.status === "planning") {
          const planContent = planAccumulator.trim();
          await emitLog(jobId, "system", "Plan accumulation complete, transitioning to awaiting approval", logState);

          // Post plan as issue comment for GitHub-backed jobs
          let planCommentId: number | null = null;
          if (job.issue_number > 0) {
            try {
              const commentBody = `${AGENT_COMMENT_MARKER}\n📋 **Implementation Plan:**\n\n${planContent}\n\n---\n_Reply with **approve**, **lgtm**, or **looks good** to approve this plan, or provide feedback to request changes._`;
              const { id: commentId } = await createIssueCommentForRepo(repositoryId, job.issue_number, commentBody);
              planCommentId = commentId;
            } catch (error) {
              const err = error as Error;
              await emitLog(jobId, "stderr", `Failed to post plan to GitHub: ${err.message}`, logState);
            }
          }

          await updateJobStatus(jobId, "awaiting_plan_approval", "planning", "Plan submitted for review", {
            plan_content: planContent,
            plan_comment_id: planCommentId,
            last_checked_plan_comment_id: planCommentId,
            claude_session_id: currentClaudeSessionId,
          });
          resolveOnce({ signal: "plan", planContent });
          return;
        }

        if (currentJob.status !== "running" && currentJob.status !== "planning") {
          resolveOnce({});
          return;
        }

        if (code === 0) {
          await emitLog(jobId, "system", "Claude process exited successfully", logState);
        } else if (code !== null) {
          await emitLog(jobId, "stderr", `Claude process exited with code ${code}`, logState);
          await updateJobStatus(jobId, "failed", currentJob.status as JobStatus, `Claude exited with code ${code}`, {
            failure_reason: `Process exit code: ${code}`,
            claude_session_id: currentClaudeSessionId,
          });
        }
        resolveOnce({ exitCode: code });
      });

      // Handle process error
      proc.onError(async (error) => {
        log.error({ err: error, jobId }, "Process error for job");
        clearTimeout(timeoutId);
        await emitLog(jobId, "stderr", `Failed to spawn Claude: ${error.message}`, logState);
        const fromStatus = job.status as JobStatus;
        await updateJobStatus(jobId, "failed", fromStatus, `Spawn error: ${error.message}`, {
          failure_reason: error.message,
        });
        resolveOnce({ error: error.message });
      });
    });
  };

  // Start the session (runner executes in background)
  try {
    trackSession(jobId);
    const liveSession = await startSession(jobId, runner);
    // Untrack when session completes
    liveSession.completionPromise.finally(() => {
      untrackSession(jobId);
    });
  } catch (error) {
    untrackSession(jobId);
    const err = error as Error;
    log.error({ err, jobId }, "Failed to start session");
    return { success: false, error: `Failed to start session: ${err.message}` };
  }

  return { success: true };
}

/**
 * Stop a running Claude process via session cancellation
 */
export async function stopClaudeRun(jobId: string, saveSession = false): Promise<boolean> {
  // Save Claude session ID if requested
  if (saveSession) {
    const conn = await getDb();
    const job = await queryOne<DbJob>(conn, "SELECT claude_session_id FROM jobs WHERE id = ?", [jobId]);
    if (job?.claude_session_id) {
      await execute(conn, "UPDATE jobs SET claude_session_id = ?, updated_at = ? WHERE id = ?", [
        job.claude_session_id,
        new Date().toISOString(),
        jobId,
      ]);
    }
  }

  return cancelSession(jobId);
}

/**
 * Pause a Claude run (saves session for later resume)
 */
export async function pauseClaudeRun(jobId: string): Promise<boolean> {
  const session = getLiveSession(jobId);
  if (!session) return false;

  await emitLog(jobId, "system", "Pausing Claude run...", { sequence: 0 });
  await stopClaudeRun(jobId, true);

  return true;
}

/**
 * Resume a paused Claude run
 */
export async function resumeClaudeRun(
  jobId: string,
  injectedMessage?: string,
): Promise<{ success: boolean; error?: string }> {
  const conn = await getDb();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (!job.claude_session_id) {
    return { success: false, error: "No session ID to resume from" };
  }

  // Check for pending injection
  let message = injectedMessage;
  if (!message && job.pending_injection) {
    message = job.pending_injection;
    await execute(conn, "UPDATE jobs SET pending_injection = NULL, updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      jobId,
    ]);
  }

  const resumeMessage = message || "Continue from where you left off.";

  return startClaudeRun(jobId, resumeMessage);
}

/**
 * Inject a message into a running or paused job
 */
export async function injectMessage(
  jobId: string,
  message: string,
  mode: InjectMode,
): Promise<{ success: boolean; error?: string }> {
  const conn = await getDb();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (mode === "immediate") {
    // Kill current run and resume with the message
    const session = getLiveSession(jobId);
    if (session && session.status === "running") {
      await pauseClaudeRun(jobId);
    }

    // If job was running or paused with a session, resume with the injection
    if (job.claude_session_id && (job.status === "running" || job.status === "paused")) {
      if (job.status === "paused") {
        await updateJobStatus(jobId, "running", "paused", "Resuming with injected message");
      }
      return resumeClaudeRun(jobId, message);
    }

    // No session to resume, store as pending
    await execute(conn, "UPDATE jobs SET pending_injection = ?, updated_at = ? WHERE id = ?", [
      message,
      new Date().toISOString(),
      jobId,
    ]);

    return { success: true };
  }
  // Queued mode - store for next break
  await execute(conn, "UPDATE jobs SET pending_injection = ?, updated_at = ? WHERE id = ?", [
    message,
    new Date().toISOString(),
    jobId,
  ]);

  return { success: true };
}

/**
 * Check if a job has an active Claude run
 */
export function isRunning(jobId: string): boolean {
  const session = getLiveSession(jobId);
  return session != null && (session.status === "running" || session.status === "pending");
}

/**
 * Get count of active Claude runs
 */
export function getActiveRunCount(): number {
  return getActiveSessionCount();
}
