import { NextResponse } from "next/server";
import { APP_DEFINITIONS, getMaturity } from "@/lib/app-definitions";
import { getAppSettings, type PerAppSettings, readSettings } from "@/lib/app-settings";
import { readMaturityOverrides } from "@/lib/maturity";

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

  const maturityOverrides = readMaturityOverrides();

  const results: AppInfo[] = await Promise.all(
    APP_DEFINITIONS.map(async (app) => {
      const isRunning = await checkAppHealth(app.port);
      const effectivePercentage = maturityOverrides[app.id] ?? app.maturityPercentage;
      return {
        ...app,
        url: `http://localhost:${app.port}`,
        status: isRunning ? ("running" as const) : ("stopped" as const),
        maturity: effectivePercentage != null ? getMaturity(effectivePercentage) : undefined,
        settings: app.id !== "web" ? getAppSettings(app.id, settings) : undefined,
        managedByDaemon: daemonStatus ? (daemonStatus[app.id]?.running ?? false) : undefined,
      };
    }),
  );

  return NextResponse.json(results);
}
