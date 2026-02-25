"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@claudekit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { Label } from "@claudekit/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@claudekit/ui/components/popover";
import { Skeleton } from "@claudekit/ui/components/skeleton";
import { Switch } from "@claudekit/ui/components/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  Cpu,
  Database,
  GitPullRequest,
  Monitor,
  Play,
  Power,
  Rocket,
  RotateCw,
  ScrollText,
  Settings2,
  Sparkles,
  Video,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MaturityPopover } from "@/components/dashboard/maturity-popover";
import { TodoSheet } from "@/components/todos/todo-sheet";
import { useTodos } from "@/components/todos/use-todos";
import { getMaturity } from "@/lib/app-definitions";
import type { Todo } from "@/lib/todos";

interface PerAppSettings {
  autoStart: boolean;
  autoRestart: boolean;
}

interface AppSettings {
  version: 1;
  apps: Record<string, PerAppSettings>;
}

interface AppInfo {
  id: string;
  name: string;
  description: string;
  port: number;
  url: string;
  status: "running" | "stopped";
  icon: string;
  favicon?: string;
  maturity?: { label: string; percentage: number; color: "green" | "yellow" | "red" };
  settings?: PerAppSettings;
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
  Database: <Database className="h-5 w-5" />,
  Video: <Video className="h-5 w-5" />,
  GitPullRequest: <GitPullRequest className="h-5 w-5" />,
  BookOpen: <BookOpen className="h-5 w-5" />,
  Monitor: <Monitor className="h-5 w-5" />,
  Sparkles: <Sparkles className="h-5 w-5" />,
};

const ACCENT_COLORS: Record<string, string> = {
  gadget: "border-l-purple-500",
  "gogo-web": "border-l-blue-500",
  "gogo-orchestrator": "border-l-cyan-500",
  b4u: "border-l-amber-500",
  ducktails: "border-l-teal-500",
  inspector: "border-l-rose-500",
  storybook: "border-l-pink-500",
  inside: "border-l-orange-500",
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
            <Skeleton className="h-4 w-10 rounded-full" />
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-3" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-2.5 w-2.5 rounded-full" />
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

interface DashboardClientProps {
  logFiles: LogFileInfo[];
  initialTodos: Record<string, Todo[]>;
  initialSettings: AppSettings | null;
}

function SettingsPopover({
  appId,
  settings,
  onToggle,
}: {
  appId: string;
  settings: PerAppSettings;
  onToggle: (appId: string, key: "autoStart" | "autoRestart", value: boolean) => void;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-56" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <p className="text-sm font-medium">App Settings</p>
          <div className="flex items-center justify-between">
            <Label htmlFor={`${appId}-autostart`} className="text-xs">
              Auto-start
            </Label>
            <Switch
              id={`${appId}-autostart`}
              checked={settings.autoStart}
              onCheckedChange={(checked) => onToggle(appId, "autoStart", checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor={`${appId}-autorestart`} className="text-xs">
              Auto-restart
            </Label>
            <Switch
              id={`${appId}-autorestart`}
              checked={settings.autoRestart}
              onCheckedChange={(checked) => onToggle(appId, "autoRestart", checked)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DashboardClient({ logFiles, initialTodos, initialSettings }: DashboardClientProps) {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const { todosByApp, addTodo, toggleTodo, editTodo, deleteTodo, clearCompleted } = useTodos(initialTodos);
  const [settings, setSettings] = useState<AppSettings>(initialSettings ?? { version: 1, apps: {} });
  const [stopping, setStopping] = useState<Set<string>>(new Set());
  // Track confirmed statuses for debounced section transitions
  const [confirmedStatus, setConfirmedStatus] = useState<Record<string, "running" | "stopped">>({});
  const prevStatusRef = useRef<Record<string, "running" | "stopped">>({});

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
        const res = await fetch(`/api/apps/${encodeURIComponent(appId)}/restart`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? `Failed to start ${appId}`);
          return;
        }
        setTimeout(fetchApps, 2000);
      } catch {
        toast.error("Could not reach the app manager");
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

  const toggleSetting = useCallback(async (appId: string, key: "autoStart" | "autoRestart", value: boolean) => {
    setSettings((prev) => {
      const updated: AppSettings = {
        ...prev,
        apps: {
          ...prev.apps,
          [appId]: {
            ...{ autoStart: false, autoRestart: true },
            ...prev.apps[appId],
            [key]: value,
          },
        },
      };
      // Fire and forget the API call
      fetch("/api/apps/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      }).catch(() => {});
      return updated;
    });
  }, []);

  const updateMaturity = useCallback((appId: string, percentage: number) => {
    setApps((prev) => {
      if (!prev) return prev;
      return prev.map((a) => (a.id === appId ? { ...a, maturity: getMaturity(percentage) } : a));
    });
    // Fire-and-forget: GET current overrides, merge, PUT
    fetch("/api/apps/maturity")
      .then((res) => res.json())
      .then((current: Record<string, number>) => {
        return fetch("/api/apps/maturity", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...current, [appId]: percentage }),
        });
      })
      .catch(() => {});
  }, []);

  const stopApp = useCallback(
    async (appId: string) => {
      setStopping((prev) => new Set(prev).add(appId));
      try {
        const res = await fetch(`/api/apps/${encodeURIComponent(appId)}/stop`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? `Failed to stop ${appId}`);
          return;
        }
        setTimeout(fetchApps, 2000);
      } catch {
        toast.error("Could not reach the app manager");
      } finally {
        setStopping((prev) => {
          const next = new Set(prev);
          next.delete(appId);
          return next;
        });
      }
    },
    [fetchApps],
  );

  useEffect(() => {
    if (!apps) return;
    const currentStatuses: Record<string, "running" | "stopped"> = {};
    for (const app of apps) {
      currentStatuses[app.id] = app.status;
    }
    // An app must maintain its status for 2 consecutive polls to move sections
    setConfirmedStatus((prev) => {
      const newConfirmed = { ...prev };
      for (const [id, status] of Object.entries(currentStatuses)) {
        if (prevStatusRef.current[id] === status) {
          // Same as previous poll — confirm it
          newConfirmed[id] = status;
        }
        // If different from previous, don't update confirmed yet (wait for next poll)
      }
      return newConfirmed;
    });
    prevStatusRef.current = currentStatuses;
  }, [apps]);

  const logsByApp = useMemo(() => {
    const map = new Map<string, LogFileInfo[]>();
    for (const file of logFiles) {
      const existing = map.get(file.app) ?? [];
      existing.push(file);
      map.set(file.app, existing);
    }
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

  const knownAppIds = apps ? new Set(apps.map((a) => a.id)) : new Set<string>();
  const orphanLogs = logFiles.filter((f) => !knownAppIds.has(f.app));

  const getEffectiveStatus = useCallback(
    (app: AppInfo): "running" | "stopped" => {
      // Use confirmed status for section placement, fall back to current
      return confirmedStatus[app.id] ?? app.status;
    },
    [confirmedStatus],
  );

  const activeApps = useMemo(
    () => apps?.filter((a) => getEffectiveStatus(a) === "running") ?? [],
    [apps, getEffectiveStatus],
  );
  const inactiveApps = useMemo(
    () => apps?.filter((a) => getEffectiveStatus(a) === "stopped") ?? [],
    [apps, getEffectiveStatus],
  );

  const [todoSheetApp, setTodoSheetApp] = useState<string | null>(null);

  const renderActiveCard = (app: AppInfo) => {
    const appLogs = logsByApp.get(app.id) ?? [];
    const appTodos = todosByApp[app.id] ?? [];
    const pendingCount = appTodos.filter((t) => !t.resolved).length;
    return (
      <Card
        key={app.id}
        className={cn(
          "relative border-l-4 transition-all hover:shadow-md hover:-translate-y-0.5",
          ACCENT_COLORS[app.id] ?? "border-l-primary",
        )}
      >
        {/* Upper zone -- click to open app */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: conditional role/tabIndex/onKeyDown correctly implemented */}
        <div
          role={app.id !== "web" && app.status === "running" ? "link" : undefined}
          tabIndex={app.id !== "web" && app.status === "running" ? 0 : -1}
          className={cn("w-full text-left", app.id !== "web" && app.status === "running" && "cursor-pointer")}
          onClick={() => {
            if (app.id !== "web" && app.status === "running") {
              window.location.href = app.url;
            }
          }}
          onKeyDown={(e) => {
            if (app.id !== "web" && app.status === "running" && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              window.location.href = app.url;
            }
          }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {app.favicon ? (
                  <Image src={app.favicon} alt="" width={20} height={20} className="rounded" />
                ) : (
                  <span className="text-primary">{ICON_MAP[app.icon]}</span>
                )}
                <CardTitle className="text-base">{app.name}</CardTitle>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground/60">
                  :{app.port}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                {app.id !== "web" &&
                  (app.status === "running" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          disabled={stopping.has(app.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            stopApp(app.id);
                          }}
                        >
                          {stopping.has(app.id) ? (
                            <RotateCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{stopping.has(app.id) ? "Stopping\u2026" : "Stop"}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                          disabled={restarting.has(app.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            restartApp(app.id);
                          }}
                        >
                          {restarting.has(app.id) ? (
                            <RotateCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {restarting.has(app.id) ? "Starting\u2026" : "Start"}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="relative h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTodoSheetApp(app.id);
                      }}
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      {pendingCount > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">View todos</TooltipContent>
                </Tooltip>
                {app.id !== "web" && (
                  <SettingsPopover
                    appId={app.id}
                    settings={settings.apps[app.id] ?? { autoStart: false, autoRestart: true }}
                    onToggle={toggleSetting}
                  />
                )}
              </div>
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
                {app.maturity && (
                  <>
                    <span className="text-muted-foreground/40 text-xs">&middot;</span>
                    <MaturityPopover
                      percentage={app.maturity.percentage}
                      color={app.maturity.color}
                      label={app.maturity.label}
                      onCommit={(pct) => updateMaturity(app.id, pct)}
                    />
                  </>
                )}
              </div>
              {app.id === "web" && <span className="text-xs text-muted-foreground italic">You are here</span>}
            </div>
          </div>
        </div>

        {/* Logs collapsible */}
        {appLogs.length > 0 && (
          <Collapsible>
            <div className="px-6 pb-4">
              <CollapsibleTrigger className="flex items-center gap-1.5 pt-3 border-t w-full text-xs text-muted-foreground hover:text-foreground transition-colors group">
                <ScrollText className="h-3.5 w-3.5" />
                <span>
                  {appLogs.length} log {appLogs.length === 1 ? "file" : "files"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 ml-auto transition-transform group-data-[open]:rotate-180" />
              </CollapsibleTrigger>
            </div>
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
          </Collapsible>
        )}
      </Card>
    );
  };

  return (
    <TooltipProvider>
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Todo drawer */}
          {todoSheetApp && (
            <TodoSheet
              open
              onOpenChange={(open) => !open && setTodoSheetApp(null)}
              appName={apps?.find((a) => a.id === todoSheetApp)?.name ?? todoSheetApp}
              todos={todosByApp[todoSheetApp] ?? []}
              onAdd={(text) => addTodo(todoSheetApp, text)}
              onToggle={(todoId, resolved) => toggleTodo(todoSheetApp, todoId, resolved)}
              onEdit={(todoId, text) => editTodo(todoSheetApp, todoId, text)}
              onDelete={(todoId) => deleteTodo(todoSheetApp, todoId)}
              onClearCompleted={() => clearCompleted(todoSheetApp)}
            />
          )}

          {/* Loading skeletons */}
          {apps === null && (
            <section className="mb-10">
              <h2 className="text-lg font-semibold mb-4">Applications</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <AppCardSkeleton index={0} />
                <AppCardSkeleton index={1} />
                <AppCardSkeleton index={2} />
                <AppCardSkeleton index={3} />
                <AppCardSkeleton index={4} />
                <AppCardSkeleton index={5} />
                <AppCardSkeleton index={6} />
                <AppCardSkeleton index={7} />
              </div>
            </section>
          )}

          {/* Active Applications */}
          {activeApps.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-semibold mb-4">Active</h2>
              <div className="grid gap-4 sm:grid-cols-2">{activeApps.map((app) => renderActiveCard(app))}</div>
            </section>
          )}

          {/* Section heading when no active apps */}
          {apps !== null && activeApps.length === 0 && <h2 className="text-lg font-semibold mb-4">Applications</h2>}

          {/* Inactive Applications */}
          {inactiveApps.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Inactive</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {inactiveApps.map((app) => (
                  <Card
                    key={app.id}
                    className={cn(
                      "border-l-4 opacity-75 hover:opacity-100 transition-all",
                      ACCENT_COLORS[app.id] ?? "border-l-primary",
                    )}
                  >
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {app.favicon ? (
                            <Image src={app.favicon} alt="" width={16} height={16} className="rounded opacity-60" />
                          ) : (
                            <span className="text-muted-foreground">{ICON_MAP[app.icon]}</span>
                          )}
                          <span className="text-sm font-medium">{app.name}</span>
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] px-1.5 py-0 text-muted-foreground/60"
                          >
                            :{app.port}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {app.id !== "web" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                                  disabled={restarting.has(app.id)}
                                  onClick={() => restartApp(app.id)}
                                >
                                  {restarting.has(app.id) ? (
                                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                {restarting.has(app.id) ? "Starting\u2026" : "Start"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {app.id !== "web" && (
                            <SettingsPopover
                              appId={app.id}
                              settings={settings.apps[app.id] ?? { autoStart: false, autoRestart: true }}
                              onToggle={toggleSetting}
                            />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3">
                      <p className="text-xs text-muted-foreground mb-2">{app.description}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-xs text-muted-foreground">Stopped</span>
                        {app.maturity && (
                          <>
                            <span className="text-muted-foreground/40 text-xs">&middot;</span>
                            <MaturityPopover
                              percentage={app.maturity.percentage}
                              color={app.maturity.color}
                              label={app.maturity.label}
                              onCommit={(pct) => updateMaturity(app.id, pct)}
                            />
                          </>
                        )}
                        {app.id === "web" && (
                          <>
                            <span className="text-muted-foreground/40 text-xs">&middot;</span>
                            <span className="text-xs text-muted-foreground italic">You are here</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {logFiles.length === 0 && apps !== null && (
            <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground mt-6">
              <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">No log files found</p>
              <p className="text-sm mt-1">Start a ClaudeKit app to generate logs in ~/.claudekit/logs/</p>
            </div>
          )}

          {/* Orphan logs */}
          {apps !== null && orphanLogs.length > 0 && (
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
        </div>
      </div>
    </TooltipProvider>
  );
}
