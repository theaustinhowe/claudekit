import fs from "node:fs";
import path from "node:path";
import { DEFAULT_EXCLUDE_PATTERNS, LOCKFILE_TO_PM, MONOREPO_INDICATORS, REPO_TYPE_INDICATORS } from "@/lib/constants";
import { expandTilde } from "@/lib/utils";

interface DiscoveredRepo {
  name: string;
  localPath: string;
  gitRemote: string | null;
  defaultBranch: string;
  packageManager: string | null;
  repoType: string | null;
  isMonorepo: boolean;
  lastModifiedAt: string | null;
}

interface ScanOptions {
  roots: string[];
  excludePatterns?: string[];
  maxDepth?: number;
  onProgress?: (message: string) => void;
}

function detectPackageManager(repoPath: string): string | null {
  for (const [lockfile, pm] of Object.entries(LOCKFILE_TO_PM)) {
    if (fs.existsSync(path.join(repoPath, lockfile))) {
      return pm;
    }
  }
  return null;
}

function detectMonorepo(repoPath: string): boolean {
  for (const indicator of MONOREPO_INDICATORS) {
    if (fs.existsSync(path.join(repoPath, indicator))) {
      return true;
    }
  }
  // Check package.json workspaces
  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.workspaces) return true;
    } catch {
      // ignore parse errors
    }
  }
  return false;
}

function detectRepoType(repoPath: string): string | null {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    for (const [type, indicators] of Object.entries(REPO_TYPE_INDICATORS)) {
      for (const indicator of indicators) {
        if (indicator in allDeps) return type;
        // Check for config files
        if (fs.existsSync(path.join(repoPath, indicator))) return type;
      }
    }
  } catch {
    // ignore parse errors
  }

  return "node";
}

function getRepoName(repoPath: string): string {
  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    } catch {
      // ignore
    }
  }
  return path.basename(repoPath);
}

/**
 * Resolve the .git directory for a repo path.
 * Standard repos have `.git/` as a directory; worktrees have a `.git` file
 * containing a `gitdir: <path>` pointer.
 */
function resolveGitDir(repoPath: string): string | null {
  const dotGit = path.join(repoPath, ".git");
  try {
    const stat = fs.statSync(dotGit);
    if (stat.isDirectory()) return dotGit;
  } catch {
    return null;
  }

  // .git is a file — parse gitdir pointer (worktree)
  try {
    const content = fs.readFileSync(dotGit, "utf-8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (!match) return null;
    const gitdir = path.resolve(repoPath, match[1]);
    if (fs.existsSync(gitdir)) return gitdir;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Resolve the main .git/config path, handling worktrees.
 * Worktree gitdirs (e.g. `/repo/.git/worktrees/foo`) need to go up to the main `.git/config`.
 */
function resolveGitConfig(repoPath: string): string | null {
  const gitDir = resolveGitDir(repoPath);
  if (!gitDir) return null;

  // If this is a worktree gitdir (contains /worktrees/), resolve up to the main .git
  if (gitDir.includes(`${path.sep}worktrees${path.sep}`) || gitDir.includes("/worktrees/")) {
    const worktreesIdx = gitDir.lastIndexOf(`${path.sep}worktrees${path.sep}`);
    const mainGitDir = gitDir.slice(0, worktreesIdx);
    const configPath = path.join(mainGitDir, "config");
    if (fs.existsSync(configPath)) return configPath;
  }

  const configPath = path.join(gitDir, "config");
  if (fs.existsSync(configPath)) return configPath;

  return null;
}

function getGitRemote(repoPath: string): string | null {
  const configPath = resolveGitConfig(repoPath);
  if (!configPath) return null;

  try {
    const config = fs.readFileSync(configPath, "utf-8");
    const match = config.match(/url\s*=\s*(.+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function getDefaultBranch(repoPath: string): string {
  const gitDir = resolveGitDir(repoPath);
  if (!gitDir) return "main";

  const headPath = path.join(gitDir, "HEAD");
  if (!fs.existsSync(headPath)) return "main";

  try {
    const head = fs.readFileSync(headPath, "utf-8").trim();
    const match = head.match(/ref: refs\/heads\/(.+)/);
    return match ? match[1] : "main";
  } catch {
    return "main";
  }
}

function shouldExclude(name: string, excludePatterns: string[]): boolean {
  return excludePatterns.some((pattern) => {
    if (pattern.includes("*")) {
      // Escape regex specials except *, then replace * with .*
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
      return regex.test(name);
    }
    return name === pattern;
  });
}

function walkForGitRepos(
  dir: string,
  excludePatterns: string[],
  maxDepth: number,
  currentDepth: number,
  onProgress?: (message: string) => void,
): string[] {
  if (currentDepth > maxDepth) return [];

  const repos: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Check if this directory is a git repo (.git can be a directory or a file for worktrees)
    if (entries.some((e) => e.name === ".git" && (e.isDirectory() || e.isFile()))) {
      repos.push(dir);
      return repos; // Don't recurse into git repos (nested repos are separate)
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (shouldExclude(entry.name, excludePatterns)) continue;
      if (entry.name.startsWith(".")) continue; // Skip hidden directories

      const subPath = path.join(dir, entry.name);
      if (onProgress) onProgress(`Scanning ${subPath}`);
      repos.push(...walkForGitRepos(subPath, excludePatterns, maxDepth, currentDepth + 1, onProgress));
    }
  } catch (err: unknown) {
    onProgress?.(`[WARN] Could not read directory: ${dir} — ${err instanceof Error ? err.message : String(err)}`);
  }

  return repos;
}

export function discoverRepos(options: ScanOptions): DiscoveredRepo[] {
  const { roots, excludePatterns = DEFAULT_EXCLUDE_PATTERNS, maxDepth = 4, onProgress } = options;

  const discovered: DiscoveredRepo[] = [];

  for (const root of roots) {
    const expandedRoot = expandTilde(root);

    if (!fs.existsSync(expandedRoot)) {
      onProgress?.(`[WARN] Root directory not found: ${root}`);
      continue;
    }

    onProgress?.(`[INFO] Scanning root: ${root}`);
    const repoPaths = walkForGitRepos(expandedRoot, excludePatterns, maxDepth, 0, onProgress);

    for (const repoPath of repoPaths) {
      let lastModifiedAt: string | null = null;
      try {
        lastModifiedAt = fs.statSync(repoPath).mtime.toISOString();
      } catch {
        /* stat failed */
      }

      const repo: DiscoveredRepo = {
        name: getRepoName(repoPath),
        localPath: repoPath,
        gitRemote: getGitRemote(repoPath),
        defaultBranch: getDefaultBranch(repoPath),
        packageManager: detectPackageManager(repoPath),
        repoType: detectRepoType(repoPath),
        isMonorepo: detectMonorepo(repoPath),
        lastModifiedAt,
      };
      discovered.push(repo);
      onProgress?.(`[INFO] Found: ${repo.name} (${repo.repoType || "unknown"}) at ${repoPath}`);
    }
  }

  onProgress?.(`[INFO] Discovered ${discovered.length} repositories`);
  return discovered;
}
