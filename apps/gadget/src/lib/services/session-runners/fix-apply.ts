import { getDb, queryOne } from "@/lib/db";
import { applyFixes } from "@/lib/services/apply-engine";
import type { SessionRunner } from "@/lib/services/session-manager";
import type { Repo } from "@/lib/types";

export function createFixApplyRunner(metadata: Record<string, unknown>): SessionRunner {
  const fixActionIds = metadata.fixActionIds as string[];
  const repoId = metadata.repoId as string;

  return async ({ onProgress, signal }) => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const db = await getDb();
    const repo = await queryOne<Repo>(db, "SELECT * FROM repos WHERE id = ?", [repoId]);
    if (!repo) throw new Error("Repo not found");

    onProgress({ type: "progress", progress: 10, phase: "Applying fixes..." });

    const result = await applyFixes({
      repoId,
      repoPath: repo.local_path,
      fixActionIds,
      onProgress: (message) => {
        onProgress({ type: "progress", message });
      },
      onFixStatus: (fixId, status, message, title) => {
        onProgress({
          type: "progress",
          message,
          data: { fixId, status, title },
        });
      },
    });

    if (result.success) {
      onProgress({ type: "progress", progress: 100, phase: "Fixes applied" });
      return {
        result: {
          runId: result.runId,
          snapshotId: result.snapshotId,
          appliedCount: result.appliedCount ?? 0,
          totalCount: result.totalCount ?? 0,
        },
      };
    }
    throw new Error(result.error || "Apply failed");
  };
}
