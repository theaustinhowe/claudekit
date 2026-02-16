import { NextResponse } from "next/server";

interface AppInfo {
  id: string;
  name: string;
  description: string;
  port: number;
  url: string;
  status: "running" | "stopped";
  icon: string;
}

const APP_DEFINITIONS = [
  {
    id: "gadget",
    name: "Gadget",
    description: "Repository auditor, AI integrations, project scaffolding",
    port: 2100,
    icon: "Wrench",
  },
  {
    id: "gogo-web",
    name: "GoGo Web",
    description: "Job orchestration dashboard for multi-repo AI agents",
    port: 2200,
    icon: "Rocket",
  },
  {
    id: "gogo-orchestrator",
    name: "GoGo Orchestrator",
    description: "Backend orchestrator for GoGo job execution",
    port: 2201,
    icon: "Cpu",
  },
  {
    id: "b4u",
    name: "B4U",
    description: "Automated repo walkthrough video generator",
    port: 2300,
    icon: "Video",
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
