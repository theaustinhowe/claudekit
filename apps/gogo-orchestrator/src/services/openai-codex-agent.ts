/**
 * OpenAI Codex Agent - CLI-based Implementation
 *
 * This module implements the OpenAI Codex agent by spawning the `codex` CLI,
 * mirroring the pattern used by claude-code-agent.ts.
 *
 * The Codex CLI handles its own agent loop, tool execution, and session management.
 * We parse its JSONL output for real-time streaming.
 *
 * To enable:
 * 1. Set ENABLE_OPENAI_CODEX=true
 * 2. Set OPENAI_API_KEY=sk-your-key
 * 3. Install the Codex CLI: npm install -g @openai/codex
 * 4. Optionally set OPENAI_MODEL (defaults to o4-mini)
 */

import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { InjectMode, JobStatus } from "@devkit/gogo-shared";
import { execute, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { emitLog, type LogState, updateJobStatus } from "../utils/job-logging.js";
import { broadcast } from "../ws/handler.js";
import { AGENT_COMMENT_MARKER, createIssueCommentForRepo, getRepoConfigById } from "./github/index.js";
import { registerProcess, unregisterProcess } from "./process-manager.js";
import {
  DEFAULT_MAX_RUNTIME_MS,
  getCodexSettings,
  hasOpenAIApiKey,
  isCodexEnabled,
  type OpenAICodexSettings,
} from "./settings-helper.js";

/**
 * Error messages for configuration issues
 */
export const CODEX_ERRORS = {
  NOT_ENABLED: "OpenAI Codex runner not enabled. Set ENABLE_OPENAI_CODEX=true to enable.",
  NO_API_KEY: "OPENAI_API_KEY environment variable is not set. Export your OpenAI API key to use Codex.",
  CLI_NOT_FOUND: "Codex CLI not found. Install it with: npm install -g @openai/codex",
} as const;

/**
 * Check if the Codex CLI is available on the system
 */
export async function isCodexCliAvailable(): Promise<boolean> {
  const { execSync } = await import("node:child_process");
  try {
    execSync("which codex", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Codex is available and return appropriate error if not
 */
export async function getCodexAvailabilityError(): Promise<string | null> {
  if (!isCodexEnabled()) {
    return CODEX_ERRORS.NOT_ENABLED;
  }
  if (!hasOpenAIApiKey()) {
    return CODEX_ERRORS.NO_API_KEY;
  }
  if (!(await isCodexCliAvailable())) {
    return CODEX_ERRORS.CLI_NOT_FOUND;
  }
  return null;
}

// Track active Codex processes
interface ActiveProcess {
  process: ChildProcess;
  jobId: string;
  sessionId: string | null;
  startTime: number;
  timeoutId?: NodeJS.Timeout;
  logState: LogState;
}

const activeProcesses = new Map<string, ActiveProcess>();

// Codex CLI JSONL event types
interface CodexJsonlEvent {
  type: string;
  // thread.started
  thread_id?: string;
  // item events
  item?: {
    type?: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      command?: string;
      exit_code?: number;
      output?: string;
    }>;
    // File change events
    filename?: string;
    action?: string;
  };
  // error events
  message?: string;
  // session info
  session_id?: string;
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
    if (
      toolName.includes("read") ||
      toolName.includes("search") ||
      toolName.includes("glob") ||
      toolName.includes("grep") ||
      toolName.includes("list")
    ) {
      return { phase: "analysis", progress: 25 };
    }
    if (
      toolName.includes("write") ||
      toolName.includes("edit") ||
      toolName.includes("create") ||
      toolName.includes("patch") ||
      toolName.includes("file_change")
    ) {
      return { phase: "implementation", progress: 50 };
    }
    if (
      toolName.includes("shell") ||
      toolName.includes("bash") ||
      toolName.includes("execute") ||
      toolName.includes("run")
    ) {
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
 * Parse a line of JSONL output from Codex CLI
 */
export function parseCodexJsonlLine(line: string): ParsedLine {
  if (!line.trim()) {
    return { type: "unknown" };
  }

  try {
    const evt: CodexJsonlEvent = JSON.parse(line);

    // thread.started → session
    if (evt.type === "thread.started" && evt.thread_id) {
      return { type: "session", sessionId: evt.thread_id };
    }

    // error events
    if (evt.type === "error") {
      return {
        type: "error",
        content: evt.message || "Unknown error",
      };
    }

    // item.* events - look at item content
    if (evt.type?.startsWith("item.") && evt.item) {
      // File change events
      if (evt.item.type === "file_change" || evt.item.filename) {
        const action = evt.item.action || "modified";
        return {
          type: "tool",
          content: `Tool: file_change (${action}: ${evt.item.filename || "unknown"})`,
        };
      }

      // Command execution events
      if (evt.item.content) {
        for (const block of evt.item.content) {
          if (block.type === "command" || block.command) {
            const cmd = block.command || "unknown";
            const truncated = cmd.length > 100 ? `${cmd.slice(0, 100)}...` : cmd;
            return {
              type: "tool",
              content: `Tool: shell (${truncated})`,
            };
          }

          // Command output
          if (block.type === "command_output" && block.output) {
            return { type: "text", content: block.output };
          }

          // Agent messages (text content)
          if (block.type === "text" && block.text) {
            return detectSignal(block.text) ?? { type: "text", content: block.text };
          }

          // Output text
          if (block.type === "output_text" && block.text) {
            return detectSignal(block.text) ?? { type: "text", content: block.text };
          }
        }
      }

      // Agent message without explicit content blocks (role-based)
      if (evt.item.role === "assistant" || evt.item.type === "message") {
        return { type: "text", content: "" };
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
 * Build the structured prompt for Codex CLI
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
  codexSettings: OpenAICodexSettings,
  options?: {
    phase?: "implementing" | "planning" | "implementing_with_plan";
    approvedPlan?: string;
    feedback?: string;
  },
): string {
  const testCommand = codexSettings.test_command || "npm test";
  const isManual = job.source === "manual" || job.issueNumber < 0;
  const phase = options?.phase || "implementing";

  const header = isManual ? `## Task: ${job.issueTitle}` : `## Issue #${job.issueNumber}: ${job.issueTitle}`;

  const repoContext = `## Repository Context
- Owner: ${workspaceSettings.owner}
- Repository: ${workspaceSettings.name}
- Working Directory: ${job.worktreePath}
- Branch: ${job.branch}`;

  // Planning phase
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

  // Default: standard implementation
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

/**
 * Start a Codex CLI run for a job
 */
export async function startCodexRun(
  jobId: string,
  resumeWithMessage?: string,
): Promise<{ success: boolean; error?: string }> {
  // Check if already running
  if (activeProcesses.has(jobId)) {
    return {
      success: false,
      error: "Codex run already in progress for this job",
    };
  }

  // Get job
  const conn = getConn();
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

  const repositoryId = job.repository_id;

  // Get repository config for multi-repo support
  const repoConfig = await getRepoConfigById(repositoryId);
  if (!repoConfig) {
    return { success: false, error: "Repository configuration not found" };
  }

  // Get Codex settings
  const codexSettings = await getCodexSettings();
  const model = process.env.OPENAI_MODEL ?? codexSettings.model ?? "o4-mini";
  const maxRuntimeMs = codexSettings.max_runtime_ms ?? DEFAULT_MAX_RUNTIME_MS;

  // Check parallel job limit
  if (activeProcesses.size >= codexSettings.max_parallel_jobs) {
    return {
      success: false,
      error: `Max parallel jobs reached (${codexSettings.max_parallel_jobs})`,
    };
  }

  const logState: LogState = { sequence: 0 };

  // Build Codex CLI arguments
  const args: string[] = [];

  // Track the session ID we'll use
  let sessionId = job.codex_session_id;

  // Resume mode or new run
  if (resumeWithMessage && job.codex_session_id) {
    // Resume an existing session
    args.push("resume", job.codex_session_id, "-q", "--json");
    await emitLog(jobId, "system", `Resuming Codex session with message: ${resumeWithMessage}`, logState);
  } else {
    // New run
    sessionId = randomUUID();

    // Save the session ID immediately
    const now = new Date().toISOString();
    await execute(conn, "UPDATE jobs SET codex_session_id = ?, updated_at = ? WHERE id = ?", [sessionId, now, jobId]);

    // Check for pending injection
    if (job.pending_injection) {
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
      codexSettings,
    );

    // Approval mode flag
    const approvalFlag =
      codexSettings.approval_mode === "full-auto"
        ? "--full-auto"
        : codexSettings.approval_mode === "auto-edit"
          ? "--auto-edit"
          : null;

    args.push("-q", "--json");
    if (approvalFlag) {
      args.push(approvalFlag);
    }
    args.push("-m", model);
    args.push(prompt);

    await emitLog(jobId, "system", `Starting new Codex CLI run (session: ${sessionId}, model: ${model})...`, logState);
  }

  // Spawn Codex process
  const codexProcess = spawn("codex", args, {
    cwd: job.worktree_path,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Register process for cleanup tracking
  if (codexProcess.pid) {
    await registerProcess(jobId, codexProcess.pid);
    await emitLog(jobId, "system", `Codex process started (PID: ${codexProcess.pid})`, logState);
  } else {
    console.error(`[codex] Failed to spawn codex process - no PID`);
    await emitLog(jobId, "stderr", "Failed to spawn Codex process - no PID assigned", logState);
    return { success: false, error: "Failed to spawn Codex process" };
  }

  // Verify stdio streams
  if (!codexProcess.stdout || !codexProcess.stderr) {
    console.error(`[codex] Process spawned but stdio streams unavailable`);
    await emitLog(jobId, "stderr", "Codex process spawned but stdio streams are not available", logState);
  }

  // Close stdin - Codex CLI doesn't need interactive input in quiet mode
  if (codexProcess.stdin) {
    codexProcess.stdin.end();
  }

  // Set up timeout
  const timeoutId = setTimeout(async () => {
    await stopCodexRun(jobId, true);
    await emitLog(jobId, "stderr", `Codex run timed out after ${maxRuntimeMs / 1000}s`, logState);
    await updateJobStatus(jobId, "paused", "running", "Timed out - session saved", {
      pause_reason: "Execution timeout",
    });
  }, maxRuntimeMs);

  // Track the process
  const activeProcess: ActiveProcess = {
    process: codexProcess,
    jobId,
    sessionId,
    startTime: Date.now(),
    timeoutId,
    logState,
  };
  activeProcesses.set(jobId, activeProcess);

  let stdoutBuffer = "";
  let planAccumulator = "";
  let isAccumulatingPlan = false;

  // Handle stdout (JSONL output)
  codexProcess.stdout?.on("data", async (data: Buffer) => {
    stdoutBuffer += data.toString();

    // Process complete lines
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const parsed = parseCodexJsonlLine(line);

      // Detect phase changes
      const phaseInfo = detectPhase(parsed);
      if (phaseInfo) {
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
          .catch(() => {});
      }

      // If accumulating plan content, append all text
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
            await execute(conn, "UPDATE jobs SET codex_session_id = ?, updated_at = ? WHERE id = ?", [
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
            await stopCodexRun(jobId, true);
            await updateJobStatus(jobId, "ready_to_pr", "running", "Agent completed work", {
              codex_session_id: activeProcess.sessionId,
            });
          } else if (parsed.signal === "NEEDS_INFO" && parsed.question) {
            await emitLog(jobId, "system", `Agent needs info: ${parsed.question}`, logState);
            if (job.issue_number < 0) {
              await stopCodexRun(jobId, true);
              await updateJobStatus(jobId, "needs_info", "running", parsed.question, {
                codex_session_id: activeProcess.sessionId,
                needs_info_question: parsed.question,
              });
            } else {
              try {
                const commentBody = `${AGENT_COMMENT_MARKER}\n**Agent Question:**\n\n${parsed.question}`;
                const { id: commentId } = await createIssueCommentForRepo(repositoryId, job.issue_number, commentBody);
                await stopCodexRun(jobId, true);
                await updateJobStatus(jobId, "needs_info", "running", parsed.question, {
                  codex_session_id: activeProcess.sessionId,
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
  codexProcess.stderr?.on("data", async (data: Buffer) => {
    const content = data.toString();
    await emitLog(jobId, "stderr", content, logState);
  });

  // Handle process exit
  codexProcess.on("close", async (code, _signal) => {
    clearTimeout(timeoutId);
    const proc = activeProcesses.get(jobId);
    activeProcesses.delete(jobId);

    await unregisterProcess(jobId);

    // Process remaining buffer
    if (stdoutBuffer.trim()) {
      const parsed = parseCodexJsonlLine(stdoutBuffer);
      if (parsed.content) {
        if (isAccumulatingPlan) {
          planAccumulator += `\n${parsed.content}`;
        }
        await emitLog(jobId, "stdout", parsed.content, logState);
      }
    }

    // Check if job is still in running or planning state
    const currentJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
    if (!currentJob) return;

    // Handle accumulated plan content on process exit
    if (isAccumulatingPlan && planAccumulator.trim() && currentJob.status === "planning") {
      const planContent = planAccumulator.trim();
      await emitLog(jobId, "system", "Plan accumulation complete, transitioning to awaiting approval", logState);

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
        codex_session_id: proc?.sessionId,
      });
      return;
    }

    if (currentJob.status !== "running" && currentJob.status !== "planning") {
      return; // Already transitioned
    }

    if (code === 0) {
      await emitLog(jobId, "system", "Codex process exited successfully", logState);
    } else if (code !== null) {
      await emitLog(jobId, "stderr", `Codex process exited with code ${code}`, logState);
      await updateJobStatus(jobId, "failed", currentJob.status as JobStatus, `Codex exited with code ${code}`, {
        failure_reason: `Process exit code: ${code}`,
        codex_session_id: proc?.sessionId,
      });
    }
  });

  // Handle process error
  codexProcess.on("error", async (error) => {
    console.error(`[codex] Process error for job ${jobId}: ${error.message}`);
    clearTimeout(timeoutId);
    activeProcesses.delete(jobId);

    await unregisterProcess(jobId);

    await emitLog(jobId, "stderr", `Failed to spawn Codex: ${error.message}`, logState);
    const fromStatus = job.status as JobStatus;
    await updateJobStatus(jobId, "failed", fromStatus, `Spawn error: ${error.message}`, {
      failure_reason: error.message,
    });
  });

  return { success: true };
}

/**
 * Stop a running Codex process
 */
export async function stopCodexRun(jobId: string, saveSession = false): Promise<boolean> {
  const proc = activeProcesses.get(jobId);
  if (!proc) return false;

  // Clear timeout
  if (proc.timeoutId) {
    clearTimeout(proc.timeoutId);
  }

  // Save session ID if requested
  if (saveSession && proc.sessionId) {
    const conn = getConn();
    await execute(conn, "UPDATE jobs SET codex_session_id = ?, updated_at = ? WHERE id = ?", [
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
      unregisterProcess(jobId).catch(() => {});
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
 * Pause a Codex run (saves session for later resume)
 */
export async function pauseCodexRun(jobId: string): Promise<boolean> {
  const proc = activeProcesses.get(jobId);
  if (!proc) return false;

  await emitLog(jobId, "system", "Pausing Codex run...", proc.logState);
  await stopCodexRun(jobId, true);

  return true;
}

/**
 * Resume a paused Codex run
 */
export async function resumeCodexRun(
  jobId: string,
  injectedMessage?: string,
): Promise<{ success: boolean; error?: string }> {
  const conn = getConn();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (!job.codex_session_id) {
    return { success: false, error: "No session ID to resume from" };
  }

  // Check for pending injection and use it if no explicit message provided
  let message = injectedMessage;
  if (!message && job.pending_injection) {
    message = job.pending_injection;
    await execute(conn, "UPDATE jobs SET pending_injection = NULL, updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      jobId,
    ]);
  }

  const resumeMessage = message || "Continue from where you left off.";

  return startCodexRun(jobId, resumeMessage);
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
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (mode === "immediate") {
    // Kill current run and resume with the message
    if (activeProcesses.has(jobId)) {
      await pauseCodexRun(jobId);
    }

    // If job was running or paused with a session, resume with the injection
    if (job.codex_session_id && (job.status === "running" || job.status === "paused")) {
      if (job.status === "paused") {
        await updateJobStatus(jobId, "running", "paused", "Resuming with injected message");
      }
      return resumeCodexRun(jobId, message);
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
 * Check if a job has an active Codex run
 */
export function isRunning(jobId: string): boolean {
  return activeProcesses.has(jobId);
}

/**
 * Get count of active Codex runs
 */
export function getActiveRunCount(): number {
  return activeProcesses.size;
}
