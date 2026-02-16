import { statSync } from "node:fs";
import { listLogFiles } from "@devkit/logger";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

interface LogFileInfo {
  app: string;
  date: string | null;
  path: string;
  size: number;
  lastModified: string;
}

function getLogFileInfos(): LogFileInfo[] {
  const files = listLogFiles();
  return files
    .map((entry) => {
      try {
        const stat = statSync(entry.path);
        return {
          app: entry.app,
          date: entry.date,
          path: entry.path,
          size: stat.size,
          lastModified: stat.mtime.toISOString(),
        };
      } catch {
        return null;
      }
    })
    .filter((f): f is LogFileInfo => f !== null)
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

export default function DashboardPage() {
  const files = getLogFileInfos();
  return <DashboardClient logFiles={files} />;
}
