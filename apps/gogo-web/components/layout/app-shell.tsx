"use client";

import { ClaudeUsageDialog, HeaderUsageWidget } from "@devkit/claude-usage/components/usage-shared";
import { useClaudeUsageRefresh } from "@devkit/hooks";
import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@devkit/ui/components/popover";
import { Sheet, SheetContent, SheetTrigger } from "@devkit/ui/components/sheet";
import { ThemeToggle } from "@devkit/ui/components/theme-toggle";
import { Heart, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useWebSocketContext } from "@/contexts/websocket-context";
import { useHealth } from "@/hooks/use-jobs";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";
import { Sidebar } from "./sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

// Pages that should NOT use the app shell (setup, etc.)
const excludedPaths = ["/setup"];

function ConnectionBadge() {
  const { connectionState } = useWebSocketContext();
  const { data: health } = useHealth();

  const isDbOk = health?.database?.connected ?? false;
  const isPollingOk = health?.polling?.active ?? false;
  const isRateLimitOk = !health?.github?.rateLimitCritical;
  const isHealthy = isDbOk && isPollingOk && isRateLimitOk;

  const statusText = isHealthy
    ? "All systems operational"
    : !isDbOk
      ? "Database disconnected"
      : !isPollingOk
        ? "GitHub polling paused"
        : "Rate limit critical";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer">
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
              className={cn(
                "h-2 w-2 rounded-full",
                connectionState === "connected"
                  ? "bg-green-500"
                  : connectionState === "reconnecting"
                    ? "animate-pulse bg-yellow-500"
                    : "bg-red-500",
              )}
            />
            {connectionState === "connected" ? "Live" : connectionState === "reconnecting" ? "Reconnecting" : "Offline"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", isHealthy ? "bg-green-500" : "bg-red-500")} />
            <span className="text-sm font-medium">{statusText}</span>
          </div>
          <div className="border-t" />
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">WebSocket</span>
              <span className={connectionState === "connected" ? "text-green-500" : "text-red-500"}>
                {connectionState === "connected" ? "connected" : connectionState}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Database</span>
              <span className={isDbOk ? "text-green-500" : "text-red-500"}>
                {isDbOk ? "connected" : "disconnected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Polling</span>
              <span className={isPollingOk ? "text-green-500" : "text-yellow-500"}>
                {isPollingOk ? "active" : "paused"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rate limit</span>
              <span className={isRateLimitOk ? "text-green-500" : "text-red-500"}>
                {isRateLimitOk ? "OK" : "critical"}
              </span>
            </div>
          </div>
          <div className="border-t" />
          <Link
            href="/health"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Heart className={cn("h-3.5 w-3.5", isHealthy ? "text-green-500" : "text-red-500")} />
            <span>Health dashboard</span>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { claudeUsage, rateLimits, usageDialogOpen, setUsageDialogOpen } = useClaudeUsageRefresh({
    getUsageStats: getClaudeUsageStatsAction,
    getRateLimits: getClaudeRateLimitsAction,
  });

  // Close mobile menu on route change
  useEffect(() => {
    if (pathname) {
      setMobileMenuOpen(false);
    }
  }, [pathname]);

  // Check if this page should use the app shell
  const shouldUseShell = !excludedPaths.some((path) => pathname.startsWith(path));

  if (!shouldUseShell) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Mobile-only thin header */}
      <div className="flex h-14 items-center justify-between border-b px-3 md:hidden">
        <div className="flex items-center gap-2">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0">
              <Sidebar className="h-full border-r-0" />
            </SheetContent>
          </Sheet>
          <Link href="/" className="flex items-center gap-1.5">
            <Image src="/icon.png" alt="GoGo" width={28} height={28} className="h-7 w-7 rounded-md" />
            <span className="text-sm font-semibold">GoGo</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionBadge />
          <ThemeToggle />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar className="h-full" />
        </div>

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Desktop header banner */}
          <header className="hidden md:flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-xs sticky top-0 z-30 px-4 sm:px-6">
            <div className="flex-1">
              {claudeUsage && (
                <HeaderUsageWidget
                  usage={claudeUsage}
                  rateLimits={rateLimits}
                  onClick={() => setUsageDialogOpen(true)}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <ConnectionBadge />
              <ThemeToggle />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>

      {claudeUsage && (
        <ClaudeUsageDialog
          open={usageDialogOpen}
          onOpenChange={setUsageDialogOpen}
          usage={claudeUsage}
          rateLimits={rateLimits}
        />
      )}
    </div>
  );
}
