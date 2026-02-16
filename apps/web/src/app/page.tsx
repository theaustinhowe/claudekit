import { statSync } from "node:fs";
import { basename } from "node:path";
import { listLogFiles } from "@devkit/logger";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

interface LogFileInfo {
  app: string;
  path: string;
  size: number;
  lastModified: string;
}

function getLogFileInfos(): LogFileInfo[] {
  const files = listLogFiles();
  return files
    .map((filePath) => {
      try {
        const stat = statSync(filePath);
        const name = basename(filePath, ".ndjson");
        return {
          app: name,
          path: filePath,
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
