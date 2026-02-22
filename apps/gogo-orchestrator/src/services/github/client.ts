/**
 * GitHub Client Management
 *
 * Handles Octokit instance creation, caching, and rate limit tracking.
 */

import { queryOne } from "@claudekit/duckdb";
import {
  getAllRateLimitInfo,
  getRateLimitInfo,
  shouldThrottleRequests,
  updateRateLimitFromResponse,
} from "@claudekit/github";
import { Octokit } from "octokit";
import { getDb } from "../../db/index.js";
import type { DbRepository } from "../../db/schema.js";
import { createServiceLogger } from "../../utils/logger.js";
import { GitHubCredentialsError, RepositoryNotFoundError } from "./errors.js";

const log = createServiceLogger("github-client");

export { getAllRateLimitInfo, getRateLimitInfo, shouldThrottleRequests, updateRateLimitFromResponse };

// =============================================================================
// Rate Limit Response Hook
// =============================================================================

function trackRateLimitFromResponse(token: string, headers: Record<string, unknown>): void {
  const { warning, critical } = updateRateLimitFromResponse(token, headers);

  if (critical) {
    log.error({ headers }, "CRITICAL: Rate limit nearly exhausted");
  } else if (warning) {
    log.warn({ headers }, "Rate limit low");
  }
}

// =============================================================================
// Octokit Instance Management
// =============================================================================

// Cache Octokit instances by repository ID
const octokitCache = new Map<string, { octokit: Octokit; token: string }>();

function createOctokitWithRateLimitTracking(token: string): Octokit {
  const octokit = new Octokit({ auth: token });

  octokit.hook.after("request", (response) => {
    if (response.headers) {
      trackRateLimitFromResponse(token, response.headers);
    }
  });

  return octokit;
}

/**
 * Get Octokit instance for a specific repository
 */
export async function getOctokitForRepo(repositoryId: string): Promise<Octokit> {
  const cached = octokitCache.get(repositoryId);

  const conn = await getDb();
  const repo = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);

  if (!repo) {
    throw new RepositoryNotFoundError(repositoryId);
  }

  if (!repo.github_token) {
    throw new GitHubCredentialsError(repositoryId, repo.owner, repo.name);
  }

  if (cached && cached.token === repo.github_token) {
    return cached.octokit;
  }

  const octokit = createOctokitWithRateLimitTracking(repo.github_token);
  octokitCache.set(repositoryId, { octokit, token: repo.github_token });

  return octokit;
}
