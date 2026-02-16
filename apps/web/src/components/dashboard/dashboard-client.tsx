"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Cpu, ExternalLink, Rocket, Video, Wrench } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
    <Card className="animate-pulse">
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

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Devkit</h1>
            <p className="text-muted-foreground">Local development control center</p>
          </div>
          <ThemeToggle />
        </div>

        {/* Applications */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Applications</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {apps === null ? (
              <>
                <AppCardSkeleton />
                <AppCardSkeleton />
                <AppCardSkeleton />
                <AppCardSkeleton />
              </>
            ) : (
              apps.map((app) => (
                <Card key={app.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{ICON_MAP[app.icon]}</span>
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
                            "h-2 w-2 rounded-full",
                            app.status === "running" ? "bg-green-500" : "bg-muted-foreground/40",
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
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Logs */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Logs</h2>
          {logFiles.length === 0 ? (
            <div className="border rounded-lg p-12 text-center text-muted-foreground">
              <p className="text-lg">No log files found</p>
              <p className="text-sm mt-2">Start a devkit app to generate logs in ~/.devkit/logs/</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {logFiles.map((file) => (
                <Link
                  key={file.app}
                  href={`/logs/${file.app}`}
                  className="block border rounded-lg p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{file.app}</h3>
                      <p className="text-sm text-muted-foreground">{file.path}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono">{formatSize(file.size)}</p>
                      <p className="text-xs text-muted-foreground">{formatTime(file.lastModified)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
