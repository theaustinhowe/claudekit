"use server";

import { getClaudeRateLimits, getClaudeUsageStats } from "@devkit/claude-usage/server";

export async function getClaudeUsageStatsAction() {
  return getClaudeUsageStats();
}

export async function getClaudeRateLimitsAction() {
  return getClaudeRateLimits();
}
