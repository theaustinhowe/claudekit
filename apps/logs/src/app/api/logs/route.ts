import { statSync } from "node:fs";
import { basename } from "node:path";
import { listLogFiles } from "@devkit/logger";
import { NextResponse } from "next/server";

export async function GET() {
  const files = listLogFiles();
  const result = files
    .map((filePath) => {
      try {
        const stat = statSync(filePath);
        return {
          app: basename(filePath, ".ndjson"),
          path: filePath,
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
