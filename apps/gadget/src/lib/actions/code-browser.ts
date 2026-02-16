"use server";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import nodePath from "node:path";
import { promisify } from "node:util";
import { getEncryptionKey } from "@/lib/actions/settings";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";
import {
  getCommitDetail as ghGetCommitDetail,
  getFileContent as ghGetFileContent,
  getFileLastCommit as ghGetFileLastCommit,
  getRepoBranches as ghGetRepoBranches,
  getRepoCommits as ghGetRepoCommits,
  getRepoTree as ghGetRepoTree,
} from "@/lib/services/github-client";
import { detectLanguage, isBinaryFile } from "@/lib/services/language-detector";
import type {
  CodeBranch,
  CodeCommitInfo,
  CodeFileContent,
  CodeTreeEntry,
  CommitDetail,
  CommitFile,
  GitFileStatus,
  GitStatusFile,
  GitStatusResult,
} from "@/lib/types";
import { expandTilde, parseGitHubUrl } from "@/lib/utils";

const execFileAsync = promisify(execFile);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// --- GitHub Response Caches ---

interface TreeCacheEntry {
  tree: Awaited<ReturnType<typeof ghGetRepoTree>>;
  fetchedAt: number;
}

interface FileCacheEntry {
  content: CodeFileContent;
  fetchedAt: number;
}

const treeCache = new Map<string, TreeCacheEntry>();
const fileCache = new Map<string, FileCacheEntry>();
const TREE_CACHE_TTL = 5 * 60 * 1000; // 5 min
const FILE_CACHE_TTL = 5 * 60 * 1000; // 5 min
const MAX_FILE_CACHE = 100;

function getCachedTree(owner: string, repo: string, branch: string, includeDirectories: boolean) {
  const key = `${owner}/${repo}/${branch}/${includeDirectories}`;
  const entry = treeCache.get(key);
  if (entry && Date.now() - entry.fetchedAt < TREE_CACHE_TTL) return entry.tree;
  treeCache.delete(key);
  return null;
}

function setCachedTree(
  owner: string,
  repo: string,
  branch: string,
  includeDirectories: boolean,
  tree: Awaited<ReturnType<typeof ghGetRepoTree>>,
) {
  const key = `${owner}/${repo}/${branch}/${includeDirectories}`;
  treeCache.set(key, { tree, fetchedAt: Date.now() });
}

function getCachedFile(owner: string, repo: string, branch: string, filePath: string) {
  const key = `${owner}/${repo}/${branch}/${filePath}`;
  const entry = fileCache.get(key);
  if (entry && Date.now() - entry.fetchedAt < FILE_CACHE_TTL) return entry.content;
  fileCache.delete(key);
  return null;
}

function setCachedFile(owner: string, repo: string, branch: string, filePath: string, content: CodeFileContent) {
  const key = `${owner}/${repo}/${branch}/${filePath}`;
  fileCache.set(key, { content, fetchedAt: Date.now() });
  // Evict oldest entries if over limit
  if (fileCache.size > MAX_FILE_CACHE) {
    const entries = [...fileCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
    const toRemove = entries.slice(0, entries.length - MAX_FILE_CACHE);
    for (const [k] of toRemove) {
      fileCache.delete(k);
    }
  }
}

// --- Source Resolution ---

interface LocalSource {
  type: "local";
  repoPath: string;
}

interface GitHubSource {
  type: "github";
  pat: string;
  owner: string;
  repo: string;
  defaultBranch: string;
}

type CodeSource = LocalSource | GitHubSource;

async function resolveCodeSource(repoId: string): Promise<CodeSource | null> {
  const db = await getDb();
  const row = await queryOne<{
    local_path: string;
    source: string | null;
    github_url: string | null;
    github_account_id: string | null;
    default_branch: string;
  }>(db, "SELECT local_path, source, github_url, github_account_id, default_branch FROM repos WHERE id = ?", [repoId]);

  if (!row) return null;

  // Prefer local if path exists on disk
  const localPath = expandTilde(row.local_path);
  try {
    await fs.access(localPath);
    return { type: "local", repoPath: localPath };
  } catch {
    // Local path doesn't exist — try GitHub
  }

  // GitHub source
  if (row.github_url) {
    const pat = await getGitHubPat(db, row.github_account_id);
    if (!pat) return null;

    const parsed = parseGitHubUrl(row.github_url);
    if (!parsed) return null;

    return {
      type: "github",
      pat,
      owner: parsed.owner,
      repo: parsed.repo,
      defaultBranch: row.default_branch || "main",
    };
  }

  return null;
}

async function getGitHubPat(db: Awaited<ReturnType<typeof getDb>>, accountId: string | null): Promise<string | null> {
  // Try specific account first
  if (accountId) {
    const account = await queryOne<{ pat_encrypted: string }>(
      db,
      "SELECT pat_encrypted FROM github_accounts WHERE id = ?",
      [accountId],
    );
    if (account) {
      const key = await getEncryptionKey();
      if (key) {
        const { decrypt } = await import("@/lib/services/encryption");
        return decrypt(account.pat_encrypted, key);
      }
    }
  }

  // Try default account
  const defaultAccount = await queryOne<{ pat_encrypted: string }>(
    db,
    "SELECT pat_encrypted FROM github_accounts WHERE is_default = true LIMIT 1",
  );
  if (defaultAccount) {
    const key = await getEncryptionKey();
    if (key) {
      const { decrypt } = await import("@/lib/services/encryption");
      return decrypt(defaultAccount.pat_encrypted, key);
    }
  }

  // Fall back to env
  const { readEnvLocal } = await import("@/lib/actions/env-keys");
  const env = await readEnvLocal();
  return env.GITHUB_PERSONAL_ACCESS_TOKEN?.length > 0 ? env.GITHUB_PERSONAL_ACCESS_TOKEN : null;
}

// --- Local Helpers ---

function validatePath(repoPath: string, targetPath: string): string {
  const resolved = nodePath.resolve(repoPath, targetPath);
  if (resolved !== repoPath && !resolved.startsWith(repoPath + nodePath.sep)) {
    throw new Error("Invalid path: traversal detected");
  }
  return resolved;
}

async function gitExec(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 10000,
  });
  return stdout;
}

function isImportantDotfile(name: string): boolean {
  const important = [
    ".gitignore",
    ".env.example",
    ".env.local.example",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.cjs",
    ".prettierrc",
    ".prettierrc.js",
    ".prettierrc.json",
    ".editorconfig",
    ".npmrc",
    ".nvmrc",
    ".node-version",
    ".dockerignore",
    ".github",
    ".vscode",
    ".husky",
  ];
  return important.includes(name);
}

// --- Directory Listing ---

export async function getDirectoryContents(repoId: string, dirPath: string): Promise<CodeTreeEntry[]> {
  const source = await resolveCodeSource(repoId);
  if (!source) return [];

  if (source.type === "github") {
    return getDirectoryContentsGitHub(source, dirPath);
  }
  return getDirectoryContentsLocal(source.repoPath, dirPath);
}

async function getDirectoryContentsLocal(repoPath: string, dirPath: string): Promise<CodeTreeEntry[]> {
  const targetDir = dirPath ? validatePath(repoPath, dirPath) : repoPath;

  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const result: CodeTreeEntry[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") && !isImportantDotfile(entry.name)) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;

      const entryPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
      const fullPath = nodePath.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        result.push({ name: entry.name, path: entryPath, type: "directory" });
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath);
          result.push({ name: entry.name, path: entryPath, type: "file", size: stats.size });
        } catch {
          result.push({ name: entry.name, path: entryPath, type: "file" });
        }
      }
    }

    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return result;
  } catch {
    return [];
  }
}

async function getDirectoryContentsGitHub(source: GitHubSource, dirPath: string): Promise<CodeTreeEntry[]> {
  try {
    let tree = getCachedTree(source.owner, source.repo, source.defaultBranch, true);
    if (!tree) {
      tree = await ghGetRepoTree(source.pat, source.owner, source.repo, source.defaultBranch, true);
      setCachedTree(source.owner, source.repo, source.defaultBranch, true, tree);
    }
    const prefix = dirPath ? `${dirPath}/` : "";
    const result: CodeTreeEntry[] = [];
    const seen = new Set<string>();

    for (const entry of tree) {
      if (dirPath && !entry.path.startsWith(prefix)) continue;
      if (dirPath && entry.path === dirPath) continue;

      const relativePath = dirPath ? entry.path.slice(prefix.length) : entry.path;
      // Only show direct children (no nested paths)
      if (relativePath.includes("/")) {
        // But add the first directory segment
        const dirName = relativePath.split("/")[0];
        const dirEntryPath = dirPath ? `${dirPath}/${dirName}` : dirName;
        if (!seen.has(dirEntryPath)) {
          seen.add(dirEntryPath);
          result.push({ name: dirName, path: dirEntryPath, type: "directory" });
        }
        continue;
      }

      const name = nodePath.basename(entry.path);
      if (entry.type === "tree") {
        if (!seen.has(entry.path)) {
          seen.add(entry.path);
          result.push({ name, path: entry.path, type: "directory" });
        }
      } else {
        result.push({ name, path: entry.path, type: "file", size: entry.size, sha: entry.sha });
      }
    }

    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return result;
  } catch {
    return [];
  }
}

// --- File Content ---

export async function getCodeFileContent(repoId: string, filePath: string): Promise<CodeFileContent | null> {
  const source = await resolveCodeSource(repoId);
  if (!source) return null;

  if (source.type === "github") {
    return getCodeFileContentGitHub(source, filePath);
  }
  return getCodeFileContentLocal(source.repoPath, filePath);
}

async function getCodeFileContentLocal(repoPath: string, filePath: string): Promise<CodeFileContent | null> {
  const fullPath = validatePath(repoPath, filePath);
  const language = detectLanguage(filePath);
  const binary = isBinaryFile(filePath);

  if (binary) {
    try {
      const stats = await fs.stat(fullPath);
      return { path: filePath, content: "", size: stats.size, language, isBinary: true };
    } catch {
      return null;
    }
  }

  try {
    const stats = await fs.stat(fullPath);
    const size = stats.size;

    if (size > MAX_FILE_SIZE) {
      const fd = await fs.open(fullPath, "r");
      const buffer = Buffer.alloc(512 * 1024);
      await fd.read(buffer, 0, buffer.length, 0);
      await fd.close();
      return { path: filePath, content: buffer.toString("utf-8"), size, language, isBinary: false };
    }

    const content = await fs.readFile(fullPath, "utf-8");
    return { path: filePath, content, size, language, isBinary: false };
  } catch {
    return null;
  }
}

async function getCodeFileContentGitHub(source: GitHubSource, filePath: string): Promise<CodeFileContent | null> {
  const language = detectLanguage(filePath);
  const binary = isBinaryFile(filePath);

  if (binary) {
    return { path: filePath, content: "", size: 0, language, isBinary: true };
  }

  // Check file cache
  const cached = getCachedFile(source.owner, source.repo, source.defaultBranch, filePath);
  if (cached) return cached;

  try {
    const content = await ghGetFileContent(source.pat, source.owner, source.repo, filePath, source.defaultBranch);
    const result: CodeFileContent = { path: filePath, content, size: content.length, language, isBinary: false };
    setCachedFile(source.owner, source.repo, source.defaultBranch, filePath, result);
    return result;
  } catch {
    return null;
  }
}

// --- Branches ---

export async function getBranches(repoId: string): Promise<CodeBranch[]> {
  const source = await resolveCodeSource(repoId);
  if (!source) return [];

  if (source.type === "github") {
    return getBranchesGitHub(source);
  }
  return getBranchesLocal(source.repoPath);
}

async function getBranchesLocal(repoPath: string): Promise<CodeBranch[]> {
  try {
    const output = await gitExec(repoPath, [
      "branch",
      "-a",
      "--format=%(refname:short)%09%(objectname:short)%09%(HEAD)",
    ]);

    let defaultBranch = "main";
    try {
      const headRef = await gitExec(repoPath, ["symbolic-ref", "--short", "HEAD"]);
      defaultBranch = headRef.trim();
    } catch {
      // detached HEAD
    }

    const branches: CodeBranch[] = [];
    const seen = new Set<string>();

    for (const line of output.trim().split("\n")) {
      if (!line.trim()) continue;
      const [rawName, sha, head] = line.split("\t");
      let name = rawName.trim();

      if (name.includes("/HEAD")) continue;
      if (name.startsWith("origin/")) name = name.slice(7);
      if (seen.has(name)) continue;
      seen.add(name);

      branches.push({
        name,
        sha: sha?.trim() || "",
        isCurrent: head?.trim() === "*",
        isDefault: name === defaultBranch,
      });
    }

    branches.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return branches;
  } catch {
    return [];
  }
}

async function getBranchesGitHub(source: GitHubSource): Promise<CodeBranch[]> {
  try {
    const ghBranches = await ghGetRepoBranches(source.pat, source.owner, source.repo);
    return ghBranches.map((b) => ({
      name: b.name,
      sha: b.commit.sha,
      isCurrent: b.name === source.defaultBranch,
      isDefault: b.name === source.defaultBranch,
    }));
  } catch {
    return [];
  }
}

// --- Commit Log ---

export async function getCommitLog(
  repoId: string,
  branch?: string,
  limit = 20,
  filePath?: string,
): Promise<CodeCommitInfo[]> {
  const source = await resolveCodeSource(repoId);
  if (!source) return [];

  if (source.type === "github") {
    return getCommitLogGitHub(source, branch, limit, filePath);
  }
  return getCommitLogLocal(source.repoPath, branch, limit, filePath);
}

async function getCommitLogLocal(
  repoPath: string,
  branch?: string,
  limit = 20,
  filePath?: string,
): Promise<CodeCommitInfo[]> {
  try {
    const args = ["log", `--max-count=${limit}`, "--format=%H%x09%s%x09%an%x09%ae%x09%aI"];
    if (branch) args.push(branch);
    if (filePath) {
      args.push("--");
      args.push(filePath);
    }

    const output = await gitExec(repoPath, args);
    const commits: CodeCommitInfo[] = [];

    for (const line of output.trim().split("\n")) {
      if (!line.trim()) continue;
      const [sha, message, author, authorEmail, date] = line.split("\t");
      commits.push({ sha, message, author, authorEmail, date });
    }

    return commits;
  } catch {
    return [];
  }
}

async function getCommitLogGitHub(
  source: GitHubSource,
  branch?: string,
  limit = 20,
  filePath?: string,
): Promise<CodeCommitInfo[]> {
  try {
    const ghCommits = await ghGetRepoCommits(source.pat, source.owner, source.repo, {
      sha: branch || source.defaultBranch,
      path: filePath,
      per_page: limit,
    });

    return ghCommits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      authorEmail: c.commit.author.email,
      date: c.commit.author.date,
    }));
  } catch {
    return [];
  }
}

// --- README ---

export async function getReadmeContent(repoId: string): Promise<string | null> {
  const source = await resolveCodeSource(repoId);
  if (!source) return null;

  if (source.type === "github") {
    return getReadmeContentGitHub(source);
  }
  return getReadmeContentLocal(source.repoPath);
}

async function getReadmeContentLocal(repoPath: string): Promise<string | null> {
  const candidates = ["README.md", "readme.md", "Readme.md", "README.MD", "README", "README.txt", "README.rst"];

  for (const name of candidates) {
    try {
      const content = await fs.readFile(nodePath.join(repoPath, name), "utf-8");
      return content;
    } catch {
      // Try next candidate
    }
  }

  return null;
}

async function getReadmeContentGitHub(source: GitHubSource): Promise<string | null> {
  const candidates = ["README.md", "readme.md", "Readme.md"];

  for (const name of candidates) {
    try {
      return await ghGetFileContent(source.pat, source.owner, source.repo, name, source.defaultBranch);
    } catch {
      // Try next candidate
    }
  }

  return null;
}

// --- Flat File Tree (for search) ---

export async function getFileTree(repoId: string): Promise<CodeTreeEntry[]> {
  const source = await resolveCodeSource(repoId);
  if (!source) return [];

  if (source.type === "github") {
    return getFileTreeGitHub(source);
  }
  return getFileTreeLocal(source.repoPath);
}

async function getFileTreeLocal(repoPath: string): Promise<CodeTreeEntry[]> {
  try {
    const output = await gitExec(repoPath, ["ls-files", "--cached", "--others", "--exclude-standard"]);
    const entries: CodeTreeEntry[] = [];

    for (const line of output.trim().split("\n")) {
      if (!line.trim()) continue;
      const name = nodePath.basename(line);
      entries.push({ name, path: line, type: "file" });
    }

    return entries;
  } catch {
    return [];
  }
}

async function getFileTreeGitHub(source: GitHubSource): Promise<CodeTreeEntry[]> {
  try {
    let tree = getCachedTree(source.owner, source.repo, source.defaultBranch, false);
    if (!tree) {
      tree = await ghGetRepoTree(source.pat, source.owner, source.repo, source.defaultBranch);
      setCachedTree(source.owner, source.repo, source.defaultBranch, false, tree);
    }
    return tree.map((e) => ({
      name: nodePath.basename(e.path),
      path: e.path,
      type: "file" as const,
      size: e.size,
      sha: e.sha,
    }));
  } catch {
    return [];
  }
}

// --- Last commit for a directory entry ---

export async function getLastCommitForPath(repoId: string, filePath: string): Promise<CodeCommitInfo | null> {
  const source = await resolveCodeSource(repoId);
  if (!source) return null;

  if (source.type === "github") {
    return getLastCommitForPathGitHub(source, filePath);
  }
  return getLastCommitForPathLocal(source.repoPath, filePath);
}

async function getLastCommitForPathLocal(repoPath: string, filePath: string): Promise<CodeCommitInfo | null> {
  try {
    const output = await gitExec(repoPath, ["log", "-1", "--format=%H%x09%s%x09%an%x09%ae%x09%aI", "--", filePath]);

    const line = output.trim();
    if (!line) return null;

    const [sha, message, author, authorEmail, date] = line.split("\t");
    return { sha, message, author, authorEmail, date };
  } catch {
    return null;
  }
}

async function getLastCommitForPathGitHub(source: GitHubSource, filePath: string): Promise<CodeCommitInfo | null> {
  try {
    const result = await ghGetFileLastCommit(source.pat, source.owner, source.repo, filePath, source.defaultBranch);
    if (!result) return null;

    return {
      sha: "",
      message: result.message,
      author: result.author,
      date: result.date,
    };
  } catch {
    return null;
  }
}

// --- Commit Detail ---

export async function getCommitDetailAction(repoId: string, sha: string): Promise<CommitDetail | null> {
  const source = await resolveCodeSource(repoId);
  if (!source) return null;

  if (source.type === "github") {
    return getCommitDetailGitHub(source, sha);
  }
  return getCommitDetailLocal(source.repoPath, sha);
}

async function getCommitDetailLocal(repoPath: string, sha: string): Promise<CommitDetail | null> {
  try {
    // Get commit info
    const infoOutput = await gitExec(repoPath, ["log", "-1", "--format=%H%x09%s%x09%an%x09%ae%x09%aI", sha]);
    const infoLine = infoOutput.trim();
    if (!infoLine) return null;

    const [commitSha, message, author, authorEmail, date] = infoLine.split("\t");

    // Get file stats with --numstat for additions/deletions
    const numstatOutput = await gitExec(repoPath, [
      "diff-tree",
      "--no-commit-id",
      "-r",
      "--numstat",
      "--find-renames",
      sha,
    ]);

    // Get file statuses (A/M/D/R)
    const nameStatusOutput = await gitExec(repoPath, [
      "diff-tree",
      "--no-commit-id",
      "-r",
      "--name-status",
      "--find-renames",
      sha,
    ]);

    const statusMap = new Map<string, { status: string; previousPath?: string }>();
    for (const line of nameStatusOutput.trim().split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      const statusChar = parts[0].charAt(0);
      if (statusChar === "R") {
        // Renamed: R<score>\told_path\tnew_path
        statusMap.set(parts[2], { status: "renamed", previousPath: parts[1] });
      } else {
        statusMap.set(parts[1], {
          status:
            statusChar === "A" ? "added" : statusChar === "D" ? "deleted" : statusChar === "C" ? "copied" : "modified",
        });
      }
    }

    const files: CommitFile[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const line of numstatOutput.trim().split("\n")) {
      if (!line.trim()) continue;
      const [addStr, delStr, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t"); // Handle renamed files with tab in path
      const additions = addStr === "-" ? 0 : Number.parseInt(addStr, 10);
      const deletions = delStr === "-" ? 0 : Number.parseInt(delStr, 10);
      totalAdditions += additions;
      totalDeletions += deletions;

      const statusInfo = statusMap.get(filePath) || { status: "modified" };

      files.push({
        path: filePath,
        status: statusInfo.status as CommitFile["status"],
        additions,
        deletions,
        previousPath: statusInfo.previousPath,
      });
    }

    // Get patches for each file (limited to avoid huge output)
    if (files.length <= 50) {
      try {
        const patchOutput = await gitExec(repoPath, ["diff-tree", "--no-commit-id", "-r", "-p", "--find-renames", sha]);
        const patches = parseDiffPatches(patchOutput);
        for (const file of files) {
          file.patch = patches.get(file.path) || patches.get(file.previousPath || "");
        }
      } catch {
        // Patch retrieval is best-effort
      }
    }

    return {
      sha: commitSha,
      message,
      author,
      authorEmail,
      date,
      files,
      stats: { additions: totalAdditions, deletions: totalDeletions, total: totalAdditions + totalDeletions },
    };
  } catch {
    return null;
  }
}

function parseDiffPatches(diffOutput: string): Map<string, string> {
  const patches = new Map<string, string>();
  const diffParts = diffOutput.split(/^diff --git /m);

  for (const part of diffParts) {
    if (!part.trim()) continue;
    // Extract the b/ path from "a/old_path b/new_path\n..."
    const firstLine = part.split("\n")[0];
    const bMatch = firstLine.match(/b\/(.+)$/);
    if (!bMatch) continue;

    // Find the actual hunk starting from @@ or Binary files
    const hunkStart = part.indexOf("\n@@");
    if (hunkStart !== -1) {
      patches.set(bMatch[1], part.slice(hunkStart + 1));
    }
  }

  return patches;
}

async function getCommitDetailGitHub(source: GitHubSource, sha: string): Promise<CommitDetail | null> {
  try {
    const detail = await ghGetCommitDetail(source.pat, source.owner, source.repo, sha);
    return {
      sha: detail.sha,
      message: detail.commit.message,
      author: detail.commit.author.name,
      authorEmail: detail.commit.author.email,
      date: detail.commit.author.date,
      files: detail.files.map((f) => ({
        path: f.filename,
        status: (f.status === "removed" ? "deleted" : f.status) as CommitFile["status"],
        additions: f.additions,
        deletions: f.deletions,
        previousPath: f.previous_filename,
        patch: f.patch,
      })),
      stats: detail.stats,
    };
  } catch {
    return null;
  }
}

// --- Single-file commit patch (on-demand) ---

export async function getCommitFilePatch(
  repoId: string,
  sha: string,
  filePath: string,
): Promise<{ patch: string | null; error?: string }> {
  const source = await resolveCodeSource(repoId);
  if (!source) return { patch: null, error: "Could not resolve repo source" };

  if (source.type === "github") {
    return getCommitFilePatchGitHub(source, sha, filePath);
  }
  return getCommitFilePatchLocal(source.repoPath, sha, filePath);
}

async function getCommitFilePatchLocal(
  repoPath: string,
  sha: string,
  filePath: string,
): Promise<{ patch: string | null; error?: string }> {
  try {
    const output = await gitExec(repoPath, [
      "diff-tree",
      "--no-commit-id",
      "-r",
      "-p",
      "--find-renames",
      sha,
      "--",
      filePath,
    ]);
    if (!output.trim()) {
      return { patch: null, error: "No diff output (binary file or empty change)" };
    }
    const patches = parseDiffPatches(output);
    const patch = patches.get(filePath) || [...patches.values()][0] || null;
    if (!patch) {
      return { patch: null, error: "No hunk data in diff (binary file)" };
    }
    return { patch };
  } catch (err) {
    return { patch: null, error: err instanceof Error ? err.message : "Failed to get patch" };
  }
}

async function getCommitFilePatchGitHub(
  source: GitHubSource,
  sha: string,
  filePath: string,
): Promise<{ patch: string | null; error?: string }> {
  try {
    const detail = await ghGetCommitDetail(source.pat, source.owner, source.repo, sha);
    const file = detail.files.find((f) => f.filename === filePath);
    if (!file) return { patch: null, error: "File not found in commit" };
    if (!file.patch) return { patch: null, error: "No patch available (binary or too large)" };
    return { patch: file.patch };
  } catch (err) {
    return { patch: null, error: err instanceof Error ? err.message : "GitHub API error" };
  }
}

// --- Git Changes ---

export async function getGitStatus(repoId: string): Promise<GitStatusResult | null> {
  const source = await resolveCodeSource(repoId);
  if (!source || source.type !== "local") return null;

  try {
    const output = await gitExec(source.repoPath, ["status", "--porcelain=v2", "--branch"]);
    const lines = output.split("\n");
    const files: GitStatusFile[] = [];
    let branch = "";
    let ahead = 0;
    let behind = 0;

    for (const line of lines) {
      if (!line.trim()) continue;

      // Branch header lines
      if (line.startsWith("# branch.head ")) {
        branch = line.slice("# branch.head ".length);
      } else if (line.startsWith("# branch.ab ")) {
        const abMatch = line.match(/\+(\d+) -(\d+)/);
        if (abMatch) {
          ahead = Number.parseInt(abMatch[1], 10);
          behind = Number.parseInt(abMatch[2], 10);
        }
      } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
        // Changed entries (1 = ordinary, 2 = renamed/copied)
        const parts = line.split(" ");
        const xy = parts[1]; // two-char status: XY
        const isRenamed = line.startsWith("2 ");

        let filePath: string;
        if (isRenamed) {
          // Format: 2 XY ... Rscore path\torigPath
          const tabIdx = line.indexOf("\t");
          const pathPart = line.slice(tabIdx + 1);
          const pathParts = pathPart.split("\t");
          filePath = pathParts[0];
        } else {
          // Format: 1 XY ... path
          filePath = parts.slice(8).join(" ");
        }

        const indexStatus = xy[0]; // staged status
        const wtStatus = xy[1]; // unstaged status

        // Staged version
        if (indexStatus !== ".") {
          files.push({
            path: filePath,
            status: parseStatusChar(indexStatus, isRenamed),
            staged: true,
          });
        }

        // Unstaged version
        if (wtStatus !== ".") {
          files.push({
            path: filePath,
            status: parseStatusChar(wtStatus, false),
            staged: false,
          });
        }
      } else if (line.startsWith("? ")) {
        // Untracked file
        const filePath = line.slice(2);
        files.push({ path: filePath, status: "untracked", staged: false });
      }
    }

    return { files, branch, ahead, behind };
  } catch {
    return null;
  }
}

export async function getGitChangedFileCount(repoId: string): Promise<number> {
  const source = await resolveCodeSource(repoId);
  if (!source || source.type !== "local") return 0;

  try {
    const output = await gitExec(source.repoPath, ["status", "--porcelain", "--short"]);
    return output.split("\n").filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

function parseStatusChar(char: string, isRenamed: boolean): GitFileStatus {
  if (isRenamed) return "renamed";
  switch (char) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}

export async function getWorkingDiff(repoId: string, filePath: string, staged: boolean): Promise<string | null> {
  const source = await resolveCodeSource(repoId);
  if (!source || source.type !== "local") return null;

  try {
    // Check if file is untracked
    const statusOutput = await gitExec(source.repoPath, ["status", "--porcelain", "--", filePath]);
    const isUntracked = statusOutput.trimStart().startsWith("??");

    if (isUntracked) {
      // Show full file content as a diff for untracked files
      const fullPath = validatePath(source.repoPath, filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n");
      const diffLines = [`--- /dev/null`, `+++ b/${filePath}`, `@@ -0,0 +1,${lines.length} @@`];
      for (const line of lines) {
        diffLines.push(`+${line}`);
      }
      return diffLines.join("\n");
    }

    const args = ["diff"];
    if (staged) args.push("--cached");
    args.push("--", filePath);

    const output = await gitExec(source.repoPath, args);
    if (!output.trim()) return null;

    // Extract just the hunk portion
    const hunkStart = output.indexOf("\n@@");
    return hunkStart !== -1 ? output.slice(hunkStart + 1) : output;
  } catch {
    return null;
  }
}

export async function stageFiles(repoId: string, paths: string[]): Promise<boolean> {
  const source = await resolveCodeSource(repoId);
  if (!source || source.type !== "local") return false;

  try {
    await gitExec(source.repoPath, ["add", "--", ...paths]);
    return true;
  } catch {
    return false;
  }
}

export async function unstageFiles(repoId: string, paths: string[]): Promise<boolean> {
  const source = await resolveCodeSource(repoId);
  if (!source || source.type !== "local") return false;

  try {
    await gitExec(source.repoPath, ["reset", "HEAD", "--", ...paths]);
    return true;
  } catch {
    return false;
  }
}

export async function openInFinder(repoId: string, subPath?: string): Promise<boolean> {
  const source = await resolveCodeSource(repoId);
  if (!source || source.type !== "local") return false;

  const target = subPath ? nodePath.join(source.repoPath, subPath) : source.repoPath;
  return openFolderInFinder(target);
}

export async function openFolderInFinder(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    const stat = await fs.stat(targetPath);
    const folder = stat.isFile() ? nodePath.dirname(targetPath) : targetPath;
    await execFileAsync("open", [folder]);
    return true;
  } catch {
    return false;
  }
}

export async function commitChanges(
  repoId: string,
  message: string,
): Promise<{ success: boolean; sha?: string; error?: string }> {
  const source = await resolveCodeSource(repoId);
  if (!source || source.type !== "local") return { success: false, error: "Not a local repository" };

  try {
    const output = await gitExec(source.repoPath, ["commit", "-m", message]);
    // Extract sha from output like "[branch abc1234] message"
    const shaMatch = output.match(/\[.+\s+([a-f0-9]+)\]/);
    return { success: true, sha: shaMatch?.[1] };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Commit failed";
    return { success: false, error: errorMessage };
  }
}
