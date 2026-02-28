import { createServiceLogger } from "@/lib/logger";

const log = createServiceLogger("github-client");
const GITHUB_API = "https://api.github.com";

// --- ETag Response Cache ---

interface CachedResponse {
  data: unknown;
  etag: string;
  fetchedAt: number;
}

const responseCache = new Map<string, CachedResponse>();
const inflightRequests = new Map<string, Promise<unknown>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min hard TTL
const MAX_CACHE_ENTRIES = 500;

// --- Rate Limit Tracking ---

let rateLimitRemaining = 5000;
let rateLimitReset = 0;

function updateRateLimit(headers: Headers): void {
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  if (remaining != null) rateLimitRemaining = Number.parseInt(remaining, 10);
  if (reset != null) rateLimitReset = Number.parseInt(reset, 10);

  if (rateLimitRemaining > 0 && rateLimitRemaining < 100) {
    log.warn({ remaining: rateLimitRemaining }, "GitHub rate limit low");
  }
}

function buildCacheKey(endpoint: string, params?: Record<string, string>): string {
  const sorted = params ? Object.entries(params).sort(([a], [b]) => a.localeCompare(b)) : [];
  const qs = sorted.map(([k, v]) => `${k}=${v}`).join("&");
  return qs ? `${endpoint}?${qs}` : endpoint;
}

function evictOldestEntries(): void {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = [...responseCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
  for (const [key] of toRemove) {
    responseCache.delete(key);
  }
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  description: string | null;
  default_branch: string;
  visibility: string;
  stargazers_count: number;
  open_issues_count: number;
  topics: string[];
  pushed_at: string | null;
  updated_at: string | null;
  owner: { login: string; avatar_url: string };
}

interface GitHubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

async function githubFetch<T>(pat: string, endpoint: string, params?: Record<string, string>): Promise<T> {
  const cacheKey = buildCacheKey(endpoint, params);

  // Request deduplication — return in-flight promise if one exists
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) return inflight as Promise<T>;

  const promise = githubFetchInner<T>(pat, endpoint, params, cacheKey);
  inflightRequests.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

async function githubFetchInner<T>(
  pat: string,
  endpoint: string,
  params: Record<string, string> | undefined,
  cacheKey: string,
): Promise<T> {
  // Check rate limit before making request
  if (rateLimitRemaining === 0 && Date.now() / 1000 < rateLimitReset) {
    const resetDate = new Date(rateLimitReset * 1000);
    throw new Error(`GitHub rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`);
  }

  const url = new URL(`${GITHUB_API}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // ETag conditional request — send If-None-Match if we have a cached response
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    headers["If-None-Match"] = cached.etag;
  }

  const res = await fetch(url.toString(), { headers });

  updateRateLimit(res.headers);

  // 304 Not Modified — return cached data (doesn't count toward rate limit)
  if (res.status === 304 && cached) {
    cached.fetchedAt = Date.now();
    return cached.data as T;
  }

  if (res.status === 401) throw new Error("Invalid token");
  if (res.status === 403) {
    if (rateLimitRemaining === 0) {
      const resetDate = new Date(rateLimitReset * 1000);
      throw new Error(`GitHub rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`);
    }
    throw new Error("Rate limited or forbidden");
  }
  if (res.status === 404) throw new Error("Not found");
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  const data = (await res.json()) as T;

  // Cache the response with ETag
  const etag = res.headers.get("etag");
  if (etag) {
    responseCache.set(cacheKey, { data, etag, fetchedAt: Date.now() });
    evictOldestEntries();
  }

  return data;
}

export async function getRepoBranches(pat: string, owner: string, repo: string): Promise<GitHubBranch[]> {
  return githubFetch<GitHubBranch[]>(pat, `/repos/${owner}/${repo}/branches`, { per_page: "100" });
}

// --- Tree & file content APIs for concept scanning ---

interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

interface GitHubContentResponse {
  content: string;
  encoding: string;
  name: string;
  path: string;
  sha: string;
}

export async function getRepoTree(
  pat: string,
  owner: string,
  repo: string,
  branch: string,
  includeDirectories = false,
): Promise<GitHubTreeEntry[]> {
  const result = await githubFetch<GitHubTreeResponse>(pat, `/repos/${owner}/${repo}/git/trees/${branch}`, {
    recursive: "1",
  });
  if (includeDirectories) return result.tree;
  return result.tree.filter((e) => e.type === "blob");
}

export async function getRepoInfo(
  pat: string,
  owner: string,
  repo: string,
): Promise<{ stars: number; pushed_at: string | null; topics: string[]; description: string | null }> {
  const data = await githubFetch<GitHubRepo>(pat, `/repos/${owner}/${repo}`);
  return {
    stars: data.stargazers_count,
    pushed_at: data.pushed_at,
    topics: data.topics || [],
    description: data.description,
  };
}

export async function getFileLastCommit(
  pat: string,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): Promise<{ date: string; author: string; message: string } | null> {
  try {
    const commits = await githubFetch<Array<{ commit: { author: { name: string; date: string }; message: string } }>>(
      pat,
      `/repos/${owner}/${repo}/commits`,
      { path: filePath, sha: ref, per_page: "1" },
    );
    if (commits.length === 0) return null;
    const c = commits[0].commit;
    return { date: c.author.date, author: c.author.name, message: c.message };
  } catch {
    return null;
  }
}

export async function getFileContent(
  pat: string,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): Promise<string> {
  const result = await githubFetch<GitHubContentResponse>(pat, `/repos/${owner}/${repo}/contents/${filePath}`, { ref });
  return Buffer.from(result.content, "base64").toString("utf-8");
}

interface GitHubCommitEntry {
  sha: string;
  commit: {
    author: { name: string; email: string; date: string };
    message: string;
  };
}

export async function getRepoCommits(
  pat: string,
  owner: string,
  repo: string,
  opts?: { sha?: string; path?: string; per_page?: number },
): Promise<GitHubCommitEntry[]> {
  const params: Record<string, string> = {
    per_page: String(opts?.per_page ?? 20),
  };
  if (opts?.sha) params.sha = opts.sha;
  if (opts?.path) params.path = opts.path;

  return githubFetch<GitHubCommitEntry[]>(pat, `/repos/${owner}/${repo}/commits`, params);
}

interface GitHubCommitDetailFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

interface GitHubCommitDetail {
  sha: string;
  commit: {
    author: { name: string; email: string; date: string };
    message: string;
  };
  stats: { additions: number; deletions: number; total: number };
  files: GitHubCommitDetailFile[];
}

export async function getCommitDetail(
  pat: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<GitHubCommitDetail> {
  return githubFetch<GitHubCommitDetail>(pat, `/repos/${owner}/${repo}/commits/${sha}`);
}

// --- Write APIs (no caching needed) ---

async function githubPost<T>(pat: string, endpoint: string, body: Record<string, unknown>): Promise<T> {
  if (rateLimitRemaining === 0 && Date.now() / 1000 < rateLimitReset) {
    const resetDate = new Date(rateLimitReset * 1000);
    throw new Error(`GitHub rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`);
  }

  const res = await fetch(`${GITHUB_API}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  updateRateLimit(res.headers);

  if (res.status === 401) throw new Error("Invalid token");
  if (res.status === 403) throw new Error("Forbidden — check token permissions");
  if (res.status === 422) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message || "Validation failed");
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  return (await res.json()) as T;
}

interface GitHubUser {
  login: string;
  avatar_url: string;
}

interface GitHubOrg {
  login: string;
  avatar_url: string;
}

export async function getAuthenticatedUser(pat: string): Promise<GitHubUser> {
  return githubFetch<GitHubUser>(pat, "/user");
}

export async function getUserOrgs(pat: string): Promise<GitHubOrg[]> {
  return githubFetch<GitHubOrg[]>(pat, "/user/orgs", { per_page: "100" });
}

interface CreateRepoOptions {
  name: string;
  description?: string;
  isPrivate?: boolean;
  org?: string;
}

interface CreateRepoResult {
  html_url: string;
  clone_url: string;
  ssh_url: string;
  full_name: string;
  default_branch: string;
}

async function githubPatch<T>(pat: string, endpoint: string, body: Record<string, unknown>): Promise<T> {
  if (rateLimitRemaining === 0 && Date.now() / 1000 < rateLimitReset) {
    const resetDate = new Date(rateLimitReset * 1000);
    throw new Error(`GitHub rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`);
  }

  const res = await fetch(`${GITHUB_API}${endpoint}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  updateRateLimit(res.headers);

  if (res.status === 401) throw new Error("Invalid token");
  if (res.status === 403) throw new Error("Forbidden — check token permissions");
  if (res.status === 422) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message || "Validation failed");
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  return (await res.json()) as T;
}

// --- GitHub Repo Settings ---

export interface GitHubRepoSettings {
  // Read-only stats
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  open_issues: number;
  open_prs: number;
  watchers_count: number;
  language: string | null;
  size: number;
  license: { key: string; name: string; spdx_id: string } | null;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  topics: string[];
  html_url: string;
  // Editable fields
  description: string | null;
  homepage: string | null;
  private: boolean;
  visibility: string;
  default_branch: string;
  has_issues: boolean;
  has_projects: boolean;
  has_wiki: boolean;
  has_discussions: boolean;
  is_template: boolean;
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  allow_rebase_merge: boolean;
  allow_auto_merge: boolean;
  allow_update_branch: boolean;
  delete_branch_on_merge: boolean;
  squash_merge_commit_title: string;
  squash_merge_commit_message: string;
  merge_commit_title: string;
  merge_commit_message: string;
  allow_forking: boolean;
  web_commit_signoff_required: boolean;
  archived: boolean;
}

type GitHubRepoSettingsUpdate = Partial<
  Pick<
    GitHubRepoSettings,
    | "description"
    | "homepage"
    | "private"
    | "visibility"
    | "has_issues"
    | "has_projects"
    | "has_wiki"
    | "has_discussions"
    | "is_template"
    | "allow_squash_merge"
    | "allow_merge_commit"
    | "allow_rebase_merge"
    | "allow_auto_merge"
    | "allow_update_branch"
    | "delete_branch_on_merge"
    | "squash_merge_commit_title"
    | "squash_merge_commit_message"
    | "merge_commit_title"
    | "merge_commit_message"
    | "allow_forking"
    | "web_commit_signoff_required"
    | "archived"
  >
>;

export async function getRepoSettings(pat: string, owner: string, repo: string): Promise<GitHubRepoSettings> {
  const [settings, issueCount, prCount] = await Promise.all([
    githubFetch<GitHubRepoSettings>(pat, `/repos/${owner}/${repo}`),
    githubFetch<{ total_count: number }>(pat, "/search/issues", {
      q: `repo:${owner}/${repo} is:issue is:open`,
      per_page: "1",
    }).catch(() => ({ total_count: 0 })),
    githubFetch<{ total_count: number }>(pat, "/search/issues", {
      q: `repo:${owner}/${repo} is:pr is:open`,
      per_page: "1",
    }).catch(() => ({ total_count: 0 })),
  ]);
  settings.open_issues = issueCount.total_count;
  settings.open_prs = prCount.total_count;
  return settings;
}

export async function updateRepoSettings(
  pat: string,
  owner: string,
  repo: string,
  updates: GitHubRepoSettingsUpdate,
): Promise<GitHubRepoSettings> {
  return githubPatch<GitHubRepoSettings>(pat, `/repos/${owner}/${repo}`, updates as Record<string, unknown>);
}

export async function createRepository(pat: string, opts: CreateRepoOptions): Promise<CreateRepoResult> {
  const endpoint = opts.org ? `/orgs/${opts.org}/repos` : "/user/repos";
  const body: Record<string, unknown> = {
    name: opts.name,
    private: opts.isPrivate ?? true,
  };
  if (opts.description) body.description = opts.description;

  return githubPost<CreateRepoResult>(pat, endpoint, body);
}
