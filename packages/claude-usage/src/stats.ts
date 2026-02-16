import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getRecentDailyCosts, getTodayUsageWithCost } from "./session-parser";
import type { ClaudeUsageStats } from "./types";

/** Read stats-cache.json and enrich with today's cost + recent daily costs */
export async function getClaudeUsageStats(): Promise<ClaudeUsageStats | null> {
  try {
    const statsPath = join(homedir(), ".claude", "stats-cache.json");
    const raw = await readFile(statsPath, "utf-8");
    const data = JSON.parse(raw);

    const [todayCost, recentDailyCosts] = await Promise.all([getTodayUsageWithCost(), getRecentDailyCosts(7)]);

    return {
      totalSessions: data.totalSessions ?? 0,
      totalMessages: data.totalMessages ?? 0,
      firstSessionDate: data.firstSessionDate ?? null,
      lastComputedDate: data.lastComputedDate ?? null,
      modelUsage: data.modelUsage ?? {},
      dailyActivity: data.dailyActivity ?? [],
      hourCounts: data.hourCounts ?? {},
      dailyModelTokens: data.dailyModelTokens ?? [],
      todayCost: todayCost ?? null,
      recentDailyCosts,
    };
  } catch {
    return null;
  }
}
