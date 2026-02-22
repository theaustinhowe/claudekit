"use server";

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import type { SessionLogRow, SessionRow, SessionStatus, SessionType } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

interface CreateSessionOpts {
  sessionType: SessionType;
  label: string;
  contextType?: "repo" | "project" | null;
  contextId?: string | null;
  contextName?: string | null;
  metadata?: Record<string, unknown>;
}

interface ListSessionsFilter {
  status?: SessionStatus | SessionStatus[];
  contextId?: string;
  contextType?: "repo" | "project";
  sessionType?: SessionType;
  limit?: number;
}

export async function createSessionRecord(opts: CreateSessionOpts): Promise<string> {
  const db = await getDb();
  const id = generateId();
  await execute(
    db,
    `INSERT INTO sessions (id, session_type, status, label, context_type, context_id, context_name, metadata_json, created_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.sessionType,
      opts.label,
      opts.contextType ?? null,
      opts.contextId ?? null,
      opts.contextName ?? null,
      JSON.stringify(opts.metadata ?? {}),
      nowTimestamp(),
    ],
  );
  return id;
}

export async function updateSessionRecord(
  id: string,
  data: Partial<{
    status: SessionStatus;
    progress: number;
    phase: string | null;
    pid: number | null;
    started_at: string;
    completed_at: string;
    error_message: string | null;
    result_json: string;
    metadata_json: string;
  }>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    params.push(value);
  }

  if (sets.length === 0) return;
  params.push(id);
  await execute(db, `UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function listSessions(filter?: ListSessionsFilter): Promise<SessionRow[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    const placeholders = statuses.map(() => "?").join(", ");
    conditions.push(`status IN (${placeholders})`);
    params.push(...statuses);
  }

  if (filter?.contextId) {
    conditions.push("context_id = ?");
    params.push(filter.contextId);
  }

  if (filter?.contextType) {
    conditions.push("context_type = ?");
    params.push(filter.contextType);
  }

  if (filter?.sessionType) {
    conditions.push("session_type = ?");
    params.push(filter.sessionType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter?.limit ? `LIMIT ${filter.limit}` : "LIMIT 50";

  return queryAll<SessionRow>(db, `SELECT * FROM sessions ${where} ORDER BY created_at DESC ${limit}`, params);
}

export async function getSessionRecord(id: string): Promise<SessionRow | undefined> {
  const db = await getDb();
  return queryOne<SessionRow>(db, "SELECT * FROM sessions WHERE id = ?", [id]);
}

export async function getSessionLogsFromDb(sessionId: string, limit = 200): Promise<SessionLogRow[]> {
  const db = await getDb();
  return queryAll<SessionLogRow>(
    db,
    "SELECT * FROM session_logs WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT ?",
    [sessionId, limit],
  );
}

export async function insertSessionLogs(
  sessionId: string,
  logs: Array<{ log: string; logType: string }>,
): Promise<void> {
  if (logs.length === 0) return;
  const db = await getDb();
  const ts = nowTimestamp();
  for (const entry of logs) {
    await execute(db, "INSERT INTO session_logs (session_id, log, log_type, created_at) VALUES (?, ?, ?, ?)", [
      sessionId,
      entry.log,
      entry.logType,
      ts,
    ]);
  }
}
