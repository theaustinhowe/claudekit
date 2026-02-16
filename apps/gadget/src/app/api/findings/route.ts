import { type NextRequest, NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";
import type { Finding } from "@/lib/types";

type FindingRow = Omit<Finding, "suggested_actions"> & { suggested_actions: string };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repoId = searchParams.get("repoId");
  const scanId = searchParams.get("scanId");
  const severity = searchParams.get("severity");

  const db = await getDb();
  let query = "SELECT * FROM findings WHERE 1=1";
  const params: unknown[] = [];

  if (repoId) {
    query += " AND repo_id = ?";
    params.push(repoId);
  }

  if (scanId) {
    query += " AND scan_id = ?";
    params.push(scanId);
  }

  if (severity) {
    query += " AND severity = ?";
    params.push(severity);
  }

  query += " ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END";

  const findings = await queryAll<FindingRow>(db, query, params);

  // Parse JSON fields
  const parsed = findings.map((f) => ({
    ...f,
    suggested_actions: JSON.parse(f.suggested_actions || "[]"),
  }));

  return NextResponse.json(parsed);
}
