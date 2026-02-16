/**
 * GitHub Repository Service
 *
 * All repository-scoped operations for the multi-repo architecture.
 */

import { queryOne } from "../../db/helpers.js";
import { getConn } from "../../db/index.js";
import type { DbRepository } from "../../db/schema.js";
import { TIMEOUTS, withTimeout } from "../../utils/timeout.js";
import { getOctokitForRepo } from "./client.js";
import { RepositoryNotFoundError } from "./errors.js";
import type {
  CreatePullRequestOptions,
  GitHubComment,
  GitHubIssue,
  PullRequestInfo,
  PullRequestResult,
  PullRequestReviewComment,
  RepoConfig,
} from "./types.js";

/**
 * Get repository config by ID
 */
export async function getRepoConfigById(
  repositoryId: string,
): Promise<RepoConfig> {
  const conn = getConn();
  const repo = await queryOne<DbRepository>(
    conn,
    "SELECT * FROM repositories WHERE id = ?",
    [repositoryId],
  );

  if (!repo) {
    throw new RepositoryNotFoundError(repositoryId);
  }

  return {
    owner: repo.owner,
    name: repo.name,
    baseBranch: repo.base_branch,
    triggerLabel: repo.trigger_label,
  };
}

/**
 * Get both Octokit client and repo config in a single call.
 * Nearly every repo-scoped operation needs both; this avoids repeating
 * the two-line fetch pattern throughout the file.
 */
async function getRepoContext(repositoryId: string) {
  const [octokit, config] = await Promise.all([
    getOctokitForRepo(repositoryId),
    getRepoConfigById(repositoryId),
  ]);
  return { octokit, config };
}

/**
 * Map a raw GitHub API issue object to our GitHubIssue type.
 * Extracted to avoid repeating this 20-line mapping block in every
 * function that returns issues.
 */
// biome-ignore lint/suspicious/noExplicitAny: GitHub API response type is complex
function mapGitHubIssue(issue: any): GitHubIssue {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? null,
    html_url: issue.html_url,
    state: issue.state,
    labels: (issue.labels ?? [])
      .filter(
        (
          l: unknown,
        ): l is {
          id: number;
          name: string;
          color: string;
          description: string | null;
        } => typeof l === "object" && l !== null && "id" in (l as object),
      )
      .map(
        (l: {
          id: number;
          name: string;
          color: string;
          description: string | null;
        }) => ({
          id: l.id,
          name: l.name,
          color: l.color,
          description: l.description ?? null,
        }),
      ),
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    closed_at: issue.closed_at ?? null,
    user: issue.user
      ? {
          login: issue.user.login,
          avatar_url: issue.user.avatar_url,
          html_url: issue.user.html_url,
        }
      : null,
  };
}

/**
 * Get issues with a specific label for a repository
 */
export async function getIssuesWithLabel(
  repositoryId: string,
  label: string,
): Promise<GitHubIssue[]> {
  const { octokit, config } = await getRepoContext(repositoryId);

  try {
    const response = await withTimeout(
      octokit.rest.issues.listForRepo({
        owner: config.owner,
        repo: config.name,
        labels: label,
        state: "open",
        per_page: 100,
      }),
      TIMEOUTS.GITHUB_API,
      "getIssuesWithLabel",
    );

    return response.data.map(mapGitHubIssue);
  } catch (error) {
    console.error(
      `[github] Failed to fetch issues for ${config.owner}/${config.name}:`,
      error,
    );
    return [];
  }
}

/**
 * Get issue comments for a specific repository
 */
export async function getIssueCommentsForRepo(
  repositoryId: string,
  issueNumber: number,
  sinceCommentId?: number,
): Promise<GitHubComment[]> {
  const { octokit, config } = await getRepoContext(repositoryId);

  const response = await withTimeout(
    octokit.rest.issues.listComments({
      owner: config.owner,
      repo: config.name,
      issue_number: issueNumber,
      per_page: 100,
    }),
    TIMEOUTS.GITHUB_API,
    "getIssueCommentsForRepo",
  );

  let comments = response.data.map((c) => ({
    id: c.id,
    body: c.body ?? "",
    html_url: c.html_url,
    user: c.user
      ? {
          login: c.user.login,
          type: c.user.type,
          avatar_url: c.user.avatar_url,
        }
      : null,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));

  if (sinceCommentId) {
    comments = comments.filter((c) => c.id > sinceCommentId);
  }

  return comments;
}

/**
 * Create issue comment for a specific repository
 */
export async function createIssueCommentForRepo(
  repositoryId: string,
  issueNumber: number,
  body: string,
): Promise<{ id: number; html_url: string }> {
  const { octokit, config } = await getRepoContext(repositoryId);

  const response = await withTimeout(
    octokit.rest.issues.createComment({
      owner: config.owner,
      repo: config.name,
      issue_number: issueNumber,
      body,
    }),
    TIMEOUTS.GITHUB_API,
    "createIssueCommentForRepo",
  );

  return {
    id: response.data.id,
    html_url: response.data.html_url,
  };
}

/**
 * Remove a label from an issue
 */
export async function removeLabelFromIssue(
  repositoryId: string,
  issueNumber: number,
  label: string,
): Promise<void> {
  const { octokit, config } = await getRepoContext(repositoryId);

  try {
    await withTimeout(
      octokit.rest.issues.removeLabel({
        owner: config.owner,
        repo: config.name,
        issue_number: issueNumber,
        name: label,
      }),
      TIMEOUTS.GITHUB_API,
      "removeLabelFromIssue",
    );
    console.log(
      `[github] Removed label '${label}' from issue #${issueNumber} in ${config.owner}/${config.name}`,
    );
  } catch (error) {
    console.error(
      `[github] Failed to remove label '${label}' from issue #${issueNumber}:`,
      error,
    );
  }
}

/**
 * Create pull request for a specific repository
 */
export async function createPullRequestForRepo(
  repositoryId: string,
  options: CreatePullRequestOptions,
): Promise<PullRequestResult> {
  const { octokit, config } = await getRepoContext(repositoryId);

  const response = await withTimeout(
    octokit.rest.pulls.create({
      owner: config.owner,
      repo: config.name,
      head: options.head,
      base: options.base,
      title: options.title,
      body: options.body,
    }),
    TIMEOUTS.GITHUB_API,
    "createPullRequestForRepo",
  );

  return {
    number: response.data.number,
    url: response.data.url,
    html_url: response.data.html_url,
  };
}

/**
 * Find existing PR for a branch in a specific repository
 */
export async function findExistingPrForRepo(
  repositoryId: string,
  branch: string,
): Promise<{ number: number; html_url: string } | null> {
  const { octokit, config } = await getRepoContext(repositoryId);

  try {
    // Try with owner:branch format first
    const { data: prs } = await withTimeout(
      octokit.rest.pulls.list({
        owner: config.owner,
        repo: config.name,
        head: `${config.owner}:${branch}`,
        state: "open",
      }),
      TIMEOUTS.GITHUB_API,
      "findExistingPrForRepo",
    );

    if (prs.length > 0) {
      return {
        number: prs[0].number,
        html_url: prs[0].html_url,
      };
    }

    // Fallback: search all open PRs and match by branch name
    // This handles cases where owner in DB doesn't match actual repo owner
    const { data: allPrs } = await withTimeout(
      octokit.rest.pulls.list({
        owner: config.owner,
        repo: config.name,
        state: "open",
        per_page: 100,
      }),
      TIMEOUTS.GITHUB_API,
      "findExistingPrForRepo-fallback",
    );

    const matchingPr = allPrs.find((pr) => pr.head.ref === branch);
    if (matchingPr) {
      console.log(
        `[github] Found PR #${matchingPr.number} via fallback search (head: ${matchingPr.head.label})`,
      );
      return {
        number: matchingPr.number,
        html_url: matchingPr.html_url,
      };
    }

    return null;
  } catch (error) {
    console.error(`[github] Error searching for existing PR:`, error);
    return null;
  }
}

/**
 * Hidden HTML marker embedded in all agent-posted comments.
 * Used by polling to distinguish agent output from human responses.
 */
export const AGENT_COMMENT_MARKER = "<!-- gogo:output -->";

/**
 * Check if a comment body contains the agent marker
 */
export function hasAgentMarker(body: string): boolean {
  return body.includes(AGENT_COMMENT_MARKER);
}

/**
 * Check if a comment author is human (not a bot or agent-posted).
 * Shared logic for both issue comments and PR review comments.
 */
function isHumanAuthored(
  user: { login: string; type: string } | null,
  body: string,
): boolean {
  if (!user) return false;
  if (user.type === "Bot") return false;
  if (user.login.endsWith("[bot]")) return false;
  if (hasAgentMarker(body)) return false;
  return true;
}

/**
 * Check if a comment is from a human (not a bot or agent-posted)
 */
export function isHumanComment(comment: GitHubComment): boolean {
  return isHumanAuthored(comment.user, comment.body);
}

/**
 * Check if a PR review comment is from a human (not a bot or agent-posted)
 */
export function isHumanReviewComment(
  comment: PullRequestReviewComment,
): boolean {
  return isHumanAuthored(comment.user, comment.body);
}

/**
 * Options for fetching issues
 */
export interface GetIssuesOptions {
  state?: "open" | "closed" | "all";
  labels?: string;
  per_page?: number;
  page?: number;
  since?: string; // ISO 8601 timestamp for incremental sync
}

/**
 * Get all issues for a repository (not just labeled)
 */
export async function getIssuesForRepo(
  repositoryId: string,
  options: GetIssuesOptions = {},
): Promise<GitHubIssue[]> {
  const { octokit, config } = await getRepoContext(repositoryId);

  const { state = "open", labels, per_page = 30, page = 1, since } = options;

  try {
    const response = await withTimeout(
      octokit.rest.issues.listForRepo({
        owner: config.owner,
        repo: config.name,
        state,
        labels,
        per_page,
        page,
        ...(since ? { since } : {}),
      }),
      TIMEOUTS.GITHUB_API,
      "getIssuesForRepo",
    );

    // Filter out pull requests (GitHub API returns them in issues endpoint)
    return response.data
      .filter((issue) => !issue.pull_request)
      .map(mapGitHubIssue);
  } catch (error) {
    console.error(
      `[github] Failed to fetch issues for ${config.owner}/${config.name}:`,
      error,
    );
    return [];
  }
}

/**
 * Options for creating an issue
 */
export interface CreateIssueOptions {
  title: string;
  body?: string;
  labels?: string[];
}

/**
 * Create a new issue in a repository
 */
export async function createIssueForRepo(
  repositoryId: string,
  options: CreateIssueOptions,
): Promise<GitHubIssue> {
  const { octokit, config } = await getRepoContext(repositoryId);

  const response = await withTimeout(
    octokit.rest.issues.create({
      owner: config.owner,
      repo: config.name,
      title: options.title,
      body: options.body,
      labels: options.labels,
    }),
    TIMEOUTS.GITHUB_API,
    "createIssueForRepo",
  );

  return mapGitHubIssue(response.data);
}

/**
 * Get a single issue by number
 */
export async function getIssueByNumber(
  repositoryId: string,
  issueNumber: number,
): Promise<GitHubIssue | null> {
  const { octokit, config } = await getRepoContext(repositoryId);

  try {
    const response = await withTimeout(
      octokit.rest.issues.get({
        owner: config.owner,
        repo: config.name,
        issue_number: issueNumber,
      }),
      TIMEOUTS.GITHUB_API,
      "getIssueByNumber",
    );

    const issue = response.data;
    // Return null if it's a pull request
    if (issue.pull_request) {
      return null;
    }

    return mapGitHubIssue(issue);
  } catch {
    return null;
  }
}

/**
 * Get pull request info by number
 */
export async function getPullRequestByNumber(
  repositoryId: string,
  prNumber: number,
): Promise<PullRequestInfo | null> {
  const { octokit, config } = await getRepoContext(repositoryId);

  try {
    const response = await withTimeout(
      octokit.rest.pulls.get({
        owner: config.owner,
        repo: config.name,
        pull_number: prNumber,
      }),
      TIMEOUTS.GITHUB_API,
      "getPullRequestByNumber",
    );

    const pr = response.data;
    return {
      number: pr.number,
      state: pr.state as "open" | "closed",
      merged: pr.merged,
      merged_at: pr.merged_at,
      html_url: pr.html_url,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
      },
    };
  } catch (error) {
    console.error(
      `[github] Failed to fetch PR #${prNumber} for repo ${repositoryId}:`,
      error,
    );
    return null;
  }
}

/**
 * Get review comments on a pull request
 */
export async function getPullRequestReviewComments(
  repositoryId: string,
  prNumber: number,
  sinceCommentId?: number,
): Promise<PullRequestReviewComment[]> {
  const { octokit, config } = await getRepoContext(repositoryId);

  try {
    const response = await withTimeout(
      octokit.rest.pulls.listReviewComments({
        owner: config.owner,
        repo: config.name,
        pull_number: prNumber,
        per_page: 100,
      }),
      TIMEOUTS.GITHUB_API,
      "getPullRequestReviewComments",
    );

    let comments = response.data.map((c) => ({
      id: c.id,
      body: c.body ?? "",
      html_url: c.html_url,
      user: c.user ? { login: c.user.login, type: c.user.type } : null,
      created_at: c.created_at,
      path: c.path ?? null,
      line: c.line ?? null,
    }));

    if (sinceCommentId) {
      comments = comments.filter((c) => c.id > sinceCommentId);
    }

    return comments;
  } catch (error) {
    console.error(
      `[github] Failed to fetch review comments for PR #${prNumber}:`,
      error,
    );
    return [];
  }
}

/**
 * Get issue comments on a pull request (general PR comments, not inline review comments)
 */
export async function getPullRequestIssueComments(
  repositoryId: string,
  prNumber: number,
  sinceCommentId?: number,
): Promise<GitHubComment[]> {
  // PR comments are in the issues API (PRs are special issues in GitHub)
  return getIssueCommentsForRepo(repositoryId, prNumber, sinceCommentId);
}

/**
 * Open PR info for recovery
 */
export interface OpenPullRequest {
  number: number;
  html_url: string;
  head_ref: string; // branch name
  state: "open" | "closed";
}

/**
 * Get all open pull requests for a repository
 */
export async function getOpenPullRequestsForRepo(
  repositoryId: string,
): Promise<OpenPullRequest[]> {
  const { octokit, config } = await getRepoContext(repositoryId);

  try {
    const { data: prs } = await withTimeout(
      octokit.rest.pulls.list({
        owner: config.owner,
        repo: config.name,
        state: "open",
        per_page: 100,
      }),
      TIMEOUTS.GITHUB_API,
      "getOpenPullRequestsForRepo",
    );

    return prs.map((pr) => ({
      number: pr.number,
      html_url: pr.html_url,
      head_ref: pr.head.ref,
      state: "open" as const,
    }));
  } catch (error) {
    console.error(
      `[github] Failed to fetch open PRs for ${config.owner}/${config.name}:`,
      error,
    );
    return [];
  }
}
