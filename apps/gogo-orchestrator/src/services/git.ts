import { execFile as execFileCb } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { TIMEOUTS, withTimeout } from "../utils/timeout.js";

const execFile = promisify(execFileCb);

export interface GitConfig {
  workdir: string;
  repoUrl: string;
  token: string;
  owner: string;
  name: string;
  baseBranch?: string;
}

interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

interface CreateWorktreeResult {
  worktreePath: string;
  branch: string;
}

/**
 * Error thrown when a branch already exists remotely.
 * This indicates a collision that requires user intervention.
 */
class BranchCollisionError extends Error {
  public readonly branch: string;
  public readonly issueNumber: number;

  constructor(branch: string, issueNumber: number) {
    super(
      `Branch "${branch}" already exists on remote. This may happen when multiple issues have similar titles. Please close the existing PR or delete the remote branch before retrying.`,
    );
    this.name = "BranchCollisionError";
    this.branch = branch;
    this.issueNumber = issueNumber;
  }
}

function sanitizeToken(output: string, token: string): string {
  if (!token) return output;
  // SECURITY: Escape regex special characters in the token to prevent
  // ReDoS or unexpected behavior if the token contains characters like . * + etc.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return output.replace(new RegExp(escaped, "g"), "***");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

/**
 * Creates a normalized directory slug for a repository.
 * Used to create unique per-repo directories under the workdir.
 * Example: "My-Org/My-Repo" -> "my-org-my-repo"
 */
export function getRepoSlug(owner: string, name: string): string {
  return `${owner}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Gets the repository-specific directory path.
 * Structure: <workdir>/<owner-name>/
 * Example: /path/to/workdir/my-org-my-repo/
 */
export function getRepoDir(config: GitConfig): string {
  return join(config.workdir, getRepoSlug(config.owner, config.name));
}

function getAuthenticatedUrl(config: GitConfig): string {
  return `https://x-access-token:${config.token}@github.com/${config.owner}/${config.name}.git`;
}

/**
 * Gets the path to the bare repository clone.
 * Structure: <workdir>/<owner-name>/.repo
 */
export function getBareRepoPath(config: GitConfig): string {
  return join(getRepoDir(config), ".repo");
}

/**
 * Gets the jobs directory for a repository.
 * Structure: <workdir>/<owner-name>/jobs/
 */
export function getJobsDir(config: GitConfig): string {
  return join(getRepoDir(config), "jobs");
}

async function execGit(args: string[], cwd: string, config: GitConfig): Promise<{ stdout: string; stderr: string }> {
  const operationName = `git ${args[0] || "command"}`;
  try {
    const { stdout, stderr } = await withTimeout(
      execFile("git", args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
        },
      }),
      TIMEOUTS.GIT_OPERATION,
      operationName,
    );
    return { stdout, stderr };
  } catch (error: unknown) {
    const err = error as Error & { stdout?: string; stderr?: string };
    const sanitizedMessage = sanitizeToken(err.message || "", config.token);
    const sanitizedStderr = sanitizeToken(err.stderr || "", config.token);
    throw new Error(`Git command failed: ${sanitizedMessage}\n${sanitizedStderr}`);
  }
}

/**
 * Check if a branch exists on the remote.
 */
async function remoteBranchExists(config: GitConfig, branch: string): Promise<boolean> {
  const bareRepoPath = getBareRepoPath(config);
  try {
    const { stdout } = await execGit(
      ["-C", bareRepoPath, "ls-remote", "--heads", "origin", branch],
      config.workdir,
      config,
    );
    return stdout.trim().length > 0;
  } catch {
    // If we can't check, assume it doesn't exist
    return false;
  }
}

export async function ensureBaseClone(config: GitConfig): Promise<void> {
  const bareRepoPath = getBareRepoPath(config);

  try {
    await access(bareRepoPath);
    return;
  } catch {
    // Does not exist, proceed with clone
  }

  // Create the repository-specific directory
  const repoDir = getRepoDir(config);
  await mkdir(repoDir, { recursive: true });

  const authUrl = getAuthenticatedUrl(config);
  await execGit(["clone", "--bare", authUrl, bareRepoPath], repoDir, config);
}

export async function fetchUpdates(config: GitConfig): Promise<void> {
  const bareRepoPath = getBareRepoPath(config);

  try {
    await access(bareRepoPath);
  } catch {
    throw new Error("Base repository not found. Call ensureBaseClone first.");
  }

  await execGit(["-C", bareRepoPath, "fetch", "origin", "--prune"], config.workdir, config);
}

/**
 * Detect available branches and return the best base branch to use.
 * In bare repos, branches are stored directly in refs/heads/*, not refs/remotes/origin/*.
 * Checks for main and master, then falls back to the first available branch.
 */
async function detectBaseBranch(config: GitConfig, bareRepoPath: string, preferredBranch: string): Promise<string> {
  // In a bare repo, use `git branch` to list local branches (which are the actual branches)
  // `git branch -r` won't work because bare repos don't have remote tracking refs
  try {
    const { stdout } = await execGit(["-C", bareRepoPath, "branch"], config.workdir, config);
    const branches = stdout
      .split("\n")
      .map((b) => b.replace(/^\*?\s*/, "").trim()) // Remove leading * and whitespace
      .filter((b) => b && !b.includes("->") && !b.endsWith("/HEAD"));

    if (branches.length === 0) {
      // Try for-each-ref as a fallback for bare repos
      const { stdout: refOutput } = await execGit(
        ["-C", bareRepoPath, "for-each-ref", "--format=%(refname:short)", "refs/heads/"],
        config.workdir,
        config,
      );
      const refBranches = refOutput
        .split("\n")
        .map((b) => b.trim())
        .filter((b) => b);

      if (refBranches.length > 0) {
        // Check preferred branch
        if (refBranches.includes(preferredBranch)) {
          return preferredBranch;
        }
        // Check fallbacks
        for (const fallback of ["main", "master"]) {
          if (refBranches.includes(fallback)) {
            return fallback;
          }
        }
        return refBranches[0];
      }

      throw new Error("No branches found in repository");
    }

    // Check if preferred branch exists
    if (branches.includes(preferredBranch)) {
      return preferredBranch;
    }

    // Fallback: try common default branch names
    for (const fallback of ["main", "master"]) {
      if (branches.includes(fallback)) {
        console.log(`[git] Configured branch '${preferredBranch}' not found, using '${fallback}'`);
        return fallback;
      }
    }

    // Last resort: use the first available branch
    const firstBranch = branches[0];
    console.log(`[git] No standard branch found, using first available branch: '${firstBranch}'`);
    return firstBranch;
  } catch (error) {
    const err = error as Error;
    console.error("[git] detectBaseBranch error:", err.message);
    // If there's a specific error message about no branches, propagate it
    if (err.message?.includes("No branches found")) {
      throw err;
    }
    // If we can't list branches, fall back to the configured branch
    return preferredBranch;
  }
}

export async function createWorktree(
  config: GitConfig,
  issueNumber: number,
  issueTitle: string,
  jobId?: string,
): Promise<CreateWorktreeResult> {
  const repoDir = getRepoDir(config);
  const bareRepoPath = getBareRepoPath(config);
  const jobsDir = getJobsDir(config);
  const slug = slugify(issueTitle);

  // Manual jobs use negative issue numbers - use different naming
  const isManual = issueNumber < 0;
  const shortId = jobId ? jobId.slice(0, 8) : Math.abs(issueNumber).toString();
  const branch = isManual ? `agent/manual-${shortId}-${slug}` : `agent/issue-${issueNumber}-${slug}`;
  const worktreeName = isManual ? `manual-${shortId}` : `issue-${issueNumber}`;
  const worktreePath = resolve(join(jobsDir, worktreeName));

  // Validate path is within repo directory to prevent directory traversal
  const normalizedRepoDir = resolve(repoDir);
  if (!worktreePath.startsWith(normalizedRepoDir)) {
    throw new Error("Invalid worktree path: directory traversal detected");
  }

  await mkdir(jobsDir, { recursive: true });

  // Check if worktree already exists
  try {
    await access(worktreePath);
    throw new Error(`Worktree already exists at ${worktreePath}`);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes("already exists")) {
      throw err;
    }
    // Path doesn't exist, proceed
  }

  // Check if branch exists on remote (collision detection)
  if (await remoteBranchExists(config, branch)) {
    throw new BranchCollisionError(branch, issueNumber);
  }

  // Check if branch already exists locally and delete it if so
  try {
    await execGit(["-C", bareRepoPath, "branch", "-D", branch], config.workdir, config);
  } catch {
    // Branch doesn't exist, that's fine
  }

  // Detect the best base branch to use
  const preferredBranch = config.baseBranch || "main";
  const remoteRef = await detectBaseBranch(config, bareRepoPath, preferredBranch);

  await execGit(["-C", bareRepoPath, "worktree", "add", worktreePath, "-b", branch, remoteRef], config.workdir, config);

  return { worktreePath, branch };
}

export async function removeWorktree(config: GitConfig, worktreePath: string): Promise<void> {
  const repoDir = getRepoDir(config);
  const bareRepoPath = getBareRepoPath(config);

  // Validate path is within repo directory
  const normalizedRepoDir = resolve(repoDir);
  const normalizedWorktreePath = resolve(worktreePath);
  if (!normalizedWorktreePath.startsWith(normalizedRepoDir)) {
    throw new Error("Invalid worktree path: directory traversal detected");
  }

  // Get branch name before removing worktree
  let branchName: string | null = null;
  try {
    const { stdout } = await execGit(
      ["-C", normalizedWorktreePath, "rev-parse", "--abbrev-ref", "HEAD"],
      config.workdir,
      config,
    );
    branchName = stdout.trim();
  } catch {
    // Worktree may already be partially removed
  }

  // Remove the worktree
  try {
    await execGit(
      ["-C", bareRepoPath, "worktree", "remove", normalizedWorktreePath, "--force"],
      config.workdir,
      config,
    );
  } catch {
    // If git worktree remove fails, try manual cleanup
    try {
      await rm(normalizedWorktreePath, { recursive: true, force: true });
      await execGit(["-C", bareRepoPath, "worktree", "prune"], config.workdir, config);
    } catch {
      throw new Error(`Failed to remove worktree at ${worktreePath}`);
    }
  }

  // Delete the branch if it exists
  if (branchName?.startsWith("agent/")) {
    try {
      await execGit(["-C", bareRepoPath, "branch", "-D", branchName], config.workdir, config);
    } catch {
      // Branch may not exist or already deleted
    }
  }
}

export async function listWorktrees(config: GitConfig): Promise<WorktreeInfo[]> {
  const bareRepoPath = getBareRepoPath(config);

  try {
    await access(bareRepoPath);
  } catch {
    return [];
  }

  const { stdout } = await execGit(["-C", bareRepoPath, "worktree", "list", "--porcelain"], config.workdir, config);

  const worktrees: WorktreeInfo[] = [];
  const lines = stdout.split("\n");
  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      current.path = line.slice("worktree ".length);
    } else if (line.startsWith("HEAD ")) {
      current.commit = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (line === "") {
      if (current.path && current.branch && current.commit) {
        // Skip the bare repo itself
        if (!current.path.endsWith(".repo")) {
          worktrees.push(current as WorktreeInfo);
        }
      }
      current = {};
    }
  }

  return worktrees;
}

export async function pushBranch(config: GitConfig, worktreePath: string, branch: string): Promise<void> {
  const authUrl = getAuthenticatedUrl(config);
  await execGit(["-C", worktreePath, "push", "-u", authUrl, branch], config.workdir, config);
}

export async function isWorkingTreeClean(worktreePath: string): Promise<boolean> {
  try {
    const { stdout } = await withTimeout(
      execFile("git", ["-C", worktreePath, "status", "--porcelain"], {
        maxBuffer: 10 * 1024 * 1024,
      }),
      TIMEOUTS.GIT_OPERATION,
      "git status",
    );
    return stdout.trim() === "";
  } catch {
    return false;
  }
}

export async function hasCommits(config: GitConfig, worktreePath: string, baseBranch: string): Promise<boolean> {
  // Try to fetch, but don't fail if it doesn't work
  try {
    await execGit(["-C", worktreePath, "fetch", "origin", baseBranch], config.workdir, config);
  } catch (error) {
    console.warn(`[git] Failed to fetch origin/${baseBranch}, will use local refs:`, (error as Error).message);
  }

  // Try comparing against origin/baseBranch
  try {
    const { stdout } = await execGit(
      ["-C", worktreePath, "rev-list", "--count", `origin/${baseBranch}..HEAD`],
      config.workdir,
      config,
    );
    const count = Number.parseInt(stdout.trim(), 10);
    console.log(`[git] Commits ahead of origin/${baseBranch}: ${count}`);
    if (count > 0) return true;
  } catch (error) {
    console.warn(`[git] Failed to compare with origin/${baseBranch}:`, (error as Error).message);
  }

  // Fallback: compare against local baseBranch ref (in case origin/ refs don't exist)
  try {
    const { stdout } = await execGit(
      ["-C", worktreePath, "rev-list", "--count", `${baseBranch}..HEAD`],
      config.workdir,
      config,
    );
    const count = Number.parseInt(stdout.trim(), 10);
    console.log(`[git] Commits ahead of ${baseBranch}: ${count}`);
    if (count > 0) return true;
  } catch (error) {
    console.warn(`[git] Failed to compare with ${baseBranch}:`, (error as Error).message);
  }

  // Last resort: check if there are ANY commits on this branch
  try {
    const { stdout } = await execGit(["-C", worktreePath, "rev-list", "--count", "HEAD"], config.workdir, config);
    const count = Number.parseInt(stdout.trim(), 10);
    console.log(`[git] Total commits on HEAD: ${count}`);
    // If we got here and there are commits, something is wrong with the comparison
    // but we'll return false to be safe
  } catch (error) {
    console.error(`[git] Failed to count commits:`, (error as Error).message);
  }

  return false;
}

export async function getCommitLog(config: GitConfig, worktreePath: string, baseBranch: string): Promise<string> {
  // Try origin/<baseBranch>..HEAD first, then fall back to local ref
  for (const ref of [`origin/${baseBranch}`, baseBranch]) {
    try {
      const { stdout } = await execGit(
        ["-C", worktreePath, "log", `${ref}..HEAD`, "--pretty=format:- %s"],
        config.workdir,
        config,
      );
      const trimmed = stdout.trim();
      if (trimmed) return trimmed;
    } catch {
      // Try next ref
    }
  }

  // Last resort: just show recent commits without a base comparison
  try {
    const { stdout } = await execGit(
      ["-C", worktreePath, "log", "--pretty=format:- %s", "-20"],
      config.workdir,
      config,
    );
    return stdout.trim() || "No commits yet.";
  } catch {
    return "Unable to retrieve commit log.";
  }
}

interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
  additions?: number;
  deletions?: number;
}

/**
 * Get the list of changed files in a worktree compared to the base branch.
 * Includes both committed and uncommitted changes.
 */
export async function getChangedFiles(
  config: GitConfig,
  worktreePath: string,
  baseBranch: string,
): Promise<ChangedFile[]> {
  const files: ChangedFile[] = [];
  const seenPaths = new Set<string>();

  // Get uncommitted changes (staged and unstaged)
  try {
    const { stdout: statusOut } = await execGit(["-C", worktreePath, "status", "--porcelain"], config.workdir, config);

    for (const line of statusOut.split("\n").filter((l) => l.trim())) {
      const statusCode = line.slice(0, 2);
      const filePath = line.slice(3).trim();

      // Handle renamed files (R or C with -> separator)
      const actualPath = filePath.includes(" -> ") ? filePath.split(" -> ")[1] : filePath;

      if (seenPaths.has(actualPath)) continue;
      seenPaths.add(actualPath);

      let status: ChangedFile["status"] = "unknown";
      if (statusCode.includes("A") || statusCode === "??") {
        status = "added";
      } else if (statusCode.includes("M") || statusCode.includes("U")) {
        status = "modified";
      } else if (statusCode.includes("D")) {
        status = "deleted";
      } else if (statusCode.includes("R")) {
        status = "renamed";
      } else if (statusCode.includes("C")) {
        status = "copied";
      }

      files.push({ path: actualPath, status });
    }
  } catch {
    // Ignore errors, continue with committed changes
  }

  // Get committed changes compared to base branch
  try {
    const bareRepoPath = getBareRepoPath(config);

    // Fetch the base branch into the bare repo to ensure we have up-to-date refs
    try {
      await execGit(["-C", bareRepoPath, "fetch", "origin", baseBranch], config.workdir, config);
    } catch {
      // Fetch may fail if offline or no remote access - continue anyway
    }

    // Find the merge-base between HEAD and the base branch
    // This works even if origin/baseBranch isn't directly accessible from the worktree
    let compareRef = `origin/${baseBranch}`;

    // Try to get merge-base first (most accurate for feature branches)
    try {
      const { stdout: mergeBase } = await execGit(
        ["-C", worktreePath, "merge-base", compareRef, "HEAD"],
        config.workdir,
        config,
      );
      if (mergeBase.trim()) {
        compareRef = mergeBase.trim();
      }
    } catch {
      // If merge-base fails, try using just the base branch name
      try {
        const { stdout: mergeBase } = await execGit(
          ["-C", worktreePath, "merge-base", baseBranch, "HEAD"],
          config.workdir,
          config,
        );
        if (mergeBase.trim()) {
          compareRef = mergeBase.trim();
        }
      } catch {
        // Fall back to comparing HEAD against first commit (show all changes)
        try {
          const { stdout: firstCommit } = await execGit(
            ["-C", worktreePath, "rev-list", "--max-parents=0", "HEAD"],
            config.workdir,
            config,
          );
          if (firstCommit.trim()) {
            compareRef = firstCommit.trim().split("\n")[0];
          }
        } catch {
          // Give up on committed changes
          return files.sort((a, b) => a.path.localeCompare(b.path));
        }
      }
    }

    const { stdout: diffOut } = await execGit(
      ["-C", worktreePath, "diff", "--name-status", `${compareRef}...HEAD`],
      config.workdir,
      config,
    );

    for (const line of diffOut.split("\n").filter((l) => l.trim())) {
      const parts = line.split("\t");
      if (parts.length < 2) continue;

      const statusCode = parts[0];
      const filePath = parts.length > 2 ? parts[2] : parts[1]; // Handle renames

      if (seenPaths.has(filePath)) continue;
      seenPaths.add(filePath);

      let status: ChangedFile["status"] = "unknown";
      if (statusCode.startsWith("A")) {
        status = "added";
      } else if (statusCode.startsWith("M")) {
        status = "modified";
      } else if (statusCode.startsWith("D")) {
        status = "deleted";
      } else if (statusCode.startsWith("R")) {
        status = "renamed";
      } else if (statusCode.startsWith("C")) {
        status = "copied";
      }

      files.push({ path: filePath, status });
    }
  } catch (error) {
    // Log the error for debugging but continue
    console.warn(`[git] Failed to get committed changes for ${worktreePath}:`, error);
  }

  // Sort files alphabetically
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Get the unified diff for a specific file.
 */
/**
 * Stage all changes and create a commit.
 * Used when agent signals READY_TO_PR but has uncommitted changes.
 */
export async function commitAllChanges(worktreePath: string, message: string): Promise<void> {
  // Stage all changes
  await withTimeout(
    execFile("git", ["-C", worktreePath, "add", "-A"], {
      maxBuffer: 10 * 1024 * 1024,
    }),
    TIMEOUTS.GIT_OPERATION,
    "git add",
  );

  // Commit
  await withTimeout(
    execFile("git", ["-C", worktreePath, "commit", "-m", message], {
      maxBuffer: 10 * 1024 * 1024,
    }),
    TIMEOUTS.GIT_OPERATION,
    "git commit",
  );
}

export async function getFileDiff(
  config: GitConfig,
  worktreePath: string,
  baseBranch: string,
  filePath: string,
): Promise<string> {
  const bareRepoPath = getBareRepoPath(config);

  // Fetch the base branch into the bare repo to ensure we have up-to-date refs
  try {
    await execGit(["-C", bareRepoPath, "fetch", "origin", baseBranch], config.workdir, config);
  } catch {
    // Fetch may fail if offline or no remote access - continue anyway
  }

  // First check if file has uncommitted changes
  try {
    const { stdout: statusOut } = await execGit(
      ["-C", worktreePath, "status", "--porcelain", "--", filePath],
      config.workdir,
      config,
    );

    if (statusOut.trim()) {
      const statusCode = statusOut.slice(0, 2);

      // Handle untracked files (new files not yet added to git)
      if (statusCode === "??") {
        // Read file content and format as new file diff
        const fullPath = join(worktreePath, filePath);
        try {
          const content = await readFile(fullPath, "utf-8");
          const lines = content.split("\n");
          const lineCount = lines.length;

          // Format as unified diff for a new file
          let diff = `diff --git a/${filePath} b/${filePath}\n`;
          diff += "new file mode 100644\n";
          diff += "--- /dev/null\n";
          diff += `+++ b/${filePath}\n`;
          diff += `@@ -0,0 +1,${lineCount} @@\n`;
          diff += lines.map((line) => `+${line}`).join("\n");

          return diff;
        } catch {
          return "";
        }
      }

      // File has uncommitted changes - show diff against HEAD
      const { stdout } = await execGit(["-C", worktreePath, "diff", "HEAD", "--", filePath], config.workdir, config);

      if (stdout.trim()) {
        return stdout;
      }
    }
  } catch {
    // Continue to committed diff
  }

  // Find the merge-base for comparison
  let compareRef = `origin/${baseBranch}`;
  try {
    const { stdout: mergeBase } = await execGit(
      ["-C", worktreePath, "merge-base", compareRef, "HEAD"],
      config.workdir,
      config,
    );
    if (mergeBase.trim()) {
      compareRef = mergeBase.trim();
    }
  } catch {
    // Try using just the base branch name
    try {
      const { stdout: mergeBase } = await execGit(
        ["-C", worktreePath, "merge-base", baseBranch, "HEAD"],
        config.workdir,
        config,
      );
      if (mergeBase.trim()) {
        compareRef = mergeBase.trim();
      }
    } catch {
      // Fall back to first commit
      try {
        const { stdout: firstCommit } = await execGit(
          ["-C", worktreePath, "rev-list", "--max-parents=0", "HEAD"],
          config.workdir,
          config,
        );
        if (firstCommit.trim()) {
          compareRef = firstCommit.trim().split("\n")[0];
        }
      } catch {
        return "";
      }
    }
  }

  // Get committed diff against the comparison ref
  try {
    const { stdout } = await execGit(
      ["-C", worktreePath, "diff", `${compareRef}...HEAD`, "--", filePath],
      config.workdir,
      config,
    );
    return stdout;
  } catch {
    return "";
  }
}
