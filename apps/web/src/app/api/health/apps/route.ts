import { NextResponse } from "next/server";

interface AppInfo {
  id: string;
  name: string;
  description: string;
  port: number;
  url: string;
  status: "running" | "stopped";
  icon: string;
  favicon?: string;
}

const APP_DEFINITIONS = [
  {
    id: "gadget",
    name: "Gadget",
    description: "Repository auditor, AI integrations, project scaffolding",
    port: 2100,
    icon: "Wrench",
    favicon: "/app-icons/gadget.png",
  },
  {
    id: "gogo-web",
    name: "GoGo Web",
    description: "Job orchestration dashboard for multi-repo AI agents",
    port: 2200,
    icon: "Rocket",
    favicon: "/app-icons/gogo-web.png",
  },
  {
    id: "b4u",
    name: "B4U",
    description: "Automated repo walkthrough video generator",
    port: 2300,
    icon: "Video",
    favicon: "/app-icons/b4u.png",
  },
  {
    id: "inspector",
    name: "Inspector",
    description: "GitHub PR analysis, skill building, and comment resolution",
    port: 2400,
    icon: "GitPullRequest",
    favicon: "/app-icons/inspector.png",
  },
  {
    id: "storybook",
    name: "Storybook",
    description: "Interactive component library and documentation",
    port: 6006,
    icon: "BookOpen",
  },
  {
    id: "gogo-orchestrator",
    name: "GoGo Orchestrator",
    description: "Backend orchestrator for GoGo job execution",
    port: 2201,
    icon: "Cpu",
  },
  {
    id: "web",
    name: "Web",
    description: "Devkit dashboard, app health monitor, and log viewer",
    port: 2000,
    icon: "Monitor",
    favicon: "/app-icons/web.png",
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
  const results: AppInfo[] = await Promise.all(
    APP_DEFINITIONS.map(async (app) => {
      const isRunning = await checkAppHealth(app.port);
      return {
        ...app,
        url: `http://localhost:${app.port}`,
        status: isRunning ? ("running" as const) : ("stopped" as const),
      };
    }),
  );

  return NextResponse.json(results);
}
