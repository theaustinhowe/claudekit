"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { Skeleton } from "@devkit/ui/components/skeleton";
import {
  BookOpen,
  ChevronDown,
  Cpu,
  ExternalLink,
  Monitor,
  Rocket,
  RotateCw,
  ScrollText,
  Video,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  date: string | null;
  path: string;
  size: number;
  lastModified: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Wrench: <Wrench className="h-5 w-5" />,
  Rocket: <Rocket className="h-5 w-5" />,
  Cpu: <Cpu className="h-5 w-5" />,
  Video: <Video className="h-5 w-5" />,
  BookOpen: <BookOpen className="h-5 w-5" />,
  Monitor: <Monitor className="h-5 w-5" />,
};

const ACCENT_COLORS: Record<string, string> = {
  gadget: "border-l-purple-500",
  "gogo-web": "border-l-blue-500",
  "gogo-orchestrator": "border-l-cyan-500",
  b4u: "border-l-amber-500",
  storybook: "border-l-pink-500",
  web: "border-l-emerald-500",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const SKELETON_ACCENT_COLORS = Object.values(ACCENT_COLORS);

function AppCardSkeleton({ index }: { index: number }) {
  const accent = SKELETON_ACCENT_COLORS[index % SKELETON_ACCENT_COLORS.length];
  return (
    <Card className={cn("border-l-4", accent)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-3" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="h-4 w-10" />
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

  const [restarting, setRestarting] = useState<Set<string>>(new Set());

  const restartApp = useCallback(
    async (appId: string) => {
      setRestarting((prev) => new Set(prev).add(appId));
      try {
        await fetch(`/api/apps/${encodeURIComponent(appId)}/restart`, { method: "POST" });
        // Poll for status change after a short delay
        setTimeout(fetchApps, 2000);
      } finally {
        setRestarting((prev) => {
          const next = new Set(prev);
          next.delete(appId);
          return next;
        });
      }
    },
    [fetchApps],
  );

  const logsByApp = useMemo(() => {
    const map = new Map<string, LogFileInfo[]>();
    for (const file of logFiles) {
      const existing = map.get(file.app) ?? [];
      existing.push(file);
      map.set(file.app, existing);
    }
    // Sort each app's logs by date descending (most recent first)
    for (const [key, files] of map) {
      map.set(
        key,
        files.sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return 1;
          return b.date.localeCompare(a.date);
        }),
      );
    }
    return map;
  }, [logFiles]);

  // Collect orphan logs that don't belong to any known app
  const knownAppIds = apps ? new Set(apps.map((a) => a.id)) : new Set<string>();
  const orphanLogs = logFiles.filter((f) => !knownAppIds.has(f.app));

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Applications */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Applications</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {apps === null ? (
              <>
                <AppCardSkeleton index={0} />
                <AppCardSkeleton index={1} />
                <AppCardSkeleton index={2} />
                <AppCardSkeleton index={3} />
                <AppCardSkeleton index={4} />
                <AppCardSkeleton index={5} />
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
                      {/* Upper zone — click to open app (disabled for web since you're already here) */}
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: conditional role/tabIndex/onKeyDown correctly implemented */}
                      <div
                        role={app.id !== "web" && app.status === "running" ? "link" : undefined}
                        tabIndex={app.id !== "web" && app.status === "running" ? 0 : -1}
                        className={cn(
                          "w-full text-left",
                          app.id !== "web" && app.status === "running" && "cursor-pointer",
                        )}
                        onClick={() => {
                          if (app.id !== "web" && app.status === "running") {
                            window.open(app.url, "_blank", "noopener,noreferrer");
                          }
                        }}
                        onKeyDown={(e) => {
                          if (app.id !== "web" && app.status === "running" && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            window.open(app.url, "_blank", "noopener,noreferrer");
                          }
                        }}
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
                        <div className="px-6 pb-4">
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
                            {app.id === "web" ? (
                              <span className="text-xs text-muted-foreground italic">You are here</span>
                            ) : app.status === "running" ? (
                              <a
                                href={app.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                                disabled={restarting.has(app.id)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  restartApp(app.id);
                                }}
                              >
                                {restarting.has(app.id) ? "Starting\u2026" : "Start"}
                                <RotateCw className={cn("h-3 w-3", restarting.has(app.id) && "animate-spin")} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lower zone — collapsible logs */}
                      {appLogs.length > 0 && (
                        <div className="px-6 pb-4">
                          <CollapsibleTrigger className="flex items-center gap-1.5 pt-3 border-t w-full text-xs text-muted-foreground hover:text-foreground transition-colors group">
                            <ScrollText className="h-3.5 w-3.5" />
                            <span>
                              {appLogs.length} log {appLogs.length === 1 ? "file" : "files"}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 ml-auto transition-transform group-data-[open]:rotate-180" />
                          </CollapsibleTrigger>
                        </div>
                      )}

                      {appLogs.length > 0 && (
                        <CollapsibleContent>
                          <div className="px-6 pb-4 space-y-1.5">
                            {appLogs.map((file) => (
                              <Link
                                key={file.path}
                                href={file.date ? `/logs/${file.app}?date=${file.date}` : `/logs/${file.app}`}
                                className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                              >
                                <span className="font-medium">{file.date ? formatDate(file.date) : "Legacy"}</span>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="font-mono">{formatSize(file.size)}</span>
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
                    key={file.path}
                    href={file.date ? `/logs/${file.app}?date=${file.date}` : `/logs/${file.app}`}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{file.app}</span>
                      {file.date && <span className="text-xs text-muted-foreground">{formatDate(file.date)}</span>}
                      {!file.date && (
                        <Badge variant="outline" className="text-xs">
                          Legacy
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">{formatSize(file.size)}</span>
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
