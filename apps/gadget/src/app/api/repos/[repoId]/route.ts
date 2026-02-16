import { NextResponse } from "next/server";
import { deleteRepos } from "@/lib/actions/repos";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";
import { expandTilde, removeDirectory } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ repoId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { repoId } = await params;

  try {
    const db = await getDb();
    const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
    if (!repo) return NextResponse.json({ error: "Repository not found" }, { status: 404 });

    await removeDirectory(expandTilde(repo.local_path));
    await deleteRepos([repoId]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 });
  }
}
