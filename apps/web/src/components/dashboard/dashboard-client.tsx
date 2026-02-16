"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { ChevronDown, Cpu, ExternalLink, Rocket, ScrollText, Video, Wrench } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppInfo {
  id: string;
  name: string;
  description: string;
  port: number;
  url: string;
  status: "running" | "stopped";
  icon: string;
}

interface LogFileInfo {
  app: string;
  path: string;
  size: number;
  lastModified: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Wrench: <Wrench className="h-5 w-5" />,
  Rocket: <Rocket className="h-5 w-5" />,
  Cpu: <Cpu className="h-5 w-5" />,
  Video: <Video className="h-5 w-5" />,
};

const ACCENT_COLORS: Record<string, string> = {
  gadget: "border-l-purple-500",
  "gogo-web": "border-l-blue-500",
  "gogo-orchestrator": "border-l-cyan-500",
  b4u: "border-l-amber-500",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function AppCardSkeleton() {
  return (
    <Card className="animate-pulse border-l-4 border-l-muted">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-muted" />
            <div className="h-5 w-24 rounded bg-muted" />
          </div>
          <div className="h-5 w-12 rounded bg-muted" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-4 w-full rounded bg-muted mb-3" />
        <div className="flex items-center justify-between">
          <div className="h-4 w-16 rounded bg-muted" />
          <div className="h-4 w-4 rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardClient({ logFiles }: { logFiles: LogFileInfo[] }) {
  const [apps, setApps] = useState<AppInfo[] | null>(null);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch("/api/health/apps");
      const data = (await res.json()) as AppInfo[];
      setApps(data);
    } catch {
      // Silently fail, keep previous state
    }
  }, []);

  useEffect(() => {
    fetchApps();
    const interval = setInterval(fetchApps, 10_000);
    return () => clearInterval(interval);
  }, [fetchApps]);

  const logsByApp = useMemo(() => {
    const map = new Map<string, LogFileInfo[]>();
    for (const file of logFiles) {
      const existing = map.get(file.app) ?? [];
      existing.push(file);
      map.set(file.app, existing);
    }
    return map;
  }, [logFiles]);

  // Collect orphan logs that don't belong to any known app
  const knownAppIds = apps ? new Set(apps.map((a) => a.id)) : new Set<string>();
  const orphanLogs = logFiles.filter((f) => !knownAppIds.has(f.app));

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Gradient Hero Header */}
        <div className="gradient-primary rounded-2xl p-8 mb-10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">ClaudeKit</h1>
              <p className="text-white/80">Local development control center</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Applications */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Applications</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {apps === null ? (
              <>
                <AppCardSkeleton />
                <AppCardSkeleton />
                <AppCardSkeleton />
                <AppCardSkeleton />
              </>
            ) : (
              apps.map((app) => {
                const appLogs = logsByApp.get(app.id) ?? [];
                return (
                  <Collapsible key={app.id}>
                    <Card
                      className={cn(
                        "relative border-l-4 transition-all hover:shadow-md hover:-translate-y-0.5",
                        ACCENT_COLORS[app.id] ?? "border-l-primary",
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-primary">{ICON_MAP[app.icon]}</span>
                            <CardTitle className="text-base">{app.name}</CardTitle>
                          </div>
                          <Badge variant="outline" className="font-mono text-xs">
                            :{app.port}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-3">{app.description}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                app.status === "running"
                                  ? "bg-success shadow-[0_0_6px_hsl(var(--success)/0.5)]"
                                  : "bg-muted-foreground/40",
                              )}
                            />
                            <span className="text-xs text-muted-foreground capitalize">{app.status}</span>
                          </div>
                          {app.status === "running" && (
                            <a
                              href={app.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>

                        {/* Collapsible log trigger */}
                        {appLogs.length > 0 && (
                          <CollapsibleTrigger className="flex items-center gap-1.5 mt-3 pt-3 border-t w-full text-xs text-muted-foreground hover:text-foreground transition-colors group">
                            <ScrollText className="h-3.5 w-3.5" />
                            <span>
                              {appLogs.length} log {appLogs.length === 1 ? "file" : "files"}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 ml-auto transition-transform group-data-[state=open]:rotate-180" />
                          </CollapsibleTrigger>
                        )}
                      </CardContent>

                      {/* Collapsible log content */}
                      {appLogs.length > 0 && (
                        <CollapsibleContent>
                          <div className="px-6 pb-4 space-y-1.5">
                            {appLogs.map((file) => (
                              <Link
                                key={file.path}
                                href={`/logs/${file.app}`}
                                className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                              >
                                <span className="font-medium">{file.app}</span>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="font-mono">{formatSize(file.size)}</span>
                                  <span>{formatTime(file.lastModified)}</span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </CollapsibleContent>
                      )}
                    </Card>
                  </Collapsible>
                );
              })
            )}
          </div>

          {/* Empty state */}
          {logFiles.length === 0 && apps !== null && (
            <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground mt-6">
              <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">No log files found</p>
              <p className="text-sm mt-1">Start a ClaudeKit app to generate logs in ~/.devkit/logs/</p>
            </div>
          )}

          {/* Orphan logs that don't match any known app */}
          {orphanLogs.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Other Logs</h3>
              <div className="grid gap-2">
                {orphanLogs.map((file) => (
                  <Link
                    key={file.app}
                    href={`/logs/${file.app}`}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{file.app}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">{formatSize(file.size)}</span>
                      <span>{formatTime(file.lastModified)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
