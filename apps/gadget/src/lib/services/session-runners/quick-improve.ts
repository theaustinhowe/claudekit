import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCleanupFiles } from "@/lib/actions/settings";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";
import { runClaude } from "@/lib/services/claude-runner";
import { pushBranchAndCreatePR, runShell, sanitizeGitRef, shellEscape } from "@/lib/services/git-utils";
import { runProcess } from "@/lib/services/process-runner";
import type { QuickImprovePersona } from "@/lib/services/quick-improve-prompts";
import { PERSONA_CONFIGS } from "@/lib/services/quick-improve-prompts";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setCleanupFn, setSessionPid } from "@/lib/services/session-manager";
import type { SessionEvent } from "@/lib/types";
import { expandTilde } from "@/lib/utils";

export function createQuickImproveRunner(metadata: Record<string, unknown>): SessionRunner {
  const persona = metadata.persona as QuickImprovePersona;

  return async ({ onProgress, signal, sessionId }) => {
    const config = PERSONA_CONFIGS[persona];
    if (!config) throw new Error(`Invalid persona: ${persona}`);

    const repoId = metadata.repoId as string;
    const db = await getDb();
    const repo = await queryOne<{ local_path: string; name: string; git_remote: string | null }>(
      db,
      "SELECT local_path, name, git_remote FROM repos WHERE id = ?",
      [repoId],
    );

    if (!repo) throw new Error("Repo not found");
    if (!repo.git_remote) throw new Error("Repo has no git remote");

    const repoPath = expandTilde(repo.local_path);
    if (!fs.existsSync(repoPath)) throw new Error("Repo path does not exist on disk");

    const timestamp = Date.now();
    const branchName = `${config.branchPrefix}-${timestamp}`;
    let branchCreated = false;
    let branchPushed = false;
    const worktreeDir = path.join(os.tmpdir(), `gadget-worktree-${timestamp}`);
    let worktreeCreated = false;

    // Register cleanup function
    setCleanupFn(sessionId, async () => {
      if (worktreeCreated) {
        await runShell(`git worktree remove --force ${shellEscape(worktreeDir)}`, repoPath).catch(() => {});
      }
      if (fs.existsSync(worktreeDir)) {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
      if (branchCreated && !branchPushed) {
        await runShell(`git branch -D ${sanitizeGitRef(branchName)}`, repoPath).catch(() => {});
      }
    });

    // Step 1: Check gh CLI
    onProgress({ type: "log", log: "Setup", logType: "phase-separator" as "status" });
    onProgress({ type: "progress", progress: 2, phase: "Checking gh CLI..." });
    const ghCheck = await runShell("gh auth status", repoPath);
    if (ghCheck.exitCode !== 0) {
      throw new Error("GitHub CLI (gh) is not authenticated. Run `gh auth login` first.");
    }

    // Step 2: Save base branch
    onProgress({ type: "progress", progress: 5, phase: "Saving current branch..." });
    const branchResult = await runShell("git rev-parse --abbrev-ref HEAD", repoPath);
    if (branchResult.exitCode !== 0) {
      throw new Error("Failed to detect current branch");
    }
    const baseBranch = sanitizeGitRef(branchResult.stdout);

    // Step 3: Create worktree with new branch
    onProgress({ type: "progress", progress: 10, phase: `Creating branch ${branchName}...`, data: { branchName } });
    const safeBranch = sanitizeGitRef(branchName);
    const worktreeResult = await runShell(`git worktree add ${shellEscape(worktreeDir)} -b ${safeBranch}`, repoPath);
    if (worktreeResult.exitCode !== 0) {
      throw new Error(`Failed to create worktree: ${worktreeResult.stderr}`);
    }
    worktreeCreated = true;
    branchCreated = true;

    // Step 3b: Cleanup-specific pre-Claude steps (file deletion + knip) in worktree
    if (persona === "cleanup") {
      await runCleanupPreSteps({ worktreeDir, onProgress, signal });
    }

    // Step 4: Run Claude with persona prompt
    onProgress({ type: "log", log: `Analysis (${config.label})`, logType: "phase-separator" as "status" });
    const claudeStartProgress = persona === "cleanup" ? 30 : 15;
    onProgress({ type: "progress", progress: claudeStartProgress, phase: `Running ${config.label} analysis...` });

    const claudeResult = await runClaude({
      cwd: worktreeDir,
      prompt: config.buildPrompt(worktreeDir),
      allowedTools: config.allowedTools,
      disallowedTools: "Bash",
      timeoutMs: 15 * 60_000,
      signal,
      onPid: (pid) => setSessionPid(sessionId, pid),
      onProgress: (info) => {
        const progress = Math.min(claudeStartProgress + Math.floor((info.bytesReceived / 5000) * 50), 70);
        onProgress({
          type: "progress",
          progress,
          phase: `Running ${config.label} analysis...`,
          log: info.log,
          logType: info.logType,
        });
      },
    });

    const claudeOutput = claudeResult.stdout || "";

    // Step 5: Check for changes
    onProgress({ type: "progress", progress: 72, phase: "Checking for changes..." });
    const diffCheck = await runShell("git diff --stat", worktreeDir);
    const untrackedCheck = await runShell("git ls-files --others --exclude-standard", worktreeDir);
    const hasChanges = diffCheck.stdout.length > 0 || untrackedCheck.stdout.length > 0;

    if (!hasChanges) {
      // Clean up worktree and branch
      await runShell(`git worktree remove --force ${shellEscape(worktreeDir)}`, repoPath);
      worktreeCreated = false;
      await runShell(`git branch -D ${safeBranch}`, repoPath);
      branchCreated = false;
      onProgress({ type: "progress", progress: 100, phase: "No improvements identified — no changes were made" });
      return { result: { noChanges: true } };
    }

    // Step 6: Commit changes — skip hooks since this is an automated worktree pipeline (CI will validate)
    onProgress({ type: "log", log: "Commit & PR", logType: "phase-separator" as "status" });
    onProgress({ type: "progress", progress: 75, phase: "Committing changes..." });
    const commitResult = await runShell(
      `git add -A && git commit --no-verify -m ${shellEscape(config.commitMessage)}`,
      worktreeDir,
    );
    if (commitResult.exitCode !== 0) {
      throw new Error(`Git commit failed: ${commitResult.stderr}`);
    }

    // Step 6b: Get diff stats for summary
    const diffStatResult = await runShell("git diff --stat HEAD~1", worktreeDir);
    const diffStatText = diffStatResult.stdout.trim();
    // Parse summary line like "3 files changed, 45 insertions(+), 12 deletions(-)"
    const diffSummaryMatch = diffStatText.match(
      /(\d+) files? changed(?:, (\d+) insertions?.*)?(?:, (\d+) deletions?.*)?/,
    );
    const diffSummary = {
      filesChanged: diffSummaryMatch ? Number.parseInt(diffSummaryMatch[1], 10) : 0,
      insertions: diffSummaryMatch?.[2] ? Number.parseInt(diffSummaryMatch[2], 10) : 0,
      deletions: diffSummaryMatch?.[3] ? Number.parseInt(diffSummaryMatch[3], 10) : 0,
      text: diffStatText,
    };
    if (diffStatText) {
      onProgress({
        type: "progress",
        progress: 78,
        phase: `${diffSummary.filesChanged} files changed, +${diffSummary.insertions} -${diffSummary.deletions}`,
        log: diffStatText,
        logType: "status",
        data: { diffSummary },
      });
    }

    // Step 7: Push branch and create PR
    onProgress({ type: "progress", progress: 80, phase: "Pushing branch and creating PR..." });
    const { prUrl } = await pushBranchAndCreatePR({
      cwd: worktreeDir,
      branch: branchName,
      baseBranch,
      title: config.prTitle(repo.name),
      body: config.prBody(repo.name, claudeOutput),
    });
    branchPushed = true;
    onProgress({ type: "progress", progress: 100, phase: "Pull request created" });

    // Cleanup worktree
    if (worktreeCreated) {
      await runShell(`git worktree remove --force ${shellEscape(worktreeDir)}`, repoPath).catch(() => {});
      worktreeCreated = false;
    }
    if (fs.existsSync(worktreeDir)) {
      fs.rmSync(worktreeDir, { recursive: true, force: true });
    }

    return { result: { prUrl, branchName, diffSummary } };
  };
}

/** Pre-Claude cleanup steps: delete invalid files and run knip --fix inside the worktree */
async function runCleanupPreSteps({
  worktreeDir,
  onProgress,
  signal,
}: {
  worktreeDir: string;
  onProgress: (event: SessionEvent) => void;
  signal: AbortSignal;
}) {
  // Delete invalid config files
  onProgress({ type: "log", log: "File Cleanup", logType: "phase-separator" as "status" });
  onProgress({ type: "progress", progress: 12, phase: "Removing invalid files..." });
  const cleanupFiles = await getCleanupFiles();
  let removedCount = 0;
  for (const file of cleanupFiles) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const filePath = path.join(worktreeDir, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removedCount++;
        onProgress({
          type: "progress",
          progress: 12 + Math.round((removedCount / cleanupFiles.length) * 5),
          phase: `Removed ${file}`,
        });
      }
    } catch {
      onProgress({ type: "log", log: `Failed to remove ${file}`, logType: "status" });
    }
  }
  onProgress({
    type: "progress",
    progress: 18,
    phase: removedCount > 0 ? `Removed ${removedCount} file${removedCount !== 1 ? "s" : ""}` : "No invalid files found",
  });

  // Run knip --fix
  onProgress({ type: "progress", progress: 19, phase: "Running knip --fix..." });
  try {
    const knipResult = await runProcess({
      command: "npx knip --fix --no-progress",
      cwd: worktreeDir,
      signal,
      onStdout: (data) => {
        onProgress({ type: "log", log: data, logType: "status" });
      },
      onStderr: (data) => {
        onProgress({ type: "log", log: data, logType: "status" });
      },
    });
    if (knipResult.exitCode === 0 || knipResult.exitCode === 1) {
      onProgress({ type: "progress", progress: 28, phase: "knip --fix complete" });
    } else {
      onProgress({ type: "progress", progress: 28, phase: `knip exited with code ${knipResult.exitCode}` });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    onProgress({
      type: "log",
      log: `knip failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      logType: "status",
    });
    onProgress({ type: "progress", progress: 28, phase: "knip failed (continuing)" });
  }
}
