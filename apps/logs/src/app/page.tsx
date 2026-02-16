import { listLogFiles } from "@devkit/logger";
import { statSync } from "node:fs";
import { basename } from "node:path";
import Link from "next/link";

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function DashboardPage() {
  const files = getLogFileInfos();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Devkit Logs</h1>
        <p className="text-muted-foreground mb-8">View structured logs from all devkit applications.</p>

        {files.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <p className="text-lg">No log files found</p>
            <p className="text-sm mt-2">Start a devkit app to generate logs in ~/.devkit/logs/</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {files.map((file) => (
              <Link
                key={file.app}
                href={`/${file.app}`}
                className="block border rounded-lg p-4 hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{file.app}</h2>
                    <p className="text-sm text-muted-foreground">{file.path}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{formatSize(file.size)}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(file.lastModified)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
