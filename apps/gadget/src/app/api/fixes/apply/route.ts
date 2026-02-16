import { type NextRequest, NextResponse } from "next/server";
import { getDb, queryOne } from "@/lib/db";
import { applyFixes } from "@/lib/services/apply-engine";
import type { Repo } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { repoId, fixActionIds } = body;

  if (!repoId || !fixActionIds?.length) {
    return NextResponse.json({ error: "Missing repoId or fixActionIds" }, { status: 400 });
  }

  const db = await getDb();
  const repo = await queryOne<Repo>(db, "SELECT * FROM repos WHERE id = ?", [repoId]);

  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const result = await applyFixes({
    repoId,
    repoPath: repo.local_path,
    fixActionIds,
  });

  return NextResponse.json(result);
}
