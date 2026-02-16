import { getEnabledRulesForPolicy } from "@/lib/actions/custom-rules";
import { execute, getDb } from "@/lib/db";
import { discoverConcepts, storeConcepts } from "@/lib/services/concept-scanner";
import type { Policy } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { auditAIFiles } from "./ai-files";
import { auditCustomRules } from "./custom-rules";
import { auditDependencies } from "./dependencies";
import { auditStructure, resolveWorkspacePackages } from "./structure";

interface AuditOptions {
  repoId: string;
  repoPath: string;
  scanId: string;
  policy: Policy;
  onProgress?: (message: string) => void;
}

export interface AuditFinding {
  category: string;
  severity: "critical" | "warning" | "info";
  title: string;
  details: string;
  evidence?: string;
  suggestedActions: string[];
}

export async function runAudit(options: AuditOptions) {
  const { repoId, repoPath, scanId, policy, onProgress } = options;
  const db = await getDb();

  const allFindings: AuditFinding[] = [];

  // Run dependency auditor
  onProgress?.(`[INFO] Auditing dependencies for ${repoPath}`);
  try {
    const depFindings = auditDependencies(repoPath, policy);
    allFindings.push(...depFindings);
  } catch (err: unknown) {
    allFindings.push({
      category: "dependencies",
      severity: "warning",
      title: "Dependency audit failed",
      details: err instanceof Error ? err.message : String(err),
      suggestedActions: ["Check that the repository path is accessible"],
    });
  }

  // Run AI files auditor
  onProgress?.(`[INFO] Checking AI assistant files for ${repoPath}`);
  try {
    const aiFindings = auditAIFiles(repoPath);
    allFindings.push(...aiFindings);
  } catch (err: unknown) {
    allFindings.push({
      category: "ai-files",
      severity: "warning",
      title: "AI files audit failed",
      details: err instanceof Error ? err.message : String(err),
      suggestedActions: ["Check that the repository path is accessible"],
    });
  }

  // Run structure auditor
  onProgress?.(`[INFO] Analyzing project structure for ${repoPath}`);
  try {
    const structFindings = auditStructure(repoPath, policy);
    allFindings.push(...structFindings);
  } catch (err: unknown) {
    allFindings.push({
      category: "structure",
      severity: "warning",
      title: "Structure audit failed",
      details: err instanceof Error ? err.message : String(err),
      suggestedActions: ["Check that the repository path is accessible"],
    });
  }

  // Run custom rules auditor
  onProgress?.(`[INFO] Evaluating custom rules for ${repoPath}`);
  try {
    const enabledRules = await getEnabledRulesForPolicy(policy.id);
    if (enabledRules.length > 0) {
      const customFindings = auditCustomRules(repoPath, enabledRules);
      allFindings.push(...customFindings);
      if (customFindings.length > 0) {
        onProgress?.(`[INFO] Custom rules found ${customFindings.length} issues`);
      }
    }
  } catch (err: unknown) {
    onProgress?.(`[WARN] Custom rules audit failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Audit workspace packages for monorepos
  try {
    const workspacePackages = resolveWorkspacePackages(repoPath);
    if (workspacePackages.length > 0) {
      onProgress?.(`[INFO] Monorepo detected — auditing ${workspacePackages.length} workspace packages`);
      for (const wsPkg of workspacePackages) {
        onProgress?.(`[INFO] Auditing workspace package: ${wsPkg.name}`);
        try {
          const depFindings = auditDependencies(wsPkg.path, policy);
          for (const f of depFindings) {
            allFindings.push({ ...f, title: `[${wsPkg.name}] ${f.title}` });
          }
        } catch {
          /* skip individual package errors */
        }
        try {
          const structFindings = auditStructure(wsPkg.path, policy);
          for (const f of structFindings) {
            allFindings.push({ ...f, title: `[${wsPkg.name}] ${f.title}` });
          }
        } catch {
          /* skip individual package errors */
        }
      }
    }
  } catch {
    /* workspace resolution failed — not a monorepo or unreadable */
  }

  // Discover Claude Code concepts
  onProgress?.(`[INFO] Discovering Claude Code concepts for ${repoPath}`);
  try {
    const discovered = discoverConcepts(repoPath);
    if (discovered.length > 0) {
      await storeConcepts(repoId, scanId, discovered);
      onProgress?.(`[INFO] Found ${discovered.length} Claude Code concepts`);
    }
  } catch (err) {
    onProgress?.(`[WARN] Concept discovery failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Store findings in DB (delete + insert inside a manual transaction)
  await execute(db, "BEGIN TRANSACTION");
  try {
    await execute(db, "DELETE FROM findings WHERE repo_id = ?", [repoId]);
    for (const finding of allFindings) {
      await execute(
        db,
        `
        INSERT INTO findings (id, repo_id, scan_id, category, severity, title, details, evidence, suggested_actions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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
    await execute(db, "COMMIT");
  } catch (err) {
    await execute(db, "ROLLBACK");
    throw err;
  }

  onProgress?.(
    `[INFO] Found ${allFindings.length} issues (${allFindings.filter((f) => f.severity === "critical").length} critical, ${allFindings.filter((f) => f.severity === "warning").length} warnings, ${allFindings.filter((f) => f.severity === "info").length} info)`,
  );

  return allFindings;
}
