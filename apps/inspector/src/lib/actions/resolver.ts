"use server";

import crypto from "node:crypto";
import { runClaude } from "@devkit/claude-runner";
import { fetchFileContent } from "@/lib/actions/github";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { createServiceLogger } from "@/lib/logger";
import { buildCommentFixPrompt } from "@/lib/prompts";

const log = createServiceLogger("resolver");

export async function startCommentFixes(commentIds: string[]) {
  log.info({ count: commentIds.length }, "Starting comment fix generation");
  const db = await getDb();

  // Fetch comments with context
  const placeholders = commentIds.map(() => "?").join(",");
  const comments = await queryAll<{
    id: string;
    pr_id: string;
    body: string;
    file_path: string | null;
    line_number: number | null;
  }>(db, `SELECT id, pr_id, body, file_path, line_number FROM pr_comments WHERE id IN (${placeholders})`, commentIds);

  if (comments.length === 0) throw new Error("No comments found");

  // Get repo info for file fetching
  const firstComment = comments[0];
  const pr = await queryOne<{ repo_id: string; branch: string | null }>(
    db,
    "SELECT repo_id, branch FROM prs WHERE id = ?",
    [firstComment.pr_id],
  );
  if (!pr) throw new Error("PR not found");

  const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
    pr.repo_id,
  ]);
  if (!repo) throw new Error("Repo not found");

  // Fetch file contents for context
  const enrichedComments = await Promise.all(
    comments.map(async (c) => {
      let fileContent: string | null = null;
      if (c.file_path && pr.branch) {
        fileContent = await fetchFileContent(repo.owner, repo.name, c.file_path, pr.branch);
      }
      return {
        id: c.id,
        body: c.body,
        filePath: c.file_path,
        lineNumber: c.line_number,
        fileContent,
      };
    }),
  );

  const prompt = buildCommentFixPrompt(enrichedComments);

  const result = await runClaude({
    prompt,
    cwd: process.cwd(),
    allowedTools: "",
    onProgress: () => {},
  });

  // Parse JSON response
  const responseText = result.stdout || "";
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse fix response");
  }

  const fixes = JSON.parse(jsonMatch[0]) as Array<{
    commentId: string;
    suggestedFix: string;
    fixDiff: string;
  }>;

  log.info({ fixCount: fixes.length }, "Fixes generated, persisting");
  // Persist fixes
  for (const fix of fixes) {
    const fixId = crypto.randomUUID();
    await execute(
      db,
      "INSERT INTO comment_fixes (id, comment_id, suggested_fix, fix_diff, status, created_at) VALUES (?, ?, ?, ?, 'open', current_timestamp)",
      [fixId, fix.commentId, fix.suggestedFix, fix.fixDiff],
    );
  }

  return fixes.map((f) => f.commentId);
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
