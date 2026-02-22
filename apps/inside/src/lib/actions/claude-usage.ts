"use server";

import type { ClaudeRateLimits, ClaudeUsageStats } from "@claudekit/claude-usage";
import { getClaudeRateLimits, getClaudeUsageStats } from "@claudekit/claude-usage/server";

export async function getClaudeUsageStatsAction(): Promise<ClaudeUsageStats | null> {
  return getClaudeUsageStats();
}

export async function getClaudeRateLimitsAction(): Promise<ClaudeRateLimits | null> {
  return getClaudeRateLimits();
}
