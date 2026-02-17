import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const rawPath = request.nextUrl.searchParams.get("path") || "~";
  const showHidden = request.nextUrl.searchParams.get("showHidden") === "true";

  // Expand tilde
  const expandedPath = rawPath.startsWith("~/") || rawPath === "~" ? rawPath.replace("~", os.homedir()) : rawPath;

  const resolved = path.resolve(expandedPath);
  const home = os.homedir();

  // Security: reject paths outside home directory
  if (!resolved.startsWith(home + path.sep) && resolved !== home) {
    return NextResponse.json({ error: "Access denied: path must be within home directory" }, { status: 403 });
  }

  try {
    // Resolve symlinks to prevent traversal via symlinked directories
    const realPath = await fs.realpath(resolved);
    if (!realPath.startsWith(home + path.sep) && realPath !== home) {
      return NextResponse.json({ error: "Access denied: symlink target is outside home directory" }, { status: 403 });
    }

    const entries = await fs.readdir(realPath, { withFileTypes: true });

    const dirs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!showHidden && entry.name.startsWith(".")) continue;

      // Check if this directory has subdirectories
      let hasChildren = false;
      try {
        const children = await fs.readdir(path.join(realPath, entry.name), { withFileTypes: true });
        hasChildren = children.some((c) => c.isDirectory());
      } catch {
        // Can't read — treat as no children
      }

      dirs.push({
        name: entry.name,
        path: path.join(resolved, entry.name),
        hasChildren,
      });
    }

    // Sort alphabetically
    dirs.sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = resolved === home ? null : path.dirname(resolved);

    return NextResponse.json({
      currentPath: resolved,
      parentPath: parentPath?.startsWith(home) ? parentPath : null,
      entries: dirs,
    });
  } catch {
    return NextResponse.json({ error: "Cannot read directory" }, { status: 400 });
  }
}
