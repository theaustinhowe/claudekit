"use server";

import { getClaudeRateLimits, getClaudeUsageStats } from "@claudekit/claude-usage/server";
import type { ClaudeRateLimits, ClaudeUsageStats } from "@/lib/types";

export async function getClaudeUsageStatsAction(): Promise<ClaudeUsageStats | null> {
  return getClaudeUsageStats();
}

export async function getClaudeRateLimitsAction(): Promise<ClaudeRateLimits | null> {
  return getClaudeRateLimits();
}
