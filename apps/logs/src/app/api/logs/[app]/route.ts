import { getLogFilePath } from "@devkit/logger";
import { existsSync, readFileSync } from "node:fs";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const logFile = getLogFilePath(app);

  if (!existsSync(logFile)) {
    return NextResponse.json({ error: "Log file not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const level = url.searchParams.get("level");
  const query = url.searchParams.get("q");
  const since = url.searchParams.get("since");
  const limit = Number.parseInt(url.searchParams.get("limit") || "1000", 10);

  const content = readFileSync(logFile, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  let entries = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);

  if (level) {
    const levels = level.split(",");
    entries = entries.filter((e: Record<string, unknown>) => {
      const entryLevel = pinoLevelToName(e.level as number);
      return levels.includes(entryLevel);
    });
  }

  if (query) {
    const q = query.toLowerCase();
    entries = entries.filter((e: Record<string, unknown>) => JSON.stringify(e).toLowerCase().includes(q));
  }

  if (since) {
    const sinceMs = parseSince(since);
    entries = entries.filter((e: Record<string, unknown>) => {
      const ts = e.time as number;
      return ts >= sinceMs;
    });
  }

  // Return last N entries
  entries = entries.slice(-limit);

  return NextResponse.json({ entries, total: entries.length });
}

function pinoLevelToName(level: number): string {
  if (level <= 10) return "trace";
  if (level <= 20) return "debug";
  if (level <= 30) return "info";
  if (level <= 40) return "warn";
  if (level <= 50) return "error";
  return "fatal";
}

function parseSince(since: string): number {
  const match = since.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const now = Date.now();
  switch (unit) {
    case "s": return now - value * 1000;
    case "m": return now - value * 60 * 1000;
    case "h": return now - value * 60 * 60 * 1000;
    case "d": return now - value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}
