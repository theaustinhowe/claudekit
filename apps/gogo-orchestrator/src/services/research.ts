import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execute, queryAll, queryOne } from "@devkit/duckdb";
import type { ResearchCategory } from "@devkit/gogo-shared";
import { getConn } from "../db/index.js";
import type { DbRepository, DbResearchSession, DbResearchSuggestion } from "../db/schema.js";
import { mapResearchSuggestion } from "../db/schema.js";
import { logger } from "../utils/logger.js";
import { broadcast } from "../ws/handler.js";
import { ensureBaseClone, getBareRepoPath, getRepoDir, removeWorktree } from "./git.js";
import { toGitConfigFromRepo } from "./settings-helper.js";

const log = logger.child({ service: "research" });

// Track active research process so we can cancel it
let activeProcess: ChildProcess | null = null;
let activeSessionId: string | null = null;

/**
 * Start a new research session.
 * Spawns Claude CLI with stream-json output and parses suggestions in real-time.
 * Only one session can run at a time.
 */
export async function startResearchSession(
  repositoryId: string,
  focusAreas: ResearchCategory[],
): Promise<DbResearchSession> {
  const conn = getConn();

  // Check no other session is running
  const running = await queryOne<DbResearchSession>(
    conn,
    "SELECT * FROM research_sessions WHERE status = 'running' LIMIT 1",
  );
  if (running) {
    throw new Error("A research session is already running. Cancel it first.");
  }

  // Get repository workdir
  const repo = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);
  if (!repo) {
    throw new Error("Repository not found");
  }

  // Build git config and ensure the bare clone exists
  const gitConfig = toGitConfigFromRepo({
    owner: repo.owner,
    name: repo.name,
    githubToken: repo.github_token,
    workdirPath: repo.workdir_path,
    baseBranch: repo.base_branch,
  });
  await ensureBaseClone(gitConfig);

  // Create a temporary worktree for the research session so Claude has files to read
  const bareRepoPath = getBareRepoPath(gitConfig);
  const repoDir = getRepoDir(gitConfig);
  const worktreeName = `research-${randomUUID().slice(0, 8)}`;
  const worktreePath = resolve(join(repoDir, "research", worktreeName));
  mkdirSync(join(repoDir, "research"), { recursive: true });

  const execFileAsync = promisify(execFile);
  const baseBranch = gitConfig.baseBranch || "main";
  await execFileAsync("git", ["-C", bareRepoPath, "worktree", "add", worktreePath, baseBranch, "--detach"]);

  // Generate session ID upfront
  const claudeSessionId = randomUUID();

  // Create session record
  await execute(
    conn,
    `INSERT INTO research_sessions (repository_id, status, focus_areas, claude_session_id)
     VALUES (?, 'running', ?, ?)`,
    [repositoryId, JSON.stringify(focusAreas), claudeSessionId],
  );

  const session = await queryOne<DbResearchSession>(
    conn,
    "SELECT * FROM research_sessions WHERE repository_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1",
    [repositoryId],
  );
  if (!session) {
    throw new Error("Failed to create research session");
  }

  // Build the research prompt
  const prompt = buildResearchPrompt(focusAreas);

  // Spawn Claude CLI with streaming JSON output
  const args = [
    "--output-format",
    "stream-json",
    "--session-id",
    claudeSessionId,
    "--max-turns",
    "10",
    "--verbose",
    "--dangerously-skip-permissions",
    "-p",
    prompt,
  ];

  log.info(
    {
      sessionId: session.id,
      repositoryId,
      focusAreas,
      claudeSessionId,
      worktreePath,
    },
    "Starting research session",
  );

  const claudeProcess = spawn("claude", args, {
    cwd: worktreePath,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  activeProcess = claudeProcess;
  activeSessionId = session.id;

  // Debug log file
  const logDir = join(process.cwd(), "data");
  mkdirSync(logDir, { recursive: true });
  const debugLogPath = join(logDir, `research-${session.id}.log`);
  writeFileSync(
    debugLogPath,
    `=== Research session ${session.id} started at ${new Date().toISOString()} ===\ncwd: ${worktreePath}\nargs: ${JSON.stringify(args)}\n`,
  );
  const appendLog = (label: string, content: string) => {
    try {
      appendFileSync(debugLogPath, `[${label}] ${content}\n`);
    } catch {}
  };

  // Close stdin — not needed for -p mode
  if (claudeProcess.stdin) {
    claudeProcess.stdin.end();
  }

  // Store PID
  await execute(conn, "UPDATE research_sessions SET process_pid = ?, updated_at = ? WHERE id = ?", [
    claudeProcess.pid ?? null,
    new Date().toISOString(),
    session.id,
  ]);

  // Broadcast session start
  broadcast({
    type: "research:updated",
    payload: { sessionId: session.id, status: "running" },
  });

  // Accumulate text from streaming deltas to detect suggestions in real-time
  let textAccumulator = "";
  let stdoutBuffer = "";

  claudeProcess.stdout?.on("data", async (data: Buffer) => {
    const raw = data.toString();
    appendLog("RAW", raw.slice(0, 500));
    stdoutBuffer += raw;

    // Process complete lines (stream-json is newline-delimited)
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      appendLog("LINE", line.slice(0, 500));

      const text = extractText(line);
      if (text) {
        textAccumulator += text;
        appendLog("TEXT", text.slice(0, 300));

        // Stream text output to connected clients
        broadcast({
          type: "research:output",
          payload: { sessionId: session.id, text },
        });

        // Try to extract any complete suggestions from the accumulated text
        const extracted = extractCompleteSuggestions(textAccumulator);
        if (extracted.suggestions.length > 0) {
          textAccumulator = extracted.remaining;

          for (const suggestion of extracted.suggestions) {
            await storeSuggestion(session.id, suggestion);
          }
        }
      }
    }
  });

  claudeProcess.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString();
    appendLog("STDERR", msg);
    log.warn({ sessionId: session.id }, `Research stderr: ${msg}`);
  });

  // Handle spawn errors (e.g. claude CLI not found on PATH)
  claudeProcess.on("error", async (err) => {
    activeProcess = null;
    activeSessionId = null;

    // Clean up the research worktree
    try {
      await removeWorktree(gitConfig, worktreePath);
    } catch {}

    log.error({ sessionId: session.id, error: err.message }, "Research process spawn error");

    const conn = getConn();
    await execute(conn, "UPDATE research_sessions SET status = 'failed', updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      session.id,
    ]);

    broadcast({
      type: "research:updated",
      payload: { sessionId: session.id, status: "failed" },
    });
  });

  claudeProcess.on("close", async (code) => {
    appendLog("CLOSE", `exitCode=${code} accumulatorLen=${textAccumulator.length}`);
    activeProcess = null;
    activeSessionId = null;

    // Clean up the research worktree
    try {
      await removeWorktree(gitConfig, worktreePath);
    } catch (err) {
      log.warn({ worktreePath, error: String(err) }, "Failed to clean up research worktree");
    }

    log.info({ sessionId: session.id, exitCode: code }, "Research process closed");

    try {
      const conn = getConn();

      // Process any remaining buffered output
      if (stdoutBuffer.trim()) {
        const text = extractText(stdoutBuffer);
        if (text) {
          textAccumulator += text;
        }
      }

      // Extract any remaining suggestions from the final accumulated text
      const extracted = extractCompleteSuggestions(textAccumulator);
      for (const suggestion of extracted.suggestions) {
        await storeSuggestion(session.id, suggestion);
      }

      const status = code === 0 || code === null ? "completed" : "failed";

      await execute(conn, "UPDATE research_sessions SET status = ?, output = ?, updated_at = ? WHERE id = ?", [
        status,
        textAccumulator || null,
        new Date().toISOString(),
        session.id,
      ]);

      if (status === "completed") {
        log.info({ sessionId: session.id }, "Research session completed");
      } else {
        log.error({ sessionId: session.id, exitCode: code }, "Research session failed");
      }

      broadcast({
        type: "research:updated",
        payload: { sessionId: session.id, status },
      });
    } catch (err) {
      log.error({ sessionId: session.id, error: String(err) }, "Error in research close handler");

      try {
        const conn = getConn();
        await execute(conn, "UPDATE research_sessions SET status = 'failed', updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          session.id,
        ]);
        broadcast({
          type: "research:updated",
          payload: { sessionId: session.id, status: "failed" },
        });
      } catch {
        // Last resort — nothing more we can do
      }
    }
  });

  return session;
}

/**
 * Cancel a running research session.
 */
export async function cancelResearchSession(sessionId: string): Promise<void> {
  const conn = getConn();

  const session = await queryOne<DbResearchSession>(conn, "SELECT * FROM research_sessions WHERE id = ?", [sessionId]);
  if (!session) {
    throw new Error("Session not found");
  }
  if (session.status !== "running") {
    throw new Error("Session is not running");
  }

  // Kill the tracked process first, fall back to PID
  if (activeProcess && activeSessionId === sessionId) {
    activeProcess.kill("SIGTERM");
    activeProcess = null;
    activeSessionId = null;
  } else if (session.process_pid) {
    try {
      process.kill(session.process_pid, "SIGTERM");
    } catch {
      // Process may have already exited
    }
  }

  await execute(conn, "UPDATE research_sessions SET status = 'cancelled', updated_at = ? WHERE id = ?", [
    new Date().toISOString(),
    sessionId,
  ]);

  broadcast({
    type: "research:updated",
    payload: { sessionId, status: "cancelled" },
  });

  log.info({ sessionId }, "Research session cancelled");
}

/**
 * Get all suggestions for a session.
 */
export async function getSessionSuggestions(sessionId: string) {
  const conn = getConn();
  const rows = await queryAll<DbResearchSuggestion>(
    conn,
    "SELECT * FROM research_suggestions WHERE session_id = ? ORDER BY created_at ASC",
    [sessionId],
  );
  return rows.map(mapResearchSuggestion);
}

// ---------------------------------------------------------------------------
// Stream-JSON parsing
// ---------------------------------------------------------------------------

/**
 * Extract text content from a stream-json line.
 * Handles content_block_delta, message/assistant content blocks, and plain text fallback.
 */
function extractText(line: string): string | null {
  try {
    const msg = JSON.parse(line);

    // Streaming delta (most common during generation)
    if (msg.type === "content_block_delta" && msg.delta?.text) {
      return msg.delta.text;
    }

    // Full message content blocks
    if ((msg.type === "message" || msg.type === "assistant") && msg.message?.content) {
      const texts: string[] = [];
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          texts.push(block.text);
        }
      }
      return texts.length > 0 ? texts.join("\n") : null;
    }

    return null;
  } catch {
    // Not JSON — treat as plain text
    const trimmed = line.trim();
    return trimmed || null;
  }
}

// ---------------------------------------------------------------------------
// Suggestion extraction
// ---------------------------------------------------------------------------

interface ParsedSuggestion {
  category: string;
  severity: string;
  title: string;
  description: string;
  filePaths: string[] | null;
}

const VALID_CATEGORIES = [
  "ui",
  "ux",
  "security",
  "durability",
  "performance",
  "testing",
  "accessibility",
  "documentation",
];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];

/**
 * Extract all complete SUGGESTION_START...SUGGESTION_END blocks from text.
 * Returns the parsed suggestions and any remaining text after the last complete block.
 */
function extractCompleteSuggestions(text: string): {
  suggestions: ParsedSuggestion[];
  remaining: string;
} {
  const suggestions: ParsedSuggestion[] = [];
  const regex = /SUGGESTION_START\s*\n([\s\S]*?)SUGGESTION_END/g;

  let lastEnd = 0;
  let match = regex.exec(text);
  while (match !== null) {
    const parsed = parseSuggestionBlock(match[1]);
    if (parsed) {
      suggestions.push(parsed);
    }
    lastEnd = match.index + match[0].length;
    match = regex.exec(text);
  }

  // Keep everything after the last complete suggestion (may contain a partial one)
  // Also keep text before the first SUGGESTION_START if no suggestions were found
  const remaining =
    lastEnd > 0
      ? text.slice(lastEnd)
      : text.includes("SUGGESTION_START")
        ? text
        : // No SUGGESTION_START at all yet — keep trailing text that could become one
          text.slice(Math.max(0, text.length - 200));

  return { suggestions, remaining };
}

function parseSuggestionBlock(block: string): ParsedSuggestion | null {
  const fields: Record<string, string> = {};

  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) {
      if (key === "description" && fields.description) {
        fields.description += ` ${value}`;
      } else {
        fields[key] = value;
      }
    }
  }

  if (!fields.category || !fields.title || !fields.description) {
    return null;
  }

  return {
    category: VALID_CATEGORIES.includes(fields.category) ? fields.category : "documentation",
    severity: VALID_SEVERITIES.includes(fields.severity ?? "") ? (fields.severity as string) : "medium",
    title: fields.title,
    description: fields.description,
    filePaths: fields.files
      ? fields.files
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean)
      : null,
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function storeSuggestion(sessionId: string, suggestion: ParsedSuggestion): Promise<void> {
  const conn = getConn();

  await execute(
    conn,
    `INSERT INTO research_suggestions (session_id, category, severity, title, description, file_paths)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      suggestion.category,
      suggestion.severity,
      suggestion.title,
      suggestion.description,
      suggestion.filePaths ? JSON.stringify(suggestion.filePaths) : null,
    ],
  );

  broadcast({
    type: "research:suggestion",
    payload: { sessionId, suggestion },
  });

  log.info({ sessionId, title: suggestion.title, category: suggestion.category }, "Research suggestion found");
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildResearchPrompt(focusAreas: ResearchCategory[]): string {
  const areaDescriptions: Record<ResearchCategory, string> = {
    ui: "UI: Visual improvements, component design, responsive issues, layout problems",
    ux: "UX: User flow, interaction patterns, navigation, feedback mechanisms",
    security: "Security: Vulnerabilities, input validation, auth issues, data exposure",
    durability: "Durability: Error handling, edge cases, data integrity, graceful degradation",
    performance: "Performance: Bottlenecks, unnecessary re-renders, query optimization, bundle size",
    testing: "Testing: Missing test coverage, test quality, edge case testing",
    accessibility: "Accessibility: WCAG compliance, screen reader support, keyboard navigation",
    documentation: "Documentation: Missing or outdated docs, code comments, API documentation",
  };

  const selectedDescriptions = focusAreas.map((area) => areaDescriptions[area]).join("\n- ");

  return `Analyze this codebase and suggest improvements. Focus on these areas:

- ${selectedDescriptions}

For each finding, output a structured suggestion using this EXACT format (one per finding):

SUGGESTION_START
category: <one of: ui, ux, security, durability, performance, testing, accessibility, documentation>
severity: <one of: low, medium, high, critical>
title: <concise title describing the issue or improvement>
description: <detailed description with rationale and suggested fix>
files: <comma-separated file paths relevant to this suggestion>
SUGGESTION_END

Be thorough but precise. Only report real issues, not style preferences. Focus on actionable improvements.`;
}
