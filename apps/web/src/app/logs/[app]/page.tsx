import { existsSync, readFileSync } from "node:fs";
import { getLogFilePath } from "@devkit/logger";
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

function loadInitialLogs(app: string): LogEntry[] {
  const logFile = getLogFilePath(app);
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

export default async function AppLogPage({ params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const initialLogs = loadInitialLogs(app);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          &larr; Dashboard
        </Link>
        <h1 className="text-lg font-semibold">{app}</h1>
        <span className="text-sm text-muted-foreground">{initialLogs.length} entries loaded</span>
      </header>
      <LogViewerClient app={app} initialLogs={initialLogs} />
    </div>
  );
}
