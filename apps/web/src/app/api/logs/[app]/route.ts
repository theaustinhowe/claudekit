import { existsSync } from "node:fs";
import { filterLogEntries, getLogFilePath, readLogEntries } from "@claudekit/logger";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || undefined;
  const logFile = getLogFilePath(app, undefined, date);

  if (!existsSync(logFile)) {
    return NextResponse.json({ error: "Log file not found" }, { status: 404 });
  }

  const level = url.searchParams.get("level") || undefined;
  const query = url.searchParams.get("q") || undefined;
  const since = url.searchParams.get("since") || undefined;
  const limit = Number.parseInt(url.searchParams.get("limit") || "1000", 10);

  const raw = readLogEntries(logFile);
  const entries = filterLogEntries(raw, { level, query, since, limit });

  return NextResponse.json({ entries, total: entries.length });
}
