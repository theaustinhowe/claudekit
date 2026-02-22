import crypto from "node:crypto";
import { runClaude } from "@devkit/claude-runner";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";

export function createCommentFixRunner(metadata: Record<string, unknown>, _contextId?: string): SessionRunner {
  return async ({ onProgress, signal, sessionId }) => {
    const commentIds = metadata.commentIds as string[];

    onProgress({
      type: "progress",
      progress: 5,
      phase: "Loading comments",
      log: `[INFO] Fetching ${commentIds.length} comments...`,
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const { getDb } = await import("@/lib/db");
    const { queryAll, queryOne, execute } = await import("@devkit/duckdb");
    const { fetchFileContent } = await import("@/lib/actions/github");
    const { buildCommentFixPrompt } = await import("@/lib/prompts");

    const db = await getDb();
    const placeholders = commentIds.map(() => "?").join(",");
    const comments = await queryAll<{
      id: string;
      pr_id: string;
      body: string;
      file_path: string | null;
      line_number: number | null;
    }>(db, `SELECT id, pr_id, body, file_path, line_number FROM pr_comments WHERE id IN (${placeholders})`, commentIds);

    if (comments.length === 0) throw new Error("No comments found");

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

    onProgress({
      type: "progress",
      progress: 15,
      phase: "Fetching file context",
      log: "[INFO] Fetching source file contents for context...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

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

    onProgress({
      type: "progress",
      progress: 30,
      phase: "Generating fixes",
      log: "[INFO] Running Claude to generate code fixes...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const prompt = buildCommentFixPrompt(enrichedComments);

    const result = await runClaude({
      prompt,
      cwd: process.cwd(),
      allowedTools: "",
      signal,
      onPid: (pid) => setSessionPid(sessionId, pid),
      onProgress: (info) => {
        onProgress({
          type: "progress",
          message: info.message,
          log: info.log,
          logType: info.logType,
        });
      },
    });

    onProgress({
      type: "progress",
      progress: 80,
      phase: "Processing fixes",
      log: "[INFO] Parsing fix response...",
      logType: "status",
    });

    const responseText = result.stdout || "";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to parse fix response");

    const fixes = JSON.parse(jsonMatch[0]) as Array<{
      commentId: string;
      suggestedFix: string;
      fixDiff: string;
    }>;

    onProgress({
      type: "progress",
      progress: 90,
      phase: "Saving fixes",
      log: `[INFO] Persisting ${fixes.length} fixes...`,
      logType: "status",
    });

    for (const fix of fixes) {
      const fixId = crypto.randomUUID();
      await execute(
        db,
        "INSERT INTO comment_fixes (id, comment_id, suggested_fix, fix_diff, status, created_at) VALUES (?, ?, ?, ?, 'open', current_timestamp)",
        [fixId, fix.commentId, fix.suggestedFix, fix.fixDiff],
      );
    }

    onProgress({
      type: "progress",
      progress: 100,
      phase: "Complete",
      log: `[SUCCESS] Generated ${fixes.length} fixes`,
      logType: "status",
    });

    return { result: { fixCount: fixes.length, commentIds: fixes.map((f) => f.commentId) } };
  };
}
