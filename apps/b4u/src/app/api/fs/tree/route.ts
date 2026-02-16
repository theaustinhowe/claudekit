import { basename } from "node:path";
import { NextResponse } from "next/server";
import { buildFileTree, detectAuth, detectDatabase, detectFramework, detectKeyDirectories } from "@/lib/fs/scanner";

export async function POST(request: Request) {
  const { path } = await request.json();

  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    const [tree, framework, auth, database, directories] = await Promise.all([
      buildFileTree(path, 4),
      detectFramework(path),
      detectAuth(path),
      detectDatabase(path),
      detectKeyDirectories(path),
    ]);

    return NextResponse.json({
      name: basename(path),
      path,
      framework,
      auth,
      database,
      directories,
      tree,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scan project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
