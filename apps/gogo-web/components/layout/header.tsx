"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Archive,
  Bot,
  CircleDot,
  Database,
  FolderTree,
  Github,
  Menu,
  Radio,
  Settings,
  WifiOff,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { RepoSelector } from "@/components/repo/repo-selector";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@devkit/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { useRepositoryContext } from "@/contexts/repository-context";
import { useWebSocketContext } from "@/contexts/websocket-context";
import { useHealth } from "@/hooks/use-jobs";
import { useSettings } from "@/hooks/use-settings";

interface HeaderProps {
  activeJobsCount: number;
  archivedJobsCount?: number;
}

export function Header({ activeJobsCount, archivedJobsCount = 0 }: HeaderProps) {
  const { connected, connectionState, reconnectAttempt, triggerReconnect } = useWebSocketContext();
  const { repositories } = useRepositoryContext();
  const { data: health } = useHealth();
  const { data: settings } = useSettings();

  // Agent availability info
  const activeAgents = health?.agents?.active ?? 0;
  const maxAgents = (settings?.maxParallelJobs as number) ?? 3;
  const agentsFull = activeAgents >= maxAgents;

  // Get user-friendly connection status text
  const getConnectionStatusText = () => {
    switch (connectionState) {
      case "connected":
        return "Live";
      case "reconnecting":
        return reconnectAttempt > 0 ? `Reconnecting (${reconnectAttempt})...` : "Reconnecting...";
      case "failed":
        return "Offline";
      case "disconnected":
        return "Offline";
    }
  };

  // Format last poll time as relative time
  const lastPollTime = health?.polling?.lastPoll
    ? formatDistanceToNow(new Date(health.polling.lastPoll), {
        addSuffix: true,
      })
    : null;

  // Calculate staleness: stale if last poll > max(pollIntervalMs * 3, 2 minutes)
  const isPollingStale = (() => {
    if (!health?.polling?.lastPoll || !health?.polling?.active) return false;
    const lastPoll = new Date(health.polling.lastPoll).getTime();
    const now = Date.now();
    const pollIntervalMs = health.polling.pollIntervalMs || 30000;
    const staleThresholdMs = Math.max(pollIntervalMs * 3, 120000); // 3x interval or 2 min
    return now - lastPoll > staleThresholdMs;
  })();

  // Build GitHub tooltip with staleness info
  const getGitHubTooltip = () => {
    if (!health?.polling?.active) return "Polling inactive";
    if (isPollingStale) {
      return lastPollTime ? `Polling stale · Last check ${lastPollTime}` : "Polling stale";
    }
    return lastPollTime ? `Polling OK · Last check ${lastPollTime}` : "Polling active";
  };

  // Rate limit banner info
  const rateLimitInfo = health?.github;
  const showRateLimitBanner = rateLimitInfo?.rateLimitWarning || rateLimitInfo?.rateLimitCritical;
  const rateLimitResetTime = rateLimitInfo?.lowestRateLimit?.resetsAt
    ? formatDistanceToNow(new Date(rateLimitInfo.lowestRateLimit.resetsAt), {
        addSuffix: true,
      })
    : null;

  return (
    <header className="bg-card/95 backdrop-blur-sm shadow-elevation-1 sticky top-0 z-50">
      <div className="flex h-14 items-center justify-between px-4 md:h-16 md:px-6">
        {/* Left: Logo, title, and repo selector */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-3">
            <Image
              src="/logo.png"
              alt="GoGo"
              width={980}
              height={635}
              className="rounded-lg h-8 w-8 md:h-9 md:w-9 object-contain"
            />
            <h1 className="text-base font-semibold md:text-lg">GoGo</h1>
          </div>
          <div className="hidden md:block">
            <TooltipProvider>
              <RepoSelector />
            </TooltipProvider>
          </div>
        </div>

        {/* Center: Connection status (desktop only) */}
        <TooltipProvider>
          <div className="hidden items-center gap-4 md:flex">
            <ConnectionIndicator
              icon={<Github className="h-4 w-4" />}
              label="GitHub"
              connected={health?.polling?.active ?? false}
              warning={isPollingStale}
              tooltip={getGitHubTooltip()}
            />
            <ConnectionIndicator
              icon={<Database className="h-4 w-4" />}
              label="Database"
              connected={health?.database?.connected ?? false}
              tooltip={health?.database?.connected ? "Database connected" : "Database disconnected"}
            />
            <ConnectionIndicator
              icon={<Radio className="h-4 w-4" />}
              label="Live"
              connected={connected}
              tooltip={connected ? "WebSocket connected" : "WebSocket disconnected"}
            />
            {/* Agent availability indicator */}
            <AgentAvailabilityIndicator active={activeAgents} max={maxAgents} full={agentsFull} />
          </div>
        </TooltipProvider>

        {/* Right: Active jobs + Theme + Archive + Settings */}
        <div className="flex items-center gap-1 md:gap-2">
          {/* Live connection status badge */}
          <Badge
            variant={
              connectionState === "connected"
                ? "default"
                : connectionState === "reconnecting"
                  ? "secondary"
                  : "destructive"
            }
            className="gap-1.5 text-xs"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                connectionState === "connected"
                  ? "bg-green-500"
                  : connectionState === "reconnecting"
                    ? "animate-pulse bg-yellow-500"
                    : "bg-red-500"
              }`}
            />
            {getConnectionStatusText()}
          </Badge>
          {activeJobsCount > 0 && (
            <Badge variant="secondary" className="gap-1.5 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              <span className="hidden sm:inline">{activeJobsCount} active</span>
              <span className="sm:hidden">{activeJobsCount}</span>
            </Badge>
          )}
          <ThemeToggle />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild className="relative hidden md:flex">
                  <Link href="/archive">
                    <Archive className="h-5 w-5" />
                    {archivedJobsCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium">
                        {archivedJobsCount}
                      </span>
                    )}
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Archive</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild className="hidden md:flex">
                  <Link href="/worktrees">
                    <FolderTree className="h-5 w-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Workspaces</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild className="hidden md:flex">
                  <Link href="/issues">
                    <CircleDot className="h-5 w-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Issues</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild className="hidden md:flex">
                  <Link href="/settings">
                    <Settings className="h-5 w-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-4">
                {/* Repository selector for mobile (only show when multiple repos) */}
                {repositories.length > 1 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Repository</h3>
                    <TooltipProvider>
                      <RepoSelector />
                    </TooltipProvider>
                  </div>
                )}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Connections</h3>
                  <ConnectionIndicator icon={<Github className="h-4 w-4" />} label="GitHub" connected />
                  <ConnectionIndicator icon={<Database className="h-4 w-4" />} label="Database" connected />
                  <ConnectionIndicator icon={<Radio className="h-4 w-4" />} label="Live" connected={connected} />
                </div>
                <Button variant="outline" asChild className="w-full justify-start gap-2">
                  <Link href="/archive">
                    <Archive className="h-4 w-4" />
                    Archive
                    {archivedJobsCount > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {archivedJobsCount}
                      </Badge>
                    )}
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full justify-start gap-2">
                  <Link href="/worktrees">
                    <FolderTree className="h-4 w-4" />
                    Workspaces
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full justify-start gap-2">
                  <Link href="/issues">
                    <CircleDot className="h-4 w-4" />
                    Issues
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full justify-start gap-2">
                  <Link href="/settings">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Rate limit warning banner */}
      {showRateLimitBanner && (
        <div
          className={`flex items-center justify-center gap-2 px-4 py-2 text-sm ${
            rateLimitInfo?.rateLimitCritical
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>
            {rateLimitInfo?.rateLimitCritical ? "GitHub rate limit critical" : "GitHub rate limit low"}
            {rateLimitInfo?.lowestRateLimit && (
              <>
                {" "}
                ({rateLimitInfo.lowestRateLimit.remaining}/{rateLimitInfo.lowestRateLimit.limit} remaining)
              </>
            )}
            {rateLimitResetTime && <> — resets {rateLimitResetTime}</>}
            {rateLimitInfo?.rateLimitCritical && " — polling paused until reset"}
          </span>
        </div>
      )}

      {/* Connection failure banner */}
      {connectionState === "failed" && (
        <div className="flex items-center justify-center gap-3 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400">
          <WifiOff className="h-4 w-4" />
          <span>Lost connection to orchestrator</span>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={triggerReconnect}>
            Reconnect
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      )}
    </header>
  );
}

function ConnectionIndicator({
  icon,
  label,
  connected,
  warning,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  connected: boolean;
  warning?: boolean;
  tooltip?: string;
}) {
  // Determine dot color: green = connected & not stale, yellow = connected but stale, red = disconnected
  const getDotColor = () => {
    if (!connected) return "bg-red-500";
    if (warning) return "bg-yellow-500";
    return "bg-green-500";
  };

  const content = (
    <div className="flex items-center gap-2 text-sm">
      <span className={connected ? "text-foreground" : "text-muted-foreground"}>{icon}</span>
      <span className={connected ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={`h-2 w-2 rounded-full ${getDotColor()}`} />
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-default">{content}</div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function AgentAvailabilityIndicator({ active, max, full }: { active: number; max: number; full: boolean }) {
  const tooltip = full
    ? `All agent slots busy (${active}/${max}). Queued jobs will wait.`
    : `${active} of ${max} agent slots in use`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 text-sm cursor-default">
          <Bot className="h-4 w-4" />
          <span>
            {active}/{max}
          </span>
          <span className={`h-2 w-2 rounded-full ${full ? "bg-yellow-500" : "bg-green-500"}`} />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
