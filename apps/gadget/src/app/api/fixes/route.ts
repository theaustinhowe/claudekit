import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { queryAll } from "@/lib/db/helpers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repoId = searchParams.get("repoId");
  const scanId = searchParams.get("scanId");

  const db = await getDb();
  let query = "SELECT * FROM fix_actions WHERE 1=1";
  const params: unknown[] = [];

  if (repoId) {
    query += " AND repo_id = ?";
    params.push(repoId);
  }

  if (scanId) {
    query += " AND scan_id = ?";
    params.push(scanId);
  }

  query += " ORDER BY created_at DESC";

  const fixes = await queryAll(db, query, params);
  return NextResponse.json(fixes);
}
