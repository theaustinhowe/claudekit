import { NextResponse } from "next/server";
import { type AppSettings, readSettings, writeSettings } from "@/lib/app-settings";

const APP_IDS = ["gadget", "gogo-web", "gogo-orchestrator", "b4u", "inspector", "storybook"];

export async function GET() {
  const settings = readSettings();
  if (!settings) {
    // Return defaults for all apps (legacy mode)
    const defaults: AppSettings = {
      version: 1,
      apps: Object.fromEntries(APP_IDS.map((id) => [id, { autoStart: false, autoRestart: true }])),
    };
    return NextResponse.json(defaults);
  }
  // Fill in defaults for any missing apps
  for (const id of APP_IDS) {
    if (!settings.apps[id]) {
      settings.apps[id] = { autoStart: false, autoRestart: true };
    }
  }
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as AppSettings;
    if (body.version !== 1 || typeof body.apps !== "object") {
      return NextResponse.json({ error: "Invalid settings format" }, { status: 400 });
    }
    writeSettings(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
