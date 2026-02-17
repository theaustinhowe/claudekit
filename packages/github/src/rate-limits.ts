import type { RateLimitInfo } from "./types";

// Threshold below which we start slowing down (percentage)
const RATE_LIMIT_WARNING_THRESHOLD = 0.2; // 20% remaining
const RATE_LIMIT_CRITICAL_THRESHOLD = 0.1; // 10% remaining

// Track rate limits per token (hash for privacy)
const rateLimitCache = new Map<string, RateLimitInfo>();

function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `token_${hash}`;
}

export function updateRateLimitFromResponse(
  token: string,
  headers: Record<string, unknown>,
): { warning: boolean; critical: boolean } {
  const limit = headers["x-ratelimit-limit"];
  const remaining = headers["x-ratelimit-remaining"];
  const reset = headers["x-ratelimit-reset"];
  const used = headers["x-ratelimit-used"];

  if (limit === undefined || remaining === undefined || reset === undefined) {
    return { warning: false, critical: false };
  }

  const info: RateLimitInfo = {
    limit: Number(limit),
    remaining: Number(remaining),
    reset: new Date(Number(reset) * 1000),
    used: used !== undefined ? Number(used) : Number(limit) - Number(remaining),
  };

  const key = hashToken(token);
  rateLimitCache.set(key, info);

  const percentRemaining = info.remaining / info.limit;
  return {
    warning: percentRemaining <= RATE_LIMIT_WARNING_THRESHOLD,
    critical: percentRemaining <= RATE_LIMIT_CRITICAL_THRESHOLD,
  };
}

export function getRateLimitInfo(token: string): RateLimitInfo | null {
  return rateLimitCache.get(hashToken(token)) ?? null;
}

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
    const now = new Date();
    const msUntilReset = Math.max(0, info.reset.getTime() - now.getTime());

    return {
      shouldThrottle: true,
      reason: `Rate limit critical (${info.remaining}/${info.limit}). Waiting for reset.`,
      delayMs: Math.min(msUntilReset, 60000),
    };
  }

  if (percentRemaining <= RATE_LIMIT_WARNING_THRESHOLD) {
    return {
      shouldThrottle: true,
      reason: `Rate limit low (${info.remaining}/${info.limit}). Slowing requests.`,
      delayMs: 5000,
    };
  }

  return { shouldThrottle: false };
}

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
