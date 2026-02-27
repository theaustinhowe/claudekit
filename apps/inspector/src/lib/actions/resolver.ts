"use server";

import { execute, getDb, queryAll } from "@/lib/db";
import { createServiceLogger } from "@/lib/logger";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createCommentFixRunner } from "@/lib/services/session-runners/comment-fix";

const log = createServiceLogger("resolver");

export async function startCommentFixes(commentIds: string[]): Promise<string> {
  log.info({ count: commentIds.length }, "Starting comment fix session");

  const metadata = { commentIds };
  const sessionId = await createSession({
    sessionType: "comment_fix",
    label: `Fix ${commentIds.length} comment${commentIds.length !== 1 ? "s" : ""}`,
    metadata,
  });

  const runner = createCommentFixRunner(metadata);
  await startSession(sessionId, runner);

  return sessionId;
}

export async function getCommentFixes(commentIds: string[]) {
  const db = await getDb();
  const placeholders = commentIds.map(() => "?").join(",");
  return queryAll<{
    id: string;
    comment_id: string;
    suggested_fix: string | null;
    fix_diff: string | null;
    status: string;
  }>(db, `SELECT * FROM comment_fixes WHERE comment_id IN (${placeholders}) ORDER BY created_at DESC`, commentIds);
}

export async function resolveCommentFix(commentId: string) {
  const db = await getDb();
  await execute(db, "UPDATE comment_fixes SET status = 'resolved' WHERE comment_id = ?", [commentId]);
}

export async function resolveAllFixes(commentIds: string[]) {
  const db = await getDb();
  const placeholders = commentIds.map(() => "?").join(",");
  await execute(db, `UPDATE comment_fixes SET status = 'resolved' WHERE comment_id IN (${placeholders})`, commentIds);
}

export async function startFixExecution(fixId: string, commentId: string): Promise<string> {
  log.info({ fixId }, "Starting fix execution session");

  const { createFixExecutionRunner } = await import("@/lib/services/session-runners/fix-execution");

  const metadata = { fixIds: [fixId], batch: false };
  const sessionId = await createSession({
    sessionType: "fix_execution",
    label: `Applying fix for comment ${commentId}`,
    contextId: fixId,
    metadata,
  });

  const runner = createFixExecutionRunner(metadata);
  await startSession(sessionId, runner);

  return sessionId;
}

export async function startBatchFixExecution(fixIds: string[]): Promise<string> {
  log.info({ count: fixIds.length }, "Starting batch fix execution");

  const { createFixExecutionRunner } = await import("@/lib/services/session-runners/fix-execution");

  const metadata = { fixIds, batch: true };
  const sessionId = await createSession({
    sessionType: "fix_execution",
    label: `Applying ${fixIds.length} fixes`,
    metadata,
  });

  const runner = createFixExecutionRunner(metadata);
  await startSession(sessionId, runner);

  return sessionId;
}

export async function getFixExecutionStatus(fixId: string) {
  const db = await getDb();
  return queryAll<{
    id: string;
    fix_id: string;
    comment_id: string;
    status: string;
    branch_name: string | null;
    commit_sha: string | null;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
  }>(db, "SELECT * FROM fix_executions WHERE fix_id = ? ORDER BY created_at DESC LIMIT 1", [fixId]);
}
