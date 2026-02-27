import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getOctokit } from "@/lib/github";
import { createServiceLogger } from "@/lib/logger";

const execFileAsync = promisify(execFile);
const log = createServiceLogger("git-operations");

const REPOS_DIR = path.join(os.homedir(), ".inspector", "repos");

function getRepoDir(owner: string, name: string): string {
  return path.join(REPOS_DIR, owner, name);
}

function getAuthUrl(owner: string, name: string, pat: string): string {
  return `https://${pat}@github.com/${owner}/${name}.git`;
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export async function cloneOrUpdateRepo(owner: string, name: string, pat: string): Promise<string> {
  const repoDir = getRepoDir(owner, name);
  const exists = await fs
    .access(repoDir)
    .then(() => true)
    .catch(() => false);

  if (exists) {
    log.info({ owner, name }, "Updating existing repo clone");
    await git(repoDir, ["fetch", "--all", "--prune"]);
    return repoDir;
  }

  log.info({ owner, name }, "Cloning repo");
  await fs.mkdir(path.dirname(repoDir), { recursive: true });
  const url = getAuthUrl(owner, name, pat);
  await execFileAsync("git", ["clone", url, repoDir], { maxBuffer: 10 * 1024 * 1024 });
  return repoDir;
}

export async function createBranch(repoPath: string, baseBranch: string, newBranch: string): Promise<void> {
  await git(repoPath, ["checkout", baseBranch]);
  await git(repoPath, ["pull", "origin", baseBranch]);
  await git(repoPath, ["checkout", "-b", newBranch]);
}

export async function checkoutFiles(repoPath: string, sourceBranch: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await git(repoPath, ["checkout", sourceBranch, "--", ...files]);
}

export async function commitAndPush(
  repoPath: string,
  branch: string,
  message: string,
  pat: string,
  owner: string,
  name: string,
): Promise<string> {
  await git(repoPath, ["add", "-A"]);

  // Check if there are staged changes
  try {
    await git(repoPath, ["diff", "--cached", "--quiet"]);
    // No changes staged
    return "";
  } catch {
    // Changes exist (git diff --quiet exits non-zero when there are diffs)
  }

  await git(repoPath, ["commit", "-m", message]);
  const sha = await git(repoPath, ["rev-parse", "HEAD"]);

  const remoteUrl = getAuthUrl(owner, name, pat);
  await git(repoPath, ["push", remoteUrl, `${branch}:${branch}`]);

  return sha;
}

export async function createGitHubPR(
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<{ number: number; url: string }> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });
  return { number: data.number, url: data.html_url };
}

export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  await git(repoPath, ["checkout", branch]);
}

export function getPAT(): string {
  const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!pat) throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN not set");
  return pat;
}
