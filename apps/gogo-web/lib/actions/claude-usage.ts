"use server";

import type { ClaudeRateLimits, ClaudeUsageStats } from "@devkit/claude-usage";
import { getClaudeRateLimits, getClaudeUsageStats } from "@devkit/claude-usage/server";

export async function getClaudeUsageStatsAction(): Promise<ClaudeUsageStats | null> {
  return getClaudeUsageStats();
}

export async function getClaudeRateLimitsAction(): Promise<ClaudeRateLimits | null> {
  return getClaudeRateLimits();
}
