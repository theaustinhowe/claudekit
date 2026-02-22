import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb, queryOne } from "@/lib/db";
import type { ProjectScreenshot } from "@/lib/types";

interface RouteContext {
  params: Promise<{ projectId: string; screenshotId: string }>;
}

const SCREENSHOTS_DIR = path.join(os.homedir(), ".inside", "screenshots");

// GET — serve screenshot PNG file
export async function GET(_request: Request, { params }: RouteContext) {
  const { screenshotId } = await params;

  const db = await getDb();
  const screenshot = await queryOne<ProjectScreenshot>(db, "SELECT * FROM project_screenshots WHERE id = ?", [
    screenshotId,
  ]);

  if (!screenshot) {
    return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
  }

  // Security: validate screenshot file_path is within the expected screenshots directory
  const resolvedPath = path.resolve(screenshot.file_path);
  if (!resolvedPath.startsWith(SCREENSHOTS_DIR + path.sep) && !resolvedPath.startsWith(SCREENSHOTS_DIR)) {
    return NextResponse.json({ error: "Invalid screenshot path" }, { status: 403 });
  }

  try {
    const fileBuffer = fs.readFileSync(resolvedPath);
    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Screenshot file not found" }, { status: 404 });
  }
}
