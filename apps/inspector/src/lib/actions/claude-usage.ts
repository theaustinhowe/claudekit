"use server";

import { getClaudeRateLimits, getClaudeUsageStats } from "@claudekit/claude-usage/server";

export async function getClaudeUsageStatsAction() {
  return getClaudeUsageStats();
}

export async function getClaudeRateLimitsAction() {
  return getClaudeRateLimits();
}
