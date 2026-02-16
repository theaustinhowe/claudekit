"use server";

import { execute, getDb, parseJsonField, queryAll, queryOne, withTransaction } from "@/lib/db";
import { scanAIFiles } from "@/lib/services/auditors/ai-files";
import type { AIFile, Finding } from "@/lib/types";
import { expandTilde, generateId } from "@/lib/utils";

function parseFinding(row: Record<string, unknown>): Finding {
  return {
    ...row,
    suggested_actions: parseJsonField(row.suggested_actions, []),
  } as unknown as Finding;
}

export async function getFindingsForRepo(repoId: string): Promise<Finding[]> {
  const db = await getDb();
  const rows = await queryAll<Record<string, unknown>>(
    db,
    "SELECT * FROM findings WHERE repo_id = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC",
    [repoId],
  );
  return rows.map((r) => parseFinding(r));
}

export async function refreshAIFileFindings(repoId: string): Promise<void> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
  if (!repo) return;

  const repoPath = expandTilde(repo.local_path);
  const fs = await import("node:fs");
  if (!fs.existsSync(repoPath)) return;

  // Re-audit AI files against the current filesystem
  const { auditAIFiles } = await import("@/lib/services/auditors/ai-files");
  const freshFindings = auditAIFiles(repoPath);

  // Find the most recent scan for this repo to associate findings with
  const latestScan = await queryOne<{ id: string }>(
    db,
    "SELECT scan_id as id FROM findings WHERE repo_id = ? AND scan_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [repoId],
  );
  const scanId = latestScan?.id ?? null;

  await withTransaction(db, async () => {
    // Remove stale ai-files findings for this repo
    await execute(db, "DELETE FROM findings WHERE repo_id = ? AND category = 'ai-files'", [repoId]);

    // Insert fresh findings
    for (const finding of freshFindings) {
      await execute(
        db,
        `INSERT INTO findings (id, repo_id, scan_id, category, severity, title, details, evidence, suggested_actions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          repoId,
          scanId,
          finding.category,
          finding.severity,
          finding.title,
          finding.details,
          finding.evidence || null,
          JSON.stringify(finding.suggestedActions),
        ],
      );
    }
  });
}

export async function getAIFilesForRepo(repoId: string): Promise<AIFile[]> {
  const db = await getDb();

  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);

  if (!repo) return [];

  const expandedPath = expandTilde(repo.local_path);

  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(expandedPath)) {
      return [
        { name: "README", path: "README.md", present: false },
        { name: "CLAUDE.md", path: "CLAUDE.md", present: false },
        { name: "AGENTS.md", path: "AGENTS.md", present: false },
        { name: "copilot-instructions", path: ".github/copilot-instructions.md", present: false },
        { name: "CONTRIBUTING", path: "CONTRIBUTING.md", present: false },
        { name: "Architecture Docs", path: "docs/architecture.md", present: false },
        { name: "API Docs", path: "docs/api.md", present: false },
        { name: "Setup Guide", path: "docs/setup.md", present: false },
      ];
    }

    return scanAIFiles(expandedPath);
  } catch {
    return [];
  }
}
