import { existsSync, readFileSync } from "node:fs";
import { getLogFilePath, listLogFiles } from "@devkit/logger";
import Link from "next/link";
import { LogViewerClient } from "@/components/log-viewer-client";

interface LogEntry {
  level: number;
  time: number;
  msg: string;
  app?: string;
  service?: string;
  [key: string]: unknown;
}

function getTodayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function loadInitialLogs(app: string, date?: string): LogEntry[] {
  const logFile = getLogFilePath(app, undefined, date);
  if (!existsSync(logFile)) return [];

  const content = readFileSync(logFile, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  // Load last 1000 lines
  const recent = lines.slice(-1000);
  return recent
    .map((line) => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LogEntry => e !== null);
}

function getAvailableDates(app: string): string[] {
  const files = listLogFiles();
  return files
    .filter((f) => f.app === app && f.date !== null)
    .map((f) => f.date as string)
    .sort((a, b) => b.localeCompare(a));
}

export default async function AppLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ app: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { app } = await params;
  const { date: dateParam } = await searchParams;
  const today = getTodayDate();
  const date = dateParam || today;
  const isToday = date === today;
  const initialLogs = loadInitialLogs(app, date);
  const availableDates = getAvailableDates(app);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 65px)" }}>
      <div className="border-b px-8 py-3 flex items-center gap-2 text-sm flex-shrink-0">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{app}</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{formatDateLabel(date)}</span>
        <span className="text-xs text-muted-foreground ml-2">{initialLogs.length} entries loaded</span>
      </div>
      <LogViewerClient
        app={app}
        date={date}
        isToday={isToday}
        initialLogs={initialLogs}
        availableDates={availableDates}
      />
    </div>
  );
}
