import type { Meta, StoryObj } from "@storybook/react";
import { SharedHeader } from "./shared-header";

const meta: Meta<typeof SharedHeader> = {
  title: "Components/SharedLayout/SharedHeader",
  component: SharedHeader,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SharedHeader>;

export const Default: Story = {
  args: {
    statusIndicator: (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        Connected
      </div>
    ),
  },
};

export const WithClaudeUsage: Story = {
  args: {
    claudeUsage: {
      getUsageStats: async () => ({
        totalSessions: 142,
        totalMessages: 3891,
        firstSessionDate: "2025-06-01T00:00:00Z",
        lastComputedDate: "2026-02-16T00:00:00Z",
        modelUsage: {
          "claude-sonnet-4-5-20250929": {
            inputTokens: 12_500_000,
            outputTokens: 4_200_000,
            cacheReadInputTokens: 8_000_000,
            cacheCreationInputTokens: 2_000_000,
          },
        },
        dailyActivity: [
          { date: "2026-02-16", messageCount: 45, sessionCount: 3, toolCallCount: 120 },
          { date: "2026-02-15", messageCount: 38, sessionCount: 2, toolCallCount: 95 },
        ],
        hourCounts: { "9": 12, "10": 18, "11": 15, "14": 20, "15": 22, "16": 10 },
        dailyModelTokens: [{ date: "2026-02-16", tokensByModel: { "claude-sonnet-4-5-20250929": 5_000_000 } }],
        todayCost: {
          totalCostUSD: 2.47,
          modelBreakdown: {
            "claude-sonnet-4-5-20250929": {
              inputTokens: 1_200_000,
              outputTokens: 400_000,
              cacheReadInputTokens: 800_000,
              cacheCreationInputTokens: 200_000,
              costUSD: 2.47,
            },
          },
        },
        recentDailyCosts: [
          { date: "2026-02-16", totalCostUSD: 2.47 },
          { date: "2026-02-15", totalCostUSD: 1.83 },
        ],
      }),
      getRateLimits: async () => ({
        fiveHour: { utilization: 35, resetsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() },
        sevenDay: { utilization: 22, resetsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() },
        modelLimits: {},
        extraUsage: null,
      }),
    },
    statusIndicator: (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        Connected
      </div>
    ),
  },
};
