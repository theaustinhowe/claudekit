/**
 * GitHub Client Management
 *
 * Handles Octokit instance creation, caching, and rate limit tracking.
 */

import { Octokit } from "octokit";
import { queryOne } from "../../db/helpers.js";
import { getConn } from "../../db/index.js";
import type { DbRepository } from "../../db/schema.js";
import { GitHubCredentialsError, RepositoryNotFoundError } from "./errors.js";
import type { RateLimitInfo } from "./types.js";

// =============================================================================
// Rate Limit Tracking
// =============================================================================

// Track rate limits per token (hash for privacy)
const rateLimitCache = new Map<string, RateLimitInfo>();

// Threshold below which we start slowing down (percentage)
const RATE_LIMIT_WARNING_THRESHOLD = 0.2; // 20% remaining
const RATE_LIMIT_CRITICAL_THRESHOLD = 0.1; // 10% remaining

/**
 * Hash a token for use as a cache key (don't store actual tokens)
 */
function hashToken(token: string): string {
  // Simple hash for cache key - not cryptographic, just for grouping
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `token_${hash}`;
}

/**
 * Update rate limit info from Octokit response headers
 */
export function updateRateLimitFromResponse(
  token: string,
  headers: Record<string, unknown>,
): void {
  const limit = headers["x-ratelimit-limit"];
  const remaining = headers["x-ratelimit-remaining"];
  const reset = headers["x-ratelimit-reset"];
  const used = headers["x-ratelimit-used"];

  if (limit !== undefined && remaining !== undefined && reset !== undefined) {
    const info: RateLimitInfo = {
      limit: Number(limit),
      remaining: Number(remaining),
      reset: new Date(Number(reset) * 1000),
      used:
        used !== undefined ? Number(used) : Number(limit) - Number(remaining),
    };

    const key = hashToken(token);
    const previous = rateLimitCache.get(key);
    rateLimitCache.set(key, info);

    // Log warnings when hitting thresholds
    const percentRemaining = info.remaining / info.limit;

    if (percentRemaining <= RATE_LIMIT_CRITICAL_THRESHOLD) {
      console.error(
        `[github] CRITICAL: Rate limit nearly exhausted! ${info.remaining}/${info.limit} remaining. ` +
          `Resets at ${info.reset.toISOString()}`,
      );
    } else if (
      percentRemaining <= RATE_LIMIT_WARNING_THRESHOLD &&
      (!previous ||
        previous.remaining / previous.limit > RATE_LIMIT_WARNING_THRESHOLD)
    ) {
      console.warn(
        `[github] Warning: Rate limit low. ${info.remaining}/${info.limit} remaining. ` +
          `Resets at ${info.reset.toISOString()}`,
      );
    }
  }
}

/**
 * Get current rate limit info for a token
 */
export function getRateLimitInfo(token: string): RateLimitInfo | null {
  return rateLimitCache.get(hashToken(token)) ?? null;
}

/**
 * Check if we should slow down API calls due to rate limits
 */
export function shouldThrottleRequests(token: string): {
  shouldThrottle: boolean;
  reason?: string;
  delayMs?: number;
} {
  const info = getRateLimitInfo(token);

  if (!info) {
    return { shouldThrottle: false };
  }

  const percentRemaining = info.remaining / info.limit;

  if (percentRemaining <= RATE_LIMIT_CRITICAL_THRESHOLD) {
    // Calculate delay until reset
    const now = new Date();
    const msUntilReset = Math.max(0, info.reset.getTime() - now.getTime());

    return {
      shouldThrottle: true,
      reason: `Rate limit critical (${info.remaining}/${info.limit}). Waiting for reset.`,
      delayMs: Math.min(msUntilReset, 60000), // Max 1 minute delay
    };
  }

  if (percentRemaining <= RATE_LIMIT_WARNING_THRESHOLD) {
    return {
      shouldThrottle: true,
      reason: `Rate limit low (${info.remaining}/${info.limit}). Slowing requests.`,
      delayMs: 5000, // 5 second delay between requests
    };
  }

  return { shouldThrottle: false };
}

/**
 * Get rate limit status for all tracked tokens (for health endpoint)
 */
export function getAllRateLimitInfo(): {
  tokenCount: number;
  lowestRemaining: RateLimitInfo | null;
  hasWarning: boolean;
  hasCritical: boolean;
} {
  let lowestRemaining: RateLimitInfo | null = null;
  let hasWarning = false;
  let hasCritical = false;

  for (const info of rateLimitCache.values()) {
    if (!lowestRemaining || info.remaining < lowestRemaining.remaining) {
      lowestRemaining = info;
    }

    const percentRemaining = info.remaining / info.limit;
    if (percentRemaining <= RATE_LIMIT_CRITICAL_THRESHOLD) {
      hasCritical = true;
    } else if (percentRemaining <= RATE_LIMIT_WARNING_THRESHOLD) {
      hasWarning = true;
    }
  }

  return {
    tokenCount: rateLimitCache.size,
    lowestRemaining,
    hasWarning,
    hasCritical,
  };
}

// =============================================================================
// Octokit Instance Management
// =============================================================================

// Cache Octokit instances by repository ID
const octokitCache = new Map<string, { octokit: Octokit; token: string }>();

/**
 * Create an Octokit instance with rate limit tracking
 */
function createOctokitWithRateLimitTracking(token: string): Octokit {
  const octokit = new Octokit({ auth: token });

  // Add a hook to track rate limits from response headers
  octokit.hook.after("request", (response) => {
    if (response.headers) {
      updateRateLimitFromResponse(token, response.headers);
    }
  });

  return octokit;
}

/**
 * Get Octokit instance for a specific repository
 */
export async function getOctokitForRepo(
  repositoryId: string,
): Promise<Octokit> {
  // Check cache
  const cached = octokitCache.get(repositoryId);

  // Get repository config
  const conn = getConn();
  const repo = await queryOne<DbRepository>(
    conn,
    "SELECT * FROM repositories WHERE id = ?",
    [repositoryId],
  );

  if (!repo) {
    throw new RepositoryNotFoundError(repositoryId);
  }

  if (!repo.github_token) {
    throw new GitHubCredentialsError(repositoryId, repo.owner, repo.name);
  }

  // Return cached if token matches
  if (cached && cached.token === repo.github_token) {
    return cached.octokit;
  }

  // Create new instance with rate limit tracking
  const octokit = createOctokitWithRateLimitTracking(repo.github_token);
  octokitCache.set(repositoryId, { octokit, token: repo.github_token });

  return octokit;
}
