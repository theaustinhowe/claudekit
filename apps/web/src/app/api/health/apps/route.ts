import { NextResponse } from "next/server";
import { getAppSettings, type PerAppSettings, readSettings } from "@/lib/app-settings";

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
  managedByDaemon?: boolean;
}

const APP_DEFINITIONS: Omit<AppInfo, "url" | "status">[] = [
  {
    id: "gadget",
    name: "Gadget",
    description: "Repository auditor, AI integrations, project scaffolding",
    port: 2100,
    icon: "Wrench",
    favicon: "/app-icons/gadget.png",
    maturity: { label: "Beta", percentage: 65, color: "yellow" },
  },
  {
    id: "gogo-web",
    name: "GoGo Web",
    description: "Job orchestration dashboard for multi-repo AI agents",
    port: 2200,
    icon: "Rocket",
    favicon: "/app-icons/gogo-web.png",
    maturity: { label: "Alpha", percentage: 40, color: "red" },
  },
  {
    id: "b4u",
    name: "B4U",
    description: "Automated repo walkthrough video generator",
    port: 2300,
    icon: "Video",
    favicon: "/app-icons/b4u.png",
    maturity: { label: "Prototype", percentage: 20, color: "red" },
  },
  {
    id: "inspector",
    name: "Inspector",
    description: "GitHub PR analysis, skill building, and comment resolution",
    port: 2400,
    icon: "GitPullRequest",
    favicon: "/app-icons/inspector.png",
    maturity: { label: "Beta", percentage: 55, color: "yellow" },
  },
  {
    id: "inside",
    name: "Inside",
    description: "Project creation, scaffolding, design workspace",
    port: 2150,
    icon: "Sparkles",
    favicon: "/app-icons/inside.png",
    maturity: { label: "Alpha", percentage: 40, color: "red" },
  },
  {
    id: "storybook",
    name: "Storybook",
    description: "Interactive component library and documentation",
    port: 6006,
    icon: "BookOpen",
    maturity: { label: "Stable", percentage: 90, color: "green" },
  },
  {
    id: "gogo-orchestrator",
    name: "GoGo Orchestrator",
    description: "Backend orchestrator for GoGo job execution",
    port: 2201,
    icon: "Cpu",
    maturity: { label: "Alpha", percentage: 35, color: "red" },
  },
  {
    id: "web",
    name: "Web",
    description: "ClaudeKit dashboard, app health monitor, and log viewer",
    port: 2000,
    icon: "Monitor",
    favicon: "/app-icons/web.png",
    maturity: { label: "Stable", percentage: 85, color: "green" },
  },
];

async function checkAppHealth(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://localhost:${port}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // Any HTTP response means the app is running
    return res.status > 0;
  } catch {
    return false;
  }
}

export async function GET() {
  const settings = readSettings();

  // Optionally query daemon status
  let daemonStatus: Record<string, { running: boolean; manuallyStopped: boolean }> | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("http://localhost:2999/status", { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const statuses = (await res.json()) as Array<{ id: string; running: boolean; manuallyStopped: boolean }>;
      daemonStatus = Object.fromEntries(statuses.map((s) => [s.id, s]));
    }
  } catch {
    // Daemon not running
  }

  const results: AppInfo[] = await Promise.all(
    APP_DEFINITIONS.map(async (app) => {
      const isRunning = await checkAppHealth(app.port);
      return {
        ...app,
        url: `http://localhost:${app.port}`,
        status: isRunning ? ("running" as const) : ("stopped" as const),
        settings: app.id !== "web" ? getAppSettings(app.id, settings) : undefined,
        managedByDaemon: daemonStatus ? (daemonStatus[app.id]?.running ?? false) : undefined,
      };
    }),
  );

  return NextResponse.json(results);
}
