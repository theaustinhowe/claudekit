import fs from "node:fs/promises";
import nodePath from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { IMAGE_MIME_TYPES } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";
import { expandTilde } from "@/lib/utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  const ext = nodePath.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[ext];
  if (!mimeType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const db = await getDb();
  const row = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
  if (!row) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  const repoPath = expandTilde(row.local_path);

  // Security: reject absolute paths and traversal sequences before resolution
  if (nodePath.isAbsolute(filePath) || filePath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  const fullPath = nodePath.join(repoPath, filePath);
  const resolvedFull = nodePath.resolve(fullPath);
  const resolvedRepo = nodePath.resolve(repoPath);

  // Security: prevent path traversal
  if (!resolvedFull.startsWith(resolvedRepo + nodePath.sep) && resolvedFull !== resolvedRepo) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  try {
    const data = await fs.readFile(fullPath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
