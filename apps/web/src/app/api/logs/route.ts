import { statSync } from "node:fs";
import { listLogFiles } from "@claudekit/logger";
import { NextResponse } from "next/server";

export async function GET() {
  const files = listLogFiles();
  const result = files
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
    .filter(Boolean);

  return NextResponse.json(result);
}
