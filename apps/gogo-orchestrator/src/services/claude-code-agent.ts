import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { execute, queryOne } from "@devkit/duckdb";
import type { InjectMode, JobStatus } from "@devkit/gogo-shared";
import { getDb } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { emitLog, type LogState, updateJobStatus } from "../utils/job-logging.js";
import { createServiceLogger } from "../utils/logger.js";
import { broadcast } from "../ws/handler.js";
import { AGENT_COMMENT_MARKER, createIssueCommentForRepo, getRepoConfigById } from "./github/index.js";
import { registerProcess, unregisterProcess } from "./process-manager.js";
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
  const { execSync } = await import("node:child_process");
  try {
    execSync("which claude", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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

// Track active Claude processes
interface ActiveProcess {
  process: ChildProcess;
  jobId: string;
  sessionId: string | null;
  startTime: number;
  timeoutId?: NodeJS.Timeout;
  logState: LogState;
}

const activeProcesses = new Map<string, ActiveProcess>();

// Stream-JSON message types from Claude CLI
interface StreamJsonMessage {
  type: string;
  message?: {
    id?: string;
    content?: Array<{
      type: string;
      text?: string;
      tool_use?: {
        name: string;
        input: unknown;
      };
    }>;
  };
  content_block?: {
    type: string;
    text?: string;
  };
  delta?: {
    type: string;
    text?: string;
  };
  error?: {
    message: string;
  };
  result?: {
    session_id?: string;
  };
}

/**
 * Build the structured prompt for Claude Code
 *
 * @param phase - "implementing" (default), "planning" (create plan only), or "implementing_with_plan" (follow approved plan)
 * @param approvedPlan - The approved plan to follow (when phase is "implementing_with_plan")
 * @param feedback - Feedback from human to incorporate when revising a plan
 */
function buildPrompt(
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
function detectSignal(text: string): ParsedLine | null {
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
function detectPhase(parsed: ParsedLine): { phase: string; progress?: number } | null {
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
function parseStreamJsonLine(line: string, _jobId: string, _logState: LogState): ParsedLine {
  if (!line.trim()) {
    return { type: "unknown" };
  }

  try {
    const msg: StreamJsonMessage = JSON.parse(line);

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
 * Start a Claude Code run for a job
 */
export async function startClaudeRun(
  jobId: string,
  resumeWithMessage?: string,
): Promise<{ success: boolean; error?: string }> {
  // Check if already running
  if (activeProcesses.has(jobId)) {
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

  // Capture repositoryId for use in closures (TypeScript narrowing doesn't work for closures)
  const repositoryId = job.repository_id;

  // Get repository config for multi-repo support
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
  if (activeProcesses.size >= claudeSettings.max_parallel_jobs) {
    return {
      success: false,
      error: `Max parallel jobs reached (${claudeSettings.max_parallel_jobs})`,
    };
  }

  const logState: LogState = { sequence: 0 };

  // Build Claude CLI arguments
  const args = ["--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose"];

  // Track the session ID we'll use (either existing or newly generated)
  let sessionId = job.claude_session_id;

  // Resume mode or new run
  if (resumeWithMessage && job.claude_session_id) {
    args.push("--resume", job.claude_session_id);
    args.push("-p", resumeWithMessage);
    await emitLog(jobId, "system", `Resuming Claude session with message: ${resumeWithMessage}`, logState);
  } else {
    // Generate a new session ID upfront so we can resume later even if paused early
    // The Claude CLI accepts --session-id to specify the session ID for new runs
    sessionId = randomUUID();
    args.push("--session-id", sessionId);

    // Save the session ID immediately so it's available for resume
    const now = new Date().toISOString();
    await execute(conn, "UPDATE jobs SET claude_session_id = ?, updated_at = ? WHERE id = ?", [sessionId, now, jobId]);

    // Check for pending injection to include in the initial prompt
    if (job.pending_injection) {
      // Clear the pending injection after consuming it
      await execute(conn, "UPDATE jobs SET pending_injection = NULL, updated_at = ? WHERE id = ?", [
        new Date().toISOString(),
        jobId,
      ]);

      await emitLog(jobId, "system", `Including pending message: ${job.pending_injection}`, logState);
    }

    const prompt = buildPrompt(
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
    args.push("-p", prompt);
    await emitLog(jobId, "system", `Starting new Claude Code run (session: ${sessionId})...`, logState);
  }

  // Spawn Claude process
  const claudeProcess = spawn("claude", args, {
    cwd: job.worktree_path,
    env: {
      ...process.env,
      // Ensure consistent environment
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    stdio: ["pipe", "pipe", "pipe"], // Explicitly set stdio
  });

  // Register process for cleanup tracking
  if (claudeProcess.pid) {
    await registerProcess(jobId, claudeProcess.pid);
    await emitLog(jobId, "system", `Claude process started (PID: ${claudeProcess.pid})`, logState);
  } else {
    log.error("Failed to spawn claude process - no PID");
    await emitLog(jobId, "stderr", "Failed to spawn Claude process - no PID assigned", logState);
    return { success: false, error: "Failed to spawn Claude process" };
  }

  // Verify stdio streams are available
  if (!claudeProcess.stdout || !claudeProcess.stderr) {
    log.error("Process spawned but stdio streams unavailable");
    await emitLog(jobId, "stderr", "Claude process spawned but stdio streams are not available", logState);
  }

  // Close stdin - Claude CLI doesn't need interactive input when using -p flag
  // Some processes wait for stdin EOF before starting
  if (claudeProcess.stdin) {
    claudeProcess.stdin.end();
  }

  // Set up timeout
  const timeoutId = setTimeout(async () => {
    await stopClaudeRun(jobId, true); // Save session on timeout
    await emitLog(jobId, "stderr", `Claude run timed out after ${claudeSettings.max_runtime_ms / 1000}s`, logState);
    await updateJobStatus(jobId, "paused", "running", "Timed out - session saved", {
      pause_reason: "Execution timeout",
    });
  }, claudeSettings.max_runtime_ms);

  // Track the process
  const activeProcess: ActiveProcess = {
    process: claudeProcess,
    jobId,
    sessionId, // Use the session ID we determined above (either existing or newly generated)
    startTime: Date.now(),
    timeoutId,
    logState,
  };
  activeProcesses.set(jobId, activeProcess);

  let stdoutBuffer = "";
  let planAccumulator = ""; // Accumulate plan content across multiple chunks
  let isAccumulatingPlan = false; // Flag to indicate we're in plan accumulation mode

  // Handle stdout (stream-json output)
  claudeProcess.stdout?.on("data", async (data: Buffer) => {
    stdoutBuffer += data.toString();

    // Process complete lines
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      const parsed = parseStreamJsonLine(line, jobId, logState);

      // Detect phase changes from parsed output
      const phaseInfo = detectPhase(parsed);
      if (phaseInfo) {
        // Update phase in DB (fire-and-forget, non-blocking)
        execute(conn, "UPDATE jobs SET phase = ?, progress = ?, updated_at = ? WHERE id = ?", [
          phaseInfo.phase,
          phaseInfo.progress ?? null,
          new Date().toISOString(),
          jobId,
        ])
          .then(() =>
            queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]).then((updated) => {
              if (updated) {
                broadcast({ type: "job:updated", payload: updated });
              }
            }),
          )
          .catch(() => {}); // Ignore phase update errors
      }

      // If we're accumulating plan content, append all text
      if (isAccumulatingPlan && parsed.type === "text" && parsed.content) {
        planAccumulator += `\n${parsed.content}`;
        await emitLog(jobId, "stdout:content", parsed.content, logState);
        continue;
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
            activeProcess.sessionId = parsed.sessionId;
            // Save session ID to database
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
            // Start accumulating plan content
            isAccumulatingPlan = true;
            planAccumulator = parsed.planContent || "";
            if (parsed.content) {
              await emitLog(jobId, "stdout:content", parsed.content, logState);
            }
          } else if (parsed.signal === "READY_TO_PR") {
            await emitLog(jobId, "system", "Agent signaled READY_TO_PR", logState);
            // Stop the process gracefully
            await stopClaudeRun(jobId, true);
            // Transition to ready_to_pr
            await updateJobStatus(jobId, "ready_to_pr", "running", "Agent completed work", {
              claude_session_id: activeProcess.sessionId,
            });
          } else if (parsed.signal === "NEEDS_INFO" && parsed.question) {
            await emitLog(jobId, "system", `Agent needs info: ${parsed.question}`, logState);
            // For manual jobs (negative issue number), skip GitHub comment
            if (job.issue_number < 0) {
              await stopClaudeRun(jobId, true);
              await updateJobStatus(jobId, "needs_info", "running", parsed.question, {
                claude_session_id: activeProcess.sessionId,
                needs_info_question: parsed.question,
              });
            } else {
              // Post question to GitHub
              try {
                const commentBody = `${AGENT_COMMENT_MARKER}\n**Agent Question:**\n\n${parsed.question}`;
                const { id: commentId } = await createIssueCommentForRepo(repositoryId, job.issue_number, commentBody);
                // Stop the process and transition to needs_info
                await stopClaudeRun(jobId, true);
                await updateJobStatus(jobId, "needs_info", "running", parsed.question, {
                  claude_session_id: activeProcess.sessionId,
                  needs_info_question: parsed.question,
                  needs_info_comment_id: commentId,
                  last_checked_comment_id: commentId,
                });
              } catch (error) {
                const err = error as Error;
                await emitLog(jobId, "stderr", `Failed to post question to GitHub: ${err.message}`, logState);
              }
            }
          }
          break;
      }
    }
  });

  // Handle stderr
  claudeProcess.stderr?.on("data", async (data: Buffer) => {
    const content = data.toString();
    await emitLog(jobId, "stderr", content, logState);
  });

  // Handle process exit
  claudeProcess.on("close", async (code, _signal) => {
    clearTimeout(timeoutId);
    const proc = activeProcesses.get(jobId);
    activeProcesses.delete(jobId);

    // Unregister process from cleanup tracking
    await unregisterProcess(jobId);

    // Process remaining buffer
    if (stdoutBuffer.trim()) {
      const parsed = parseStreamJsonLine(stdoutBuffer, jobId, logState);
      if (parsed.content) {
        if (isAccumulatingPlan) {
          planAccumulator += `\n${parsed.content}`;
        }
        await emitLog(jobId, "stdout", parsed.content, logState);
      }
    }

    // Check if job is still in running or planning state (signals may have transitioned it)
    const currentJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
    if (!currentJob) return;

    // Handle accumulated plan content on process exit
    if (isAccumulatingPlan && planAccumulator.trim() && currentJob.status === "planning") {
      const planContent = planAccumulator.trim();
      await emitLog(jobId, "system", "Plan accumulation complete, transitioning to awaiting approval", logState);

      // For GitHub-backed jobs, post plan as issue comment
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
        claude_session_id: proc?.sessionId,
      });
      return;
    }

    if (currentJob.status !== "running" && currentJob.status !== "planning") {
      return; // Already transitioned
    }

    if (code === 0) {
      await emitLog(jobId, "system", "Claude process exited successfully", logState);
    } else if (code !== null) {
      await emitLog(jobId, "stderr", `Claude process exited with code ${code}`, logState);
      await updateJobStatus(jobId, "failed", currentJob.status as JobStatus, `Claude exited with code ${code}`, {
        failure_reason: `Process exit code: ${code}`,
        claude_session_id: proc?.sessionId,
      });
    }
  });

  // Handle process error
  claudeProcess.on("error", async (error) => {
    log.error({ err: error, jobId }, "Process error for job");
    clearTimeout(timeoutId);
    activeProcesses.delete(jobId);

    // Unregister process from cleanup tracking
    await unregisterProcess(jobId);

    await emitLog(jobId, "stderr", `Failed to spawn Claude: ${error.message}`, logState);
    const fromStatus = job.status as JobStatus;
    await updateJobStatus(jobId, "failed", fromStatus, `Spawn error: ${error.message}`, {
      failure_reason: error.message,
    });
  });

  return { success: true };
}

/**
 * Stop a running Claude process
 */
export async function stopClaudeRun(jobId: string, saveSession = false): Promise<boolean> {
  const proc = activeProcesses.get(jobId);
  if (!proc) return false;

  // Clear timeout
  if (proc.timeoutId) {
    clearTimeout(proc.timeoutId);
  }

  // Save session ID if requested
  if (saveSession && proc.sessionId) {
    const conn = await getDb();
    await execute(conn, "UPDATE jobs SET claude_session_id = ?, updated_at = ? WHERE id = ?", [
      proc.sessionId,
      new Date().toISOString(),
      jobId,
    ]);
  }

  // Send SIGTERM
  proc.process.kill("SIGTERM");

  // Wait for graceful shutdown, then SIGKILL
  return new Promise((resolve) => {
    const killTimeout = setTimeout(() => {
      if (activeProcesses.has(jobId)) {
        proc.process.kill("SIGKILL");
        activeProcesses.delete(jobId);
      }
      // Unregister process from cleanup tracking
      unregisterProcess(jobId).catch(() => {}); // Ignore errors on force kill
      resolve(true);
    }, 5000);

    proc.process.once("close", () => {
      clearTimeout(killTimeout);
      activeProcesses.delete(jobId);
      resolve(true);
    });
  });
}

/**
 * Pause a Claude run (saves session for later resume)
 */
export async function pauseClaudeRun(jobId: string): Promise<boolean> {
  const proc = activeProcesses.get(jobId);
  if (!proc) return false;

  await emitLog(jobId, "system", "Pausing Claude run...", proc.logState);
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

  // Check for pending injection and use it if no explicit message provided
  let message = injectedMessage;
  if (!message && job.pending_injection) {
    message = job.pending_injection;
    // Clear the pending injection after consuming it
    await execute(conn, "UPDATE jobs SET pending_injection = NULL, updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      jobId,
    ]);
  }

  // Build resume message
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
    if (activeProcesses.has(jobId)) {
      await pauseClaudeRun(jobId);
    }

    // If job was running or paused with a session, resume with the injection
    if (job.claude_session_id && (job.status === "running" || job.status === "paused")) {
      // First ensure job is in running state
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
  return activeProcesses.has(jobId);
}

/**
 * Get count of active Claude runs
 */
export function getActiveRunCount(): number {
  return activeProcesses.size;
}
