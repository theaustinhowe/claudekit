import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import { runClaude } from "@claudekit/claude-runner";
import { getDb, queryAll, queryOne } from "@/lib/db";
import { createServiceLogger } from "@/lib/logger";
import { classifyFinding } from "@/lib/services/finding-classifier";
import { buildFindingsFixPrompt } from "@/lib/services/finding-prompt-builder";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";
import type { Finding } from "@/lib/types";
import { expandTilde, parsePolicy } from "@/lib/utils";

const MAX_BATCH_SIZE = 5;

export function createFindingFixRunner(metadata: Record<string, unknown>): SessionRunner {
  const findingIds = metadata.findingIds as string[];
  const repoId = metadata.repoId as string;

  return async ({ onProgress, signal, sessionId }) => {
    const db = await getDb();
    const repo = await queryOne<{ local_path: string; name: string }>(
      db,
      "SELECT local_path, name FROM repos WHERE id = ?",
      [repoId],
    );

    if (!repo) throw new Error("Repository not found");
    const repoPath = expandTilde(repo.local_path);
    if (!fs.existsSync(repoPath)) throw new Error("Repository path does not exist on disk");

    // Load findings
    const placeholders = findingIds.map(() => "?").join(", ");
    const findings = await queryAll<Record<string, unknown>>(
      db,
      `SELECT * FROM findings WHERE id IN (${placeholders}) AND repo_id = ?`,
      [...findingIds, repoId],
    );

    const parsedFindings: Finding[] = findings.map((row) => ({
      ...row,
      suggested_actions: JSON.parse((row.suggested_actions as string) || "[]"),
    })) as Finding[];

    const fixable = parsedFindings.filter((f) => classifyFinding(f).autoFixable);
    if (fixable.length === 0) throw new Error("No auto-fixable findings in selection");

    // Group by batchKey
    const batches = new Map<string, Finding[]>();
    for (const f of fixable) {
      const { batchKey } = classifyFinding(f);
      const group = batches.get(batchKey) || [];
      group.push(f);
      batches.set(batchKey, group);
    }

    // Split large groups
    const batchList: { key: string; findings: Finding[] }[] = [];
    for (const [key, group] of batches) {
      for (let i = 0; i < group.length; i += MAX_BATCH_SIZE) {
        batchList.push({ key, findings: group.slice(i, i + MAX_BATCH_SIZE) });
      }
    }

    for (let i = 0; i < batchList.length; i++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const batch = batchList[i];
      const batchProgress = Math.floor((i / batchList.length) * 70) + 10;

      onProgress({
        type: "progress",
        progress: batchProgress,
        phase: `Batch ${i + 1}/${batchList.length}: ${batch.key}`,
        message: `Batch ${i + 1}/${batchList.length}: ${batch.key} (${batch.findings.length} issues)`,
        data: { batchIndex: i, batchTotal: batchList.length, batchKey: batch.key },
      });

      const prompt = buildFindingsFixPrompt(batch.findings, repoPath);

      const { exitCode, stderr } = await runClaude({
        cwd: repoPath,
        prompt,
        allowedTools: "Write,Read,Glob,Grep",
        disallowedTools: "Bash,Edit",
        signal,
        onPid: (pid) => setSessionPid(sessionId, pid),
        onProgress: ({ message, log, logType }) => {
          onProgress({
            type: "progress",
            message,
            log,
            logType,
            data: { batchIndex: i },
          });
        },
      });

      if (exitCode !== 0) {
        const errMsg = stderr || `Claude exited with code ${exitCode}`;
        onProgress({
          type: "log",
          log: `Batch ${i + 1} failed: ${errMsg.slice(0, 300)}`,
          logType: "status",
        });
      }
    }

    // Re-run audit
    onProgress({ type: "progress", progress: 85, phase: "Re-scanning to verify fixes..." });
    try {
      const latestScan = await queryOne<{ id: string; policy_id: string | null }>(
        db,
        "SELECT DISTINCT s.id, s.policy_id FROM scans s JOIN findings f ON s.id = f.scan_id WHERE f.repo_id = ? ORDER BY s.created_at DESC LIMIT 1",
        [repoId],
      );

      if (latestScan?.policy_id) {
        const { runAudit } = await import("@/lib/services/auditors/index");
        const policyRow = await queryOne<Record<string, unknown>>(db, "SELECT * FROM policies WHERE id = ?", [
          latestScan.policy_id,
        ]);
        if (policyRow) {
          const policy = parsePolicy(policyRow);
          await runAudit({
            repoId,
            repoPath,
            scanId: latestScan.id,
            policy,
          });
        }
      }
    } catch (err) {
      createServiceLogger("findings-fix").error({ err }, "Failed to re-audit");
    }

    // Git commit
    onProgress({ type: "progress", progress: 92, phase: "Committing fixes..." });
    await new Promise<void>((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(
          "bash",
          ["-l", "-c", 'git add -A && git diff --cached --quiet || git commit -m "Findings fixed by Gadget App"'],
          {
            cwd: repoPath,
            env: { ...process.env, FORCE_COLOR: "0" },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
      } catch {
        resolve();
        return;
      }

      child.on("close", (code) => {
        onProgress({
          type: "log",
          log: code === 0 ? "Changes committed to git" : "No changes to commit",
          logType: "status",
        });
        resolve();
      });

      child.on("error", () => {
        resolve();
      });
    });

    onProgress({ type: "progress", progress: 100, phase: "All batches complete" });
    return { result: { batchCount: batchList.length, fixableCount: fixable.length } };
  };
}
