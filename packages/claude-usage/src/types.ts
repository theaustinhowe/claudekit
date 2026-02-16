/** Utilization values are 0–100 (percentage). resetsAt is ISO 8601. */
export interface RateLimitWindow {
  utilization: number;
  resetsAt: string;
}

export interface ClaudeRateLimits {
  fiveHour: RateLimitWindow;
  sevenDay: RateLimitWindow;
  /** Model-specific weekly limits (e.g. "opus", "sonnet"). Only present on certain plans. */
  modelLimits: Record<string, RateLimitWindow>;
  extraUsage: {
    isEnabled: boolean;
    utilization: number;
    usedCredits: number;
    monthlyLimit: number;
  } | null;
}

export interface ClaudeUsageStats {
  totalSessions: number;
  totalMessages: number;
  firstSessionDate: string | null;
  lastComputedDate: string | null;
  modelUsage: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
    }
  >;
  dailyActivity: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
    toolCallCount: number;
  }>;
  hourCounts: Record<string, number>;
  dailyModelTokens: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  todayCost?: {
    totalCostUSD: number;
    modelBreakdown: Record<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        cacheReadInputTokens: number;
        cacheCreationInputTokens: number;
        costUSD: number;
      }
    >;
  } | null;
  recentDailyCosts?: Array<{
    date: string;
    totalCostUSD: number;
  }>;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}
