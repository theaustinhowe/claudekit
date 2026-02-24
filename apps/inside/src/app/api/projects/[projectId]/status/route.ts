import { NextResponse } from "next/server";
import { getDb, queryOne } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const db = await getDb();
  const row = await queryOne<{ status: string }>(db, "SELECT status FROM generator_projects WHERE id = ?", [projectId]);

  if (!row) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ status: row.status });
}
