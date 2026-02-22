import { queryAll } from "@claudekit/duckdb";
import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../db/index.js";
import { agentRegistry } from "../services/agents/index.js";
import { getAllRateLimitInfo } from "../services/github/index.js";
import { getRecentHealthEvents } from "../services/health-events.js";
import { getEffectivePollInterval, getThrottleState, isPollingActive } from "../services/polling.js";
import { isShutdownInProgress } from "../services/shutdown.js";
import { getClientCount } from "../ws/handler.js";

// Track server start time
const startTime = Date.now();

// Track last poll time (will be updated by polling service)
let lastPollTime: Date | null = null;
export function setLastPollTime(time: Date): void {
  lastPollTime = time;
}

export const healthRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async () => {
    const conn = await getDb();

    // Get job counts by status
    const jobCounts = await queryAll<{ status: string; count: bigint }>(
      conn,
      "SELECT status, COUNT(*) as count FROM jobs GROUP BY status",
    );

    const statusCounts: Record<string, number> = {};
    for (const row of jobCounts) {
      statusCounts[row.status] = Number(row.count);
    }

    // Get active agent count
    const totalActiveRuns = agentRegistry.getTotalActiveRunCount();

    // Get registered agent info
    const agentInfo = agentRegistry.listInfo();

    // Calculate uptime
    const uptimeMs = Date.now() - startTime;

    // Get rate limit info
    const rateLimitInfo = getAllRateLimitInfo();

    // Get effective poll interval (may be slowed due to rate limits)
    const pollIntervalMs = await getEffectivePollInterval();

    return {
      status: "healthy",
      uptime: Math.floor(uptimeMs / 1000),
      uptimeFormatted: formatUptime(uptimeMs),
      activeJobs: {
        running: statusCounts.running || 0,
        queued: statusCounts.queued || 0,
        needs_info: statusCounts.needs_info || 0,
        ready_to_pr: statusCounts.ready_to_pr || 0,
        paused: statusCounts.paused || 0,
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      },
      polling: {
        active: isPollingActive(),
        lastPoll: lastPollTime?.toISOString() || null,
        pollIntervalMs,
        throttled: getThrottleState().isThrottled,
        throttleReason: getThrottleState().reason || null,
        throttleResetAt: getThrottleState().resetAt?.toISOString() || null,
      },
      agents: {
        active: totalActiveRuns,
        registered: agentInfo.length,
        types: agentInfo.map((a) => a.type),
      },
      database: {
        connected: true, // If we got here, DB is connected
      },
      github: {
        rateLimitTracked: rateLimitInfo.tokenCount > 0,
        rateLimitWarning: rateLimitInfo.hasWarning,
        rateLimitCritical: rateLimitInfo.hasCritical,
        lowestRateLimit: rateLimitInfo.lowestRemaining
          ? {
              remaining: rateLimitInfo.lowestRemaining.remaining,
              limit: rateLimitInfo.lowestRemaining.limit,
              resetsAt: rateLimitInfo.lowestRemaining.reset.toISOString(),
            }
          : null,
      },
      shutdown: {
        inProgress: isShutdownInProgress(),
      },
      websocket: {
        clientCount: getClientCount(),
      },
    };
  });

  // GET /events - recent structured health events
  fastify.get("/events", async (request) => {
    const limit = Number((request.query as { limit?: string })?.limit) || 50;
    return getRecentHealthEvents(limit);
  });
};

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
