import { NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ runId: string; threadId: string }> }) {
  const { runId, threadId } = await params;

  if (!runId || !threadId) {
    return NextResponse.json({ error: "runId and threadId are required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { phase, revision, messages, decisions, status, createdAt } = body;

    if (phase == null || !messages || !status) {
      return NextResponse.json({ error: "phase, messages, and status are required" }, { status: 400 });
    }

    const conn = await getDb();

    await execute(
      conn,
      `INSERT INTO phase_threads (id, run_id, phase, revision, messages_json, decisions_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         messages_json = excluded.messages_json,
         decisions_json = excluded.decisions_json,
         status = excluded.status`,
      [
        threadId,
        runId,
        phase,
        revision ?? 1,
        JSON.stringify(messages),
        JSON.stringify(decisions ?? []),
        status,
        createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
      ],
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save thread" }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string; threadId: string }> }) {
  const { runId, threadId } = await params;

  if (!runId || !threadId) {
    return NextResponse.json({ error: "runId and threadId are required" }, { status: 400 });
  }

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      id: string;
      run_id: string;
      phase: number;
      revision: number;
      messages_json: string;
      decisions_json: string;
      status: string;
      created_at: string;
    }>(conn, "SELECT * FROM phase_threads WHERE id = ? AND run_id = ?", [threadId, runId]);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json({
      id: row.id,
      runId: row.run_id,
      phase: row.phase,
      revision: row.revision,
      messages: JSON.parse(row.messages_json),
      decisions: JSON.parse(row.decisions_json),
      status: row.status,
      createdAt: new Date(row.created_at).getTime(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch thread" }, { status: 500 });
  }
}
