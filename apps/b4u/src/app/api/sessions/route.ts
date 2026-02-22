import { NextResponse } from "next/server";
import { createSession } from "@/lib/claude/session-manager";
import type { SessionRow } from "@/lib/claude/types";
import { getDb, queryAll } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = searchParams.get("limit");

  try {
    const conn = await getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      const statuses = status.split(",");
      const placeholders = statuses.map(() => "?").join(", ");
      conditions.push(`status IN (${placeholders})`);
      params.push(...statuses);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = limit ? `LIMIT ${Number(limit)}` : "LIMIT 50";

    const sessions = await queryAll<SessionRow>(
      conn,
      `SELECT id, session_type, status, label, progress, phase, pid, started_at, completed_at, created_at, error_message
       FROM sessions ${where} ORDER BY created_at DESC ${limitClause}`,
      params,
    );

    return NextResponse.json(sessions);
  } catch (err) {
    console.error("[sessions] Error listing sessions:", err);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { sessionType, label, projectPath } = body;

  if (!sessionType || !label) {
    return NextResponse.json({ error: "sessionType and label required" }, { status: 400 });
  }

  const id = await createSession({ sessionType, label, projectPath });
  return NextResponse.json({ id });
}
