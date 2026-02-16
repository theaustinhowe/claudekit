import { getDb } from "@/lib/db";
import { checkpoint, execute, queryAll, queryOne } from "@/lib/db/helpers";
import { runAudit } from "@/lib/services/auditors";
import { planFixes, storePlannedFixes } from "@/lib/services/fix-planner";
import { matchPolicy } from "@/lib/services/policy-matcher";
import { discoverRepos } from "@/lib/services/scanner";
import type { SessionRunner } from "@/lib/services/session-manager";
import type { Policy, Repo } from "@/lib/types";
import { generateId, nowTimestamp, parsePolicy } from "@/lib/utils";

export function createScanRunner(metadata: Record<string, unknown>): SessionRunner {
  const scanRoots = metadata.scanRoots as string[] | undefined;
  const excludePatterns = metadata.excludePatterns as string[] | undefined;
  const selectedRepoIds = metadata.selectedRepoIds as string[] | undefined;
  const selectedRepoPaths = metadata.selectedRepoPaths as string[] | undefined;
  const policyId = metadata.policyId as string | undefined;
  const autoMatch = (metadata.autoMatch as boolean) ?? false;
  const policyOverrides = (metadata.policyOverrides as Record<string, string>) ?? {};

  return async ({ onProgress, signal }) => {
    const db = await getDb();
    const scanId = generateId();

    // Create scan record
    await execute(db, `INSERT INTO scans (id, status, policy_id, started_at) VALUES (?, 'running', ?, ?)`, [
      scanId,
      policyId || null,
      nowTimestamp(),
    ]);

    // Store scan roots
    if (scanRoots) {
      for (const root of scanRoots) {
        const existing = await queryOne<{ id: string }>(db, "SELECT id FROM scan_roots WHERE path = ?", [root]);
        const rootId = existing ? existing.id : generateId();
        if (!existing) {
          await execute(db, "INSERT INTO scan_roots (id, path) VALUES (?, ?)", [rootId, root]);
        }
        await execute(
          db,
          "INSERT INTO scan_root_entries (scan_id, scan_root_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
          [scanId, rootId],
        );
      }
    }

    try {
      // Phase 1: Discovery
      onProgress({
        type: "progress",
        progress: 10,
        phase: "Discovering",
        log: "[INFO] Starting repository discovery...",
        logType: "status",
      });

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const discovered = discoverRepos({
        roots: scanRoots || [],
        excludePatterns,
        onProgress: (msg) => onProgress({ type: "log", log: msg, logType: "status" }),
      });

      onProgress({
        type: "progress",
        progress: 25,
        log: `[INFO] Discovered ${discovered.length} repositories`,
        logType: "status",
      });

      // Store discovered repos
      for (const repo of discovered) {
        await execute(
          db,
          `INSERT INTO repos (id, name, local_path, git_remote, default_branch, package_manager, repo_type, is_monorepo, last_scanned_at, last_modified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(local_path) DO UPDATE SET
             name = excluded.name,
             git_remote = excluded.git_remote,
             default_branch = excluded.default_branch,
             package_manager = excluded.package_manager,
             repo_type = excluded.repo_type,
             is_monorepo = excluded.is_monorepo,
             last_scanned_at = excluded.last_scanned_at,
             last_modified_at = excluded.last_modified_at`,
          [
            generateId(),
            repo.name,
            repo.localPath,
            repo.gitRemote,
            repo.defaultBranch,
            repo.packageManager,
            repo.repoType,
            repo.isMonorepo ? "true" : "false",
            nowTimestamp(),
            repo.lastModifiedAt,
          ],
        );
      }

      // Load all policies for matching
      const policyRows = await queryAll<Record<string, unknown>>(
        db,
        "SELECT * FROM policies ORDER BY is_builtin DESC, name ASC",
      );
      const allPolicies: Policy[] = policyRows.map(parsePolicy);

      // Phase 2: Auditing
      onProgress({
        type: "progress",
        progress: 50,
        phase: "Analyzing",
        log: "[INFO] Running auditors...",
        logType: "status",
      });

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const repos = await queryAll<Repo>(db, "SELECT * FROM repos");
      const targetRepos = selectedRepoPaths
        ? repos.filter((r) => selectedRepoPaths.includes(r.local_path))
        : selectedRepoIds
          ? repos.filter((r) => selectedRepoIds.includes(r.id))
          : repos;

      for (const repo of targetRepos) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        let repoPolicy: Policy | undefined;
        const overrideId = policyOverrides[repo.local_path] || policyOverrides[repo.id];
        if (overrideId) {
          repoPolicy = allPolicies.find((p) => p.id === overrideId);
        }
        if (!repoPolicy && autoMatch) {
          repoPolicy = matchPolicy(repo, allPolicies, policyId);
        } else if (!repoPolicy && policyId) {
          repoPolicy = allPolicies.find((p) => p.id === policyId);
        } else if (!repoPolicy) {
          repoPolicy = allPolicies[0];
        }

        if (repoPolicy) {
          onProgress({
            type: "log",
            log: `[INFO] Using policy "${repoPolicy.name}" for ${repo.name}`,
            logType: "status",
          });
          await runAudit({
            repoId: repo.id,
            repoPath: repo.local_path,
            scanId,
            policy: repoPolicy,
            onProgress: (msg) => onProgress({ type: "log", log: msg, logType: "status" }),
          });
        }
      }

      onProgress({
        type: "progress",
        progress: 75,
        phase: "Generating Fixes",
        log: "[INFO] Planning fixes...",
        logType: "status",
      });

      // Phase 3: Fix planning
      for (const repo of targetRepos) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        const plans = await planFixes(repo.id, repo.local_path, repo.name, scanId);
        if (plans.length > 0) {
          await storePlannedFixes(plans, repo.id, scanId);
          onProgress({ type: "log", log: `[INFO] Planned ${plans.length} fixes for ${repo.name}`, logType: "status" });
        }
      }

      // Complete
      await execute(db, "UPDATE scans SET status = 'done', completed_at = ? WHERE id = ?", [nowTimestamp(), scanId]);
      await checkpoint(db);

      onProgress({
        type: "progress",
        progress: 100,
        phase: "Complete",
        log: "[SUCCESS] Scan complete!",
        logType: "status",
      });
      return { result: { scanId } };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        await execute(db, "UPDATE scans SET status = 'error', completed_at = ? WHERE id = ?", [nowTimestamp(), scanId]);
        throw err;
      }
      await execute(db, "UPDATE scans SET status = 'error', completed_at = ? WHERE id = ?", [nowTimestamp(), scanId]);
      throw err;
    }
  };
}
