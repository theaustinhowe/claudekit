"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { ScrollArea } from "@claudekit/ui/components/scroll-area";
import { Skeleton } from "@claudekit/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Coffee,
  Database,
  Github,
  Radio,
  RefreshCw,
  Server,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useWebSocketContext } from "@/contexts/websocket-context";
import { useHealth, useHealthEvents } from "@/hooks/use-jobs";
import { fetchHealth as fetchHealthApi } from "@/lib/api";

interface HealthData {
  status: string;
  uptime: number;
  uptimeFormatted: string;
  activeJobs: {
    running: number;
    queued: number;
    needs_info: number;
    ready_to_pr: number;
    paused: number;
    total: number;
  };
  polling: {
    active: boolean;
    lastPoll: string | null;
    pollIntervalMs?: number;
    throttled?: boolean;
    throttleReason?: string | null;
    throttleResetAt?: string | null;
  };
  agents: {
    active: number;
    registered: number;
    types: string[];
  };
  database: {
    connected: boolean;
  };
  github?: {
    rateLimitTracked?: boolean;
    rateLimitWarning?: boolean;
    rateLimitCritical?: boolean;
    lowestRateLimit?: {
      remaining: number;
      limit: number;
      resetsAt: string;
    } | null;
  };
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const { connected: wsConnected } = useWebSocketContext();
  const { data: healthHook } = useHealth();
  const { data: healthEvents = [] } = useHealthEvents(30);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchHealthApi();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Rate limit info
  const rateLimitInfo = healthHook?.github || health?.github;
  const polling = healthHook?.polling || health?.polling;

  // Countdown timer for rate limit reset
  useEffect(() => {
    const resetAt = polling?.throttleResetAt || rateLimitInfo?.lowestRateLimit?.resetsAt;
    if (!resetAt) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const resetTime = new Date(resetAt).getTime();
      const now = Date.now();
      const diff = resetTime - now;

      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [polling?.throttleResetAt, rateLimitInfo?.lowestRateLimit?.resetsAt]);

  // Calculate staleness
  const isPollingStale = (() => {
    if (!health?.polling?.lastPoll || !health?.polling?.active) return false;
    const lastPoll = new Date(health.polling.lastPoll).getTime();
    const now = Date.now();
    const pollIntervalMs = health.polling.pollIntervalMs || 30000;
    const staleThresholdMs = Math.max(pollIntervalMs * 3, 120000);
    return now - lastPoll > staleThresholdMs;
  })();

  // Format last poll time
  const lastPollTime = health?.polling?.lastPoll
    ? formatDistanceToNow(new Date(health.polling.lastPoll), {
        addSuffix: true,
      })
    : null;

  // GitHub status
  const isThrottled = polling?.throttled;
  const isRateLimitCritical = rateLimitInfo?.rateLimitCritical;
  const isRateLimitWarning = rateLimitInfo?.rateLimitWarning;
  const showRateLimitBanner = isRateLimitWarning || isRateLimitCritical;

  const getGitHubStatusMessage = () => {
    if (isThrottled && polling?.throttleReason === "rate_limit") {
      return "Rate limit reached";
    }
    if (isThrottled) {
      return polling?.throttleReason || "Throttled";
    }
    if (isRateLimitCritical) {
      return "Rate limit critical";
    }
    if (isRateLimitWarning) {
      return "Rate limit low";
    }
    if (isPollingStale) {
      return "Polling stale";
    }
    return "Connected";
  };

  const getGitHubIcon = () => {
    if (isThrottled || isRateLimitCritical) {
      return <Coffee className="h-4 w-4" />;
    }
    if (isRateLimitWarning || isPollingStale) {
      return <AlertTriangle className="h-4 w-4" />;
    }
    return <Github className="h-4 w-4" />;
  };

  if (loading && !health) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center gap-1 border-b bg-background px-4">
          <Skeleton className="h-5 w-28" />
          <div className="flex-1" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="container mx-auto max-w-4xl p-6">
          <Skeleton className="h-16 w-full mb-4" />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <ScrollArea className="flex-1">
          <div className="container mx-auto p-6">
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span>Failed to connect to orchestrator: {error}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 items-center gap-1 border-b bg-background px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">System Health</span>
          <Badge variant={health?.status === "healthy" ? "default" : "destructive"} className="gap-1">
            {health?.status === "healthy" ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {health?.status || "Unknown"}
          </Badge>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Uptime: {health?.uptimeFormatted}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={fetchHealth}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="container mx-auto max-w-4xl p-6">
          {/* Rate Limit Warning Banner */}
          {showRateLimitBanner && (
            <Card
              className={`mb-4 ${
                isRateLimitCritical ? "border-red-500/50 bg-red-500/5" : "border-yellow-500/50 bg-yellow-500/5"
              }`}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle
                    className={`h-5 w-5 flex-shrink-0 ${isRateLimitCritical ? "text-red-500" : "text-yellow-500"}`}
                  />
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        isRateLimitCritical ? "text-red-700 dark:text-red-400" : "text-yellow-700 dark:text-yellow-400"
                      }`}
                    >
                      {isRateLimitCritical
                        ? "GitHub API rate limit is critically low"
                        : "GitHub API rate limit is running low"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rateLimitInfo?.lowestRateLimit
                        ? `${rateLimitInfo.lowestRateLimit.remaining} of ${rateLimitInfo.lowestRateLimit.limit} requests remaining`
                        : "Polling may be throttled to avoid hitting limits"}
                      {countdown && ` · Resets in ${countdown}`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <TooltipProvider>
            {/* Connections Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* GitHub Polling - Full width with timer */}
              <Card
                className={`col-span-2 ${
                  isThrottled || isRateLimitCritical
                    ? "border-orange-500/50 bg-orange-500/5"
                    : isRateLimitWarning || isPollingStale
                      ? "border-yellow-500/50 bg-yellow-500/5"
                      : ""
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          isThrottled || isRateLimitCritical
                            ? "text-orange-500"
                            : isRateLimitWarning || isPollingStale
                              ? "text-yellow-500"
                              : "text-green-500"
                        }
                      >
                        {getGitHubIcon()}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">GitHub Polling</span>
                          <Badge
                            variant={
                              isThrottled || isRateLimitCritical
                                ? "destructive"
                                : health?.polling?.active
                                  ? "default"
                                  : "secondary"
                            }
                            className="text-[10px] px-1.5 py-0"
                          >
                            {getGitHubStatusMessage()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {lastPollTime ? `Last poll ${lastPollTime}` : "Never polled"}
                          {rateLimitInfo?.lowestRateLimit && (
                            <>
                              {" "}
                              · {rateLimitInfo.lowestRateLimit.remaining}/{rateLimitInfo.lowestRateLimit.limit} API
                              calls
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    {countdown && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className={`h-4 w-4 ${countdown ? "animate-pulse" : ""}`} />
                        <span className="font-mono text-sm">{countdown}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Database */}
              <Card>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <Database
                      className={`h-4 w-4 ${health?.database?.connected ? "text-green-500" : "text-red-500"}`}
                    />
                    <div>
                      <span className="font-medium text-sm">Database</span>
                      <p className="text-xs text-muted-foreground">
                        DuckDB {health?.database?.connected ? "connected" : "disconnected"}
                      </p>
                    </div>
                    <span
                      className={`ml-auto h-2 w-2 rounded-full ${
                        health?.database?.connected ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* WebSocket */}
              <Card>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <Radio className={`h-4 w-4 ${wsConnected ? "text-green-500" : "text-red-500"}`} />
                    <div>
                      <span className="font-medium text-sm">Live Updates</span>
                      <p className="text-xs text-muted-foreground">
                        WebSocket {wsConnected ? "connected" : "disconnected"}
                      </p>
                    </div>
                    <span className={`ml-auto h-2 w-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TooltipProvider>

          {/* Jobs & Agents Row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Jobs Summary */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Active Jobs
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="grid grid-cols-3 gap-2">
                  <StatItem label="Running" value={health?.activeJobs?.running || 0} />
                  <StatItem label="Queued" value={health?.activeJobs?.queued || 0} />
                  <StatItem label="Needs Info" value={health?.activeJobs?.needs_info || 0} />
                  <StatItem label="Ready to PR" value={health?.activeJobs?.ready_to_pr || 0} />
                  <StatItem label="Paused" value={health?.activeJobs?.paused || 0} />
                  <StatItem label="Total" value={health?.activeJobs?.total || 0} highlight />
                </div>
              </CardContent>
            </Card>

            {/* Agents Summary */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Agents
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-center gap-6 mb-2">
                  <div>
                    <p className="text-xl font-bold">{health?.agents?.active || 0}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{health?.agents?.registered || 0}</p>
                    <p className="text-xs text-muted-foreground">Registered</p>
                  </div>
                </div>
                {health?.agents?.types && health.agents.types.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {health.agents.types.map((type) => (
                      <Badge key={type} variant="outline" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity Timeline */}
          {healthEvents.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {healthEvents
                    .filter((e: { type: string }) => e.type !== "poll_cycle_complete")
                    .slice(-20)
                    .reverse()
                    .map(
                      (
                        event: {
                          type: string;
                          timestamp: string;
                          message: string;
                        },
                        index: number,
                      ) => (
                        <div key={`${event.timestamp}-${index}`} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                          <HealthEventIcon type={event.type} />
                          <span className="text-muted-foreground">{event.message}</span>
                        </div>
                      ),
                    )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function HealthEventIcon({ type }: { type: string }) {
  switch (type) {
    case "agent_started":
      return <Zap className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />;
    case "agent_stopped":
      return <XCircle className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />;
    case "rate_limit_transition":
      return <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />;
    case "shutdown_initiated":
      return <Server className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />;
    case "stale_job_detected":
      return <Clock className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />;
    default:
      return <Activity className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />;
  }
}

function StatItem({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded-md text-center ${highlight ? "bg-primary/10" : "bg-muted/50"}`}>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
