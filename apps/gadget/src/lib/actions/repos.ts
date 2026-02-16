"use server";

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import type { AttentionRepo, RepoWithCounts } from "@/lib/types";
import { expandTilde } from "@/lib/utils";

const SEVERITY_COUNTS = `
  CAST(COALESCE(SUM(CASE WHEN f.severity = 'critical' THEN 1 ELSE 0 END), 0) AS INTEGER) as critical_count,
  CAST(COALESCE(SUM(CASE WHEN f.severity = 'warning' THEN 1 ELSE 0 END), 0) AS INTEGER) as warning_count,
  CAST(COALESCE(SUM(CASE WHEN f.severity = 'info' THEN 1 ELSE 0 END), 0) AS INTEGER) as info_count`;

const REPO_GROUP_BY =
  "GROUP BY r.id, r.name, r.local_path, r.git_remote, r.default_branch, r.package_manager, r.repo_type, r.is_monorepo, r.last_scanned_at, r.last_modified_at, r.created_at, r.github_url, r.github_account_id, r.source";

export async function getRepos(): Promise<RepoWithCounts[]> {
  const db = await getDb();
  return queryAll<RepoWithCounts>(
    db,
    `SELECT r.*, ${SEVERITY_COUNTS}
    FROM repos r
    LEFT JOIN findings f ON f.repo_id = r.id
    WHERE r.id != '__library__'
    ${REPO_GROUP_BY}
    ORDER BY r.name`,
  );
}

export async function getRepoById(id: string): Promise<RepoWithCounts | null> {
  const db = await getDb();
  const row = await queryOne<RepoWithCounts>(
    db,
    `SELECT r.*, ${SEVERITY_COUNTS}
    FROM repos r
    LEFT JOIN findings f ON f.repo_id = r.id
    WHERE r.id = ?
    ${REPO_GROUP_BY}`,
    [id],
  );
  return row ?? null;
}

export async function getReposNeedingAttention(): Promise<AttentionRepo[]> {
  const db = await getDb();
  const rows = await queryAll<{
    id: string;
    name: string;
    local_path: string;
    critical_count: number;
    warning_count: number;
    last_scanned_at: string | null;
  }>(
    db,
    `
    SELECT r.id, r.name, r.local_path,
      CAST(COALESCE(SUM(CASE WHEN f.severity = 'critical' THEN 1 ELSE 0 END), 0) AS INTEGER) as critical_count,
      CAST(COALESCE(SUM(CASE WHEN f.severity = 'warning' THEN 1 ELSE 0 END), 0) AS INTEGER) as warning_count,
      r.last_scanned_at
    FROM repos r
    LEFT JOIN findings f ON f.repo_id = r.id
    WHERE r.id != '__library__'
    GROUP BY r.id, r.name, r.local_path, r.last_scanned_at
    HAVING
      SUM(CASE WHEN f.severity = 'critical' THEN 1 ELSE 0 END) > 0
      OR SUM(CASE WHEN f.severity = 'warning' THEN 1 ELSE 0 END) > 0
      OR r.last_scanned_at IS NULL
      OR CAST(r.last_scanned_at AS TIMESTAMP) < current_timestamp - INTERVAL '7 days'
    ORDER BY
      COALESCE(SUM(CASE WHEN f.severity = 'critical' THEN 1 ELSE 0 END), 0) DESC,
      COALESCE(SUM(CASE WHEN f.severity = 'warning' THEN 1 ELSE 0 END), 0) DESC,
      r.last_scanned_at ASC NULLS FIRST
    LIMIT 7
  `,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    local_path: r.local_path,
    critical_count: Number(r.critical_count),
    warning_count: Number(r.warning_count),
    last_scanned_at: r.last_scanned_at,
    is_stale: !r.last_scanned_at || new Date(r.last_scanned_at).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000,
  }));
}

export async function deleteRepos(ids: string[]): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(", ");
  // Delete related data first, then the repo
  for (const table of [
    "findings",
    "fix_actions",
    "snapshots",
    "apply_runs",
    "concepts",
    "concept_links",
    "github_metadata",
    "manual_findings",
  ]) {
    await execute(db, `DELETE FROM ${table} WHERE repo_id IN (${placeholders})`, ids);
  }
  await execute(db, `DELETE FROM repos WHERE id IN (${placeholders})`, ids);
  return { deleted: ids.length };
}

export async function readRepoFile(
  repoId: string,
  relativePath: string,
): Promise<{ content: string | null; error?: string }> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
  if (!repo) return { content: null, error: "Repository not found" };

  const repoPath = expandTilde(repo.local_path);
  const filePath = path.join(repoPath, relativePath);

  // Prevent path traversal
  if (!filePath.startsWith(repoPath)) return { content: null, error: "Invalid path" };

  if (!fs.existsSync(filePath)) return { content: null, error: "File not found" };

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return { content };
  } catch {
    return { content: null, error: "Failed to read file" };
  }
}

// --- GitHub Repo Settings ---

export async function getGitHubRepoSettings(repoId: string) {
  const db = await getDb();
  const repo = await queryOne<{ git_remote: string | null }>(db, "SELECT git_remote FROM repos WHERE id = ?", [repoId]);
  if (!repo?.git_remote) return null;

  const { parseGitHubUrl } = await import("@/lib/utils");
  const parsed = parseGitHubUrl(repo.git_remote);
  if (!parsed) return null;

  const pat = await getDefaultPat();
  if (!pat) return null;

  const { getRepoSettings } = await import("@/lib/services/github-client");
  try {
    return await getRepoSettings(pat, parsed.owner, parsed.repo);
  } catch {
    return null;
  }
}

export async function updateGitHubRepoSettings(
  repoId: string,
  updates: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  const repo = await queryOne<{ git_remote: string | null }>(db, "SELECT git_remote FROM repos WHERE id = ?", [repoId]);
  if (!repo?.git_remote) return { success: false, error: "No GitHub remote configured" };

  const { parseGitHubUrl } = await import("@/lib/utils");
  const parsed = parseGitHubUrl(repo.git_remote);
  if (!parsed) return { success: false, error: "Could not parse GitHub remote URL" };

  const pat = await getDefaultPat();
  if (!pat) return { success: false, error: "No GitHub token configured" };

  const { updateRepoSettings } = await import("@/lib/services/github-client");
  try {
    await updateRepoSettings(pat, parsed.owner, parsed.repo, updates);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update settings";
    return { success: false, error: message };
  }
}

// --- GitHub Remote Setup ---

async function getDefaultPat(): Promise<string | null> {
  const db = await getDb();
  const account = await queryOne<{ pat_encrypted: string }>(
    db,
    "SELECT pat_encrypted FROM github_accounts WHERE is_default = true LIMIT 1",
  );
  if (!account) {
    const fallback = await queryOne<{ pat_encrypted: string }>(db, "SELECT pat_encrypted FROM github_accounts LIMIT 1");
    if (!fallback) {
      const { readEnvLocal } = await import("@/lib/actions/env-keys");
      const env = await readEnvLocal();
      const token = env.GITHUB_TOKEN ?? env.GITHUB_PERSONAL_ACCESS_TOKEN;
      return token?.length > 0 ? token : null;
    }
    const { getEncryptionKey } = await import("@/lib/actions/settings");
    const { decrypt } = await import("@/lib/services/encryption");
    const key = await getEncryptionKey();
    if (!key) return null;
    return decrypt(fallback.pat_encrypted, key);
  }
  const { getEncryptionKey } = await import("@/lib/actions/settings");
  const { decrypt } = await import("@/lib/services/encryption");
  const key = await getEncryptionKey();
  if (!key) return null;
  return decrypt(account.pat_encrypted, key);
}

export interface GitHubAccount {
  login: string;
  avatar_url: string;
  type: "user" | "org";
}

export async function getGitHubAccountsForRemote(): Promise<GitHubAccount[]> {
  const pat = await getDefaultPat();
  if (!pat) return [];

  const { getAuthenticatedUser, getUserOrgs } = await import("@/lib/services/github-client");

  try {
    const [user, orgs] = await Promise.all([getAuthenticatedUser(pat), getUserOrgs(pat)]);
    return [
      { login: user.login, avatar_url: user.avatar_url, type: "user" as const },
      ...orgs.map((o) => ({ login: o.login, avatar_url: o.avatar_url, type: "org" as const })),
    ];
  } catch {
    return [];
  }
}

interface SetupGitHubRemoteOpts {
  repoId: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  org?: string;
}

export async function setupGitHubRemote(
  opts: SetupGitHubRemoteOpts,
): Promise<{ success: boolean; githubUrl?: string; error?: string }> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string; git_remote: string | null }>(
    db,
    "SELECT local_path, git_remote FROM repos WHERE id = ?",
    [opts.repoId],
  );

  if (!repo) return { success: false, error: "Repository not found" };
  if (repo.git_remote) return { success: false, error: "Repository already has a remote configured" };

  const pat = await getDefaultPat();
  if (!pat) return { success: false, error: "No GitHub token configured" };

  const { createRepository } = await import("@/lib/services/github-client");

  let result: Awaited<ReturnType<typeof createRepository>>;
  try {
    result = await createRepository(pat, {
      name: opts.name,
      description: opts.description,
      isPrivate: opts.isPrivate,
      org: opts.org,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create GitHub repository";
    return { success: false, error: message };
  }

  const repoPath = expandTilde(repo.local_path);

  try {
    // Check if origin already exists
    try {
      execSync("git remote get-url origin", { cwd: repoPath, stdio: "pipe" });
      // Origin exists — update it
      execSync(`git remote set-url origin ${result.clone_url}`, { cwd: repoPath, stdio: "pipe" });
    } catch {
      // Origin doesn't exist — add it
      execSync(`git remote add origin ${result.clone_url}`, { cwd: repoPath, stdio: "pipe" });
    }

    // Get current branch name
    const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath, stdio: "pipe" })
      .toString()
      .trim();

    // Push to remote
    execSync(`git push -u origin ${currentBranch}`, { cwd: repoPath, stdio: "pipe", timeout: 60000 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to set up git remote";
    return { success: false, error: `GitHub repo created at ${result.html_url}, but git push failed: ${message}` };
  }

  // Update DB record
  await execute(db, "UPDATE repos SET git_remote = ?, github_url = ?, source = 'both' WHERE id = ?", [
    result.clone_url,
    result.html_url,
    opts.repoId,
  ]);

  return { success: true, githubUrl: result.html_url };
}
