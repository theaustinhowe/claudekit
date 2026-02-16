import { parseJsonField, queryAll, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbRepository, DbSetting } from "../db/schema.js";
import type { GitConfig } from "./git.js";

export interface WorkspaceSettings {
  workdir: string;
  owner: string;
  name: string;
  token: string;
  repoUrl: string;
}

export interface ClaudeCodeSettings {
  enabled: boolean;
  max_runtime_ms: number;
  max_parallel_jobs: number;
  test_command: string;
}

// Default runtime: 2 hours to prevent runaway agents while allowing complex tasks
export const DEFAULT_MAX_RUNTIME_MS = 7200000; // 2 hours

const DEFAULT_CLAUDE_SETTINGS: ClaudeCodeSettings = {
  enabled: true,
  max_runtime_ms: DEFAULT_MAX_RUNTIME_MS,
  max_parallel_jobs: 3,
  test_command: "npm test",
};

export interface OpenAICodexSettings {
  enabled: boolean;
  max_runtime_ms: number;
  max_parallel_jobs: number;
  model: string;
  approval_mode: "full-auto" | "suggest" | "auto-edit";
  test_command: string;
}

const DEFAULT_CODEX_SETTINGS: OpenAICodexSettings = {
  enabled: true,
  max_runtime_ms: DEFAULT_MAX_RUNTIME_MS,
  max_parallel_jobs: 3,
  model: "o4-mini",
  approval_mode: "full-auto",
  test_command: "npm test",
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

async function getSetting<T>(key: string): Promise<T | null> {
  const conn = getConn();
  const row = await queryOne<DbSetting>(conn, "SELECT * FROM settings WHERE key = ?", [key]);
  return row ? parseJsonField<T>(row.value, null as T) : null;
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings | null> {
  const [github, workspace] = await Promise.all([
    getSetting<{ owner?: string; name?: string; token?: string }>("github"),
    getSetting<{ workdir?: string }>("workspace"),
  ]);

  if (!github || !workspace) {
    return null;
  }

  const { owner, name, token } = github;
  const { workdir } = workspace;

  if (!owner || !name || !token || !workdir) {
    return null;
  }

  const repoUrl = `https://github.com/${owner}/${name}`;

  return {
    workdir,
    owner,
    name,
    token,
    repoUrl,
  };
}

export async function validateWorkspaceSettings(): Promise<ValidationResult> {
  const errors: string[] = [];

  const github = await getSetting<{
    owner?: string;
    name?: string;
    token?: string;
  }>("github");
  const workspace = await getSetting<{ workdir?: string }>("workspace");

  if (!github) {
    errors.push("GitHub settings not configured");
  } else {
    if (!github.owner) {
      errors.push("GitHub repository owner not set");
    }
    if (!github.name) {
      errors.push("GitHub repository name not set");
    }
    if (!github.token) {
      errors.push("GitHub token not set");
    }
  }

  if (!workspace) {
    errors.push("Workspace settings not configured");
  } else {
    if (!workspace.workdir) {
      errors.push("Workspace directory (workdir) not set");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function toGitConfig(settings: WorkspaceSettings): GitConfig {
  return {
    workdir: settings.workdir,
    repoUrl: settings.repoUrl,
    token: settings.token,
    owner: settings.owner,
    name: settings.name,
    baseBranch: "main",
  };
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

export async function getCodexSettings(): Promise<OpenAICodexSettings> {
  const saved = await getSetting<Partial<OpenAICodexSettings>>("openai_codex");

  if (!saved) {
    return DEFAULT_CODEX_SETTINGS;
  }

  return {
    enabled: saved.enabled ?? DEFAULT_CODEX_SETTINGS.enabled,
    max_runtime_ms: saved.max_runtime_ms ?? DEFAULT_CODEX_SETTINGS.max_runtime_ms,
    max_parallel_jobs: saved.max_parallel_jobs ?? DEFAULT_CODEX_SETTINGS.max_parallel_jobs,
    model: saved.model ?? DEFAULT_CODEX_SETTINGS.model,
    approval_mode: saved.approval_mode ?? DEFAULT_CODEX_SETTINGS.approval_mode,
    test_command: saved.test_command ?? DEFAULT_CODEX_SETTINGS.test_command,
  };
}

/**
 * Check if OpenAI Codex is available and properly configured
 */
export function isCodexEnabled(): boolean {
  return process.env.ENABLE_OPENAI_CODEX === "true";
}

/**
 * Check if OPENAI_API_KEY is set
 */
export function hasOpenAIApiKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export interface StartupValidationResult {
  ready: boolean;
  warnings: string[];
  errors: string[];
  hasActiveRepositories: boolean;
  hasLegacySettings: boolean;
}

/**
 * Validates that the orchestrator has the necessary configuration to operate.
 * Checks for either:
 * 1. At least one active repository in the repositories table
 * 2. Legacy workspace settings (for backwards compatibility)
 *
 * Returns warnings for non-critical issues and errors for critical ones.
 */
export async function validateStartupSettings(): Promise<StartupValidationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const conn = getConn();

  // Check for active repositories
  const activeRepos = await queryAll<{
    id: string;
    owner: string;
    name: string;
  }>(conn, "SELECT id, owner, name FROM repositories WHERE is_active = true");

  const hasActiveRepositories = activeRepos.length > 0;

  // Check legacy workspace settings
  const legacyValidation = await validateWorkspaceSettings();
  const hasLegacySettings = legacyValidation.valid;

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
  if (!hasActiveRepositories && !hasLegacySettings) {
    warnings.push(
      "No active repositories configured. Jobs will not be created automatically. " +
        "Configure a repository in Settings or add one via the API.",
    );
  }

  if (hasLegacySettings && !hasActiveRepositories) {
    warnings.push("Using legacy workspace settings. Consider migrating to the repositories system.");
  }

  // The orchestrator can still start even without repositories (user might add them later)
  // Only critical validation failures (like missing tokens on active repos) are errors
  const ready = errors.length === 0;

  return {
    ready,
    warnings,
    errors,
    hasActiveRepositories,
    hasLegacySettings,
  };
}
