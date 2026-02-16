import { parseJsonField, queryAll, queryOne } from "@devkit/duckdb";
import { getDb } from "../db/index.js";
import type { DbRepository, DbSetting } from "../db/schema.js";
import type { GitConfig } from "./git.js";

export interface ClaudeCodeSettings {
  enabled: boolean;
  max_runtime_ms: number;
  max_parallel_jobs: number;
  test_command: string;
}

// Default runtime: 2 hours to prevent runaway agents while allowing complex tasks
const DEFAULT_MAX_RUNTIME_MS = 7200000; // 2 hours

const DEFAULT_CLAUDE_SETTINGS: ClaudeCodeSettings = {
  enabled: true,
  max_runtime_ms: DEFAULT_MAX_RUNTIME_MS,
  max_parallel_jobs: 3,
  test_command: "npm test",
};

async function getSetting<T>(key: string): Promise<T | null> {
  const conn = await getDb();
  const row = await queryOne<DbSetting>(conn, "SELECT * FROM settings WHERE key = ?", [key]);
  return row ? parseJsonField<T>(row.value, null as T) : null;
}

/**
 * Creates a GitConfig from a repository record.
 * Use this when working with multi-repo support to get
 * repository-specific git configuration.
 */
export function toGitConfigFromRepo(repo: {
  owner: string;
  name: string;
  githubToken: string;
  workdirPath: string;
  baseBranch?: string;
}): GitConfig {
  return {
    workdir: repo.workdirPath,
    owner: repo.owner,
    name: repo.name,
    token: repo.githubToken,
    repoUrl: `https://github.com/${repo.owner}/${repo.name}`,
    baseBranch: repo.baseBranch || "main",
  };
}

export async function getClaudeSettings(): Promise<ClaudeCodeSettings> {
  const saved = await getSetting<Partial<ClaudeCodeSettings>>("claude_code");

  if (!saved) {
    return DEFAULT_CLAUDE_SETTINGS;
  }

  return {
    enabled: saved.enabled ?? DEFAULT_CLAUDE_SETTINGS.enabled,
    max_runtime_ms: saved.max_runtime_ms ?? DEFAULT_CLAUDE_SETTINGS.max_runtime_ms,
    max_parallel_jobs: saved.max_parallel_jobs ?? DEFAULT_CLAUDE_SETTINGS.max_parallel_jobs,
    test_command: saved.test_command ?? DEFAULT_CLAUDE_SETTINGS.test_command,
  };
}

interface StartupValidationResult {
  ready: boolean;
  warnings: string[];
  errors: string[];
  hasActiveRepositories: boolean;
}

/**
 * Validates that the orchestrator has the necessary configuration to operate.
 * Checks for at least one active repository in the repositories table.
 *
 * Returns warnings for non-critical issues and errors for critical ones.
 */
export async function validateStartupSettings(): Promise<StartupValidationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const conn = await getDb();

  // Check for active repositories
  const activeRepos = await queryAll<{
    id: string;
    owner: string;
    name: string;
  }>(conn, "SELECT id, owner, name FROM repositories WHERE is_active = true");

  const hasActiveRepositories = activeRepos.length > 0;

  // Check for repositories with missing critical fields
  for (const repo of activeRepos) {
    const fullRepo = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repo.id]);

    if (fullRepo) {
      if (!fullRepo.github_token) {
        errors.push(`Repository ${repo.owner}/${repo.name}: missing GitHub token`);
      }
      if (!fullRepo.workdir_path) {
        errors.push(`Repository ${repo.owner}/${repo.name}: missing workspace directory`);
      }
    }
  }

  // Determine overall readiness
  if (!hasActiveRepositories) {
    warnings.push(
      "No active repositories configured. Jobs will not be created automatically. " +
        "Configure a repository in Settings or add one via the API.",
    );
  }

  // The orchestrator can still start even without repositories (user might add them later)
  // Only critical validation failures (like missing tokens on active repos) are errors
  const ready = errors.length === 0;

  return {
    ready,
    warnings,
    errors,
    hasActiveRepositories,
  };
}
