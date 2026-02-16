import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import type { FixAction } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

interface ApplyOptions {
  repoId: string;
  repoPath: string;
  scanId?: string;
  fixActionIds: string[];
  onProgress?: (message: string) => void;
  onFixStatus?: (
    fixId: string,
    status: "running" | "done" | "error" | "skipped",
    message: string,
    title: string,
  ) => void;
}

interface SnapshotResult {
  snapshotId: string;
  snapshotPath: string;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSnapshotsDir(): string {
  const dir = path.join(os.homedir(), ".gadget", "snapshots");
  ensureDir(dir);
  return dir;
}

async function createSnapshot(
  repoPath: string,
  repoId: string,
  scanId: string | undefined,
  filePaths: string[],
): Promise<SnapshotResult> {
  const db = await getDb();
  const snapshotId = generateId();
  const snapshotsDir = getSnapshotsDir();
  const snapshotPath = path.join(snapshotsDir, snapshotId);

  ensureDir(snapshotPath);

  const files: Array<{ path: string; exists: boolean }> = [];

  for (const filePath of filePaths) {
    const fullPath = path.join(repoPath, filePath);
    const snapshotFilePath = path.join(snapshotPath, filePath);

    if (fs.existsSync(fullPath)) {
      ensureDir(path.dirname(snapshotFilePath));
      fs.copyFileSync(fullPath, snapshotFilePath);
      files.push({ path: filePath, exists: true });
    } else {
      files.push({ path: filePath, exists: false });
    }
  }

  // Store snapshot record
  await execute(
    db,
    `
    INSERT INTO snapshots (id, repo_id, scan_id, files, snapshot_path)
    VALUES (?, ?, ?, ?, ?)
  `,
    [snapshotId, repoId, scanId || null, JSON.stringify(files), snapshotPath],
  );

  return { snapshotId, snapshotPath };
}

export async function restoreSnapshot(snapshotId: string, repoPath: string): Promise<boolean> {
  const db = await getDb();
  const snapshot = await queryOne<{
    id: string;
    repo_id: string;
    scan_id: string | null;
    files: string;
    snapshot_path: string;
    created_at: string;
  }>(db, "SELECT * FROM snapshots WHERE id = ?", [snapshotId]);

  if (!snapshot) return false;

  const files = JSON.parse(snapshot.files);

  for (const file of files) {
    const repoFilePath = path.join(repoPath, file.path);
    const snapshotFilePath = path.join(snapshot.snapshot_path, file.path);

    if (file.exists && fs.existsSync(snapshotFilePath)) {
      ensureDir(path.dirname(repoFilePath));
      fs.copyFileSync(snapshotFilePath, repoFilePath);
    } else if (!file.exists && fs.existsSync(repoFilePath)) {
      fs.unlinkSync(repoFilePath);
    }
  }

  return true;
}

function applyOneAction(
  action: FixAction,
  repoPath: string,
): { status: "applied" | "skipped" | "error"; message: string } {
  if (!action.diff_file || action.diff_after === null) {
    return { status: "skipped", message: `No diff content for ${action.title}` };
  }

  const targetPath = path.join(repoPath, action.diff_file);
  const tempPath = `${targetPath}.tmp`;
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(tempPath, action.diff_after, "utf-8");
  fs.renameSync(tempPath, targetPath);

  return { status: "applied", message: `Applied: ${action.title}` };
}

async function applyFileGroup(
  _file: string,
  actions: FixAction[],
  repoPath: string,
  onFixStatus: ApplyOptions["onFixStatus"],
): Promise<Array<{ actionId: string; status: "applied" | "skipped" | "error"; message: string }>> {
  const results: Array<{ actionId: string; status: "applied" | "skipped" | "error"; message: string }> = [];

  for (const action of actions) {
    onFixStatus?.(action.id, "running", `Applying: ${action.title}`, action.title);

    try {
      const result = applyOneAction(action, repoPath);
      onFixStatus?.(action.id, result.status === "applied" ? "done" : "skipped", result.message, action.title);
      results.push({ actionId: action.id, ...result });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const message = `Failed: ${action.title} — ${errMsg}`;
      onFixStatus?.(action.id, "error", message, action.title);
      results.push({ actionId: action.id, status: "error", message });
    }
  }

  return results;
}

export async function applyFixes(options: ApplyOptions) {
  const { repoId, repoPath, scanId, fixActionIds, onProgress, onFixStatus } = options;

  const db = await getDb();

  // Get fix actions
  const placeholders = fixActionIds.map(() => "?").join(",");
  const fixActions = await queryAll<FixAction>(
    db,
    `SELECT * FROM fix_actions WHERE id IN (${placeholders})`,
    fixActionIds,
  );

  if (fixActions.length === 0) {
    onProgress?.("[WARN] No fix actions found");
    return { success: false, error: "No fix actions found" };
  }

  const actionsToApply = fixActions;

  // Create apply run record
  const runId = generateId();
  await execute(
    db,
    `
    INSERT INTO apply_runs (id, repo_id, scan_id, status, actions_applied)
    VALUES (?, ?, ?, 'running', '[]')
  `,
    [runId, repoId, scanId || null],
  );

  // Collect affected files for snapshot
  const affectedFiles = actionsToApply.map((a) => a.diff_file).filter((f): f is string => f != null);

  // Create snapshot
  const snapshot = await createSnapshot(repoPath, repoId, scanId, affectedFiles);
  await execute(db, "UPDATE apply_runs SET snapshot_id = ? WHERE id = ?", [snapshot.snapshotId, runId]);
  onProgress?.(`[INFO] Created snapshot ${snapshot.snapshotId}`);

  // Group actions by target file for parallel execution
  const fileGroups = new Map<string, FixAction[]>();
  for (const action of actionsToApply) {
    const file = action.diff_file || "__no_file__";
    const group = fileGroups.get(file);
    if (group) {
      group.push(action);
    } else {
      fileGroups.set(file, [action]);
    }
  }

  // Warn when multiple fixes target the same file
  for (const [file, actions] of fileGroups) {
    if (actions.length > 1 && file !== "__no_file__") {
      onProgress?.(`[WARN] ${actions.length} fixes target ${file} — applying sequentially within file`);
    }
  }

  // Run file groups in parallel, actions within each group sequentially
  const groupResults = await Promise.allSettled(
    Array.from(fileGroups.entries()).map(([file, actions]) => applyFileGroup(file, actions, repoPath, onFixStatus)),
  );

  // Collect all results
  const appliedIds: string[] = [];
  const log: Array<{ action: string; status: string; message: string }> = [];

  for (const result of groupResults) {
    if (result.status === "fulfilled") {
      for (const r of result.value) {
        log.push({ action: r.actionId, status: r.status, message: r.message });
        if (r.status === "applied") {
          appliedIds.push(r.actionId);
        }
        if (r.status === "applied") {
          onProgress?.(`[SUCCESS] ${r.message}`);
        } else if (r.status === "error") {
          onProgress?.(`[ERROR] ${r.message}`);
        }
      }
    }
  }

  // Determine final status based on results
  const hasErrors = log.some((l) => l.status === "error");
  const allErrors = appliedIds.length === 0 && actionsToApply.length > 0;
  const finalStatus = allErrors ? "error" : hasErrors ? "partial" : "done";

  // Update apply run
  await execute(
    db,
    `
    UPDATE apply_runs
    SET status = ?,
        actions_applied = ?,
        log = ?,
        completed_at = ?
    WHERE id = ?
  `,
    [finalStatus, JSON.stringify(appliedIds), JSON.stringify(log), nowTimestamp(), runId],
  );

  onProgress?.(`[INFO] Applied ${appliedIds.length} of ${actionsToApply.length} fixes`);

  // Git commit the fixes
  if (appliedIds.length > 0) {
    onProgress?.("[INFO] Committing fixes...");
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
      } catch (err) {
        onProgress?.(`[WARN] Git commit failed: ${(err as Error).message}`);
        resolve();
        return;
      }

      child.on("close", (code) => {
        if (code === 0) {
          onProgress?.("[INFO] Changes committed to git");
        } else {
          onProgress?.("[INFO] No changes to commit");
        }
        resolve();
      });

      child.on("error", (err) => {
        onProgress?.(`[WARN] Git commit failed: ${err.message}`);
        resolve();
      });
    });
  }

  return {
    success: true,
    runId,
    snapshotId: snapshot.snapshotId,
    appliedCount: appliedIds.length,
    totalCount: actionsToApply.length,
    log,
  };
}
