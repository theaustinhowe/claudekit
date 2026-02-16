import { execute, queryAll, queryOne } from "@devkit/duckdb";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../db/index.js";
import {
  type DbIssue,
  type DbIssueComment,
  type DbJob,
  type DbRepository,
  mapIssue,
  mapIssueComment,
  mapJob,
  mapRepositoryFull,
} from "../db/schema.js";
import {
  createIssueCommentForRepo,
  createIssueForRepo,
  type GitHubIssue,
  getIssueByNumber,
} from "../services/github/index.js";
import { syncCommentsForIssue, syncIssuesForRepo } from "../services/issue-sync.js";
import { createServiceLogger } from "../utils/logger.js";
import { broadcast } from "../ws/handler.js";

const log = createServiceLogger("issues-api");

// Validation schemas
const ListIssuesQuerySchema = z.object({
  state: z.enum(["open", "closed", "all"]).optional().default("open"),
  labels: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional().default(30),
  page: z.coerce.number().int().min(1).optional().default(1),
});

const CreateIssueBodySchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

const CreateCommentBodySchema = z.object({
  body: z.string().min(1),
});

/**
 * Check if a job already exists for an issue
 */
async function jobExistsForIssue(
  repositoryId: string,
  issueNumber: number,
): Promise<{ exists: boolean; jobId?: string }> {
  const conn = await getDb();
  const existing = await queryOne<{ id: string }>(
    conn,
    "SELECT id FROM jobs WHERE repository_id = ? AND issue_number = ? LIMIT 1",
    [repositoryId, issueNumber],
  );

  return existing ? { exists: true, jobId: existing.id } : { exists: false };
}

/**
 * Create a job from a GitHub issue (reused from issue-polling.ts logic)
 */
async function createJobFromIssue(repositoryId: string, issue: GitHubIssue): Promise<{ id: string }> {
  const conn = await getDb();
  const now = new Date().toISOString();

  const newJob = await queryOne<DbJob>(
    conn,
    `INSERT INTO jobs (repository_id, issue_number, issue_title, issue_url, issue_body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [repositoryId, issue.number, issue.title, issue.html_url, issue.body, "queued", now, now],
  );

  if (!newJob) {
    throw new Error("Failed to create job");
  }

  const mapped = mapJob(newJob);

  // Create job creation event
  await execute(
    conn,
    `INSERT INTO job_events (job_id, event_type, from_status, to_status, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [mapped.id, "state_change", null, "queued", "Job manually created from issue", now],
  );

  // Broadcast job created
  broadcast({ type: "job:created", payload: mapped });

  log.info({ issueNumber: issue.number, issueTitle: issue.title }, "Created job for issue");

  return { id: mapped.id };
}

/**
 * Map a local issue DB row to the API response shape expected by the frontend
 */
function mapLocalIssueToResponse(row: DbIssue) {
  const mapped = mapIssue(row);
  return {
    number: mapped.number,
    title: mapped.title,
    body: mapped.body,
    html_url: mapped.htmlUrl,
    state: mapped.state,
    labels: (mapped.labels ?? []) as {
      id: number;
      name: string;
      color: string;
      description: string | null;
    }[],
    created_at: mapped.githubCreatedAt?.toISOString() ?? mapped.createdAt.toISOString(),
    updated_at: mapped.githubUpdatedAt?.toISOString() ?? mapped.updatedAt.toISOString(),
    user: mapped.authorLogin
      ? {
          login: mapped.authorLogin,
          avatar_url: mapped.authorAvatarUrl ?? "",
          html_url: mapped.authorHtmlUrl ?? "",
        }
      : null,
  };
}

/**
 * Map a local comment DB row to the API response shape expected by the frontend
 */
function mapLocalCommentToResponse(row: DbIssueComment) {
  const mapped = mapIssueComment(row);
  return {
    id: mapped.githubCommentId,
    body: mapped.body,
    html_url: mapped.htmlUrl,
    user: mapped.authorLogin
      ? {
          login: mapped.authorLogin,
          type: mapped.authorType ?? "User",
          avatar_url: mapped.authorAvatarUrl ?? "",
        }
      : null,
    created_at: mapped.githubCreatedAt?.toISOString() ?? mapped.createdAt.toISOString(),
    updated_at: mapped.githubUpdatedAt?.toISOString() ?? mapped.updatedAt.toISOString(),
  };
}

export const issuesRouter: FastifyPluginAsync = async (fastify) => {
  // List issues for a repository (reads from local DB)
  // GET /api/repositories/:id/issues
  fastify.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    "/:id/issues",
    async (request, reply) => {
      const repositoryId = request.params.id;
      const conn = await getDb();

      // Check repository exists
      const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);

      if (!repoRow) {
        return reply.status(404).send({ error: "Repository not found" });
      }

      const repo = mapRepositoryFull(repoRow);

      const parsed = ListIssuesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: z.treeifyError(parsed.error),
        });
      }

      const { state, labels, per_page, page } = parsed.data;

      // If repo has never been synced, trigger initial sync
      if (!repo.lastIssueSyncAt) {
        try {
          await syncIssuesForRepo(repositoryId);
        } catch (error) {
          log.error({ err: error }, "Initial sync failed, returning empty");
        }
      }

      // Build query conditions
      const whereParts: string[] = ["repository_id = ?"];
      const whereParams: unknown[] = [repositoryId];
      if (state !== "all") {
        whereParts.push("state = ?");
        whereParams.push(state);
      }

      // Fetch from local DB
      const offset = (page - 1) * per_page;
      const localIssues = await queryAll<DbIssue>(
        conn,
        `SELECT * FROM issues WHERE ${whereParts.join(" AND ")} ORDER BY number DESC LIMIT ? OFFSET ?`,
        [...whereParams, per_page, offset],
      );

      // Filter by labels in application code (JSON field)
      let filteredIssues = localIssues;
      if (labels) {
        const labelNames = labels.split(",").map((l) => l.trim().toLowerCase());
        filteredIssues = localIssues.filter((issue) => {
          const mapped = mapIssue(issue);
          const issueLabels = (mapped.labels ?? []) as { name: string }[];
          return labelNames.some((ln) => issueLabels.some((il) => il.name.toLowerCase() === ln));
        });
      }

      // Map to API response shape and attach job info
      const issuesWithJobInfo = await Promise.all(
        filteredIssues.map(async (issue) => {
          const mapped = mapIssue(issue);
          const { exists, jobId } = await jobExistsForIssue(repositoryId, mapped.number);
          return {
            ...mapLocalIssueToResponse(issue),
            hasJob: exists,
            jobId: jobId ?? null,
          };
        }),
      );

      return {
        data: issuesWithJobInfo,
        pagination: {
          page,
          per_page,
        },
      };
    },
  );

  // Create a new issue (write-through: GitHub first, then local DB)
  // POST /api/repositories/:id/issues
  fastify.post<{ Params: { id: string }; Body: unknown }>("/:id/issues", async (request, reply) => {
    const repositoryId = request.params.id;
    const conn = await getDb();

    // Check repository exists
    const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);

    if (!repoRow) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const parsed = CreateIssueBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: z.treeifyError(parsed.error),
      });
    }

    try {
      // Create on GitHub first
      const ghIssue = await createIssueForRepo(repositoryId, parsed.data);

      // Write-through: insert into local DB immediately
      const now = new Date().toISOString();
      await execute(
        conn,
        `INSERT INTO issues (repository_id, number, title, body, state, html_url, author_login, author_avatar_url, author_html_url, labels, github_created_at, github_updated_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          repositoryId,
          ghIssue.number,
          ghIssue.title,
          ghIssue.body,
          ghIssue.state,
          ghIssue.html_url,
          ghIssue.user?.login ?? null,
          ghIssue.user?.avatar_url ?? null,
          ghIssue.user?.html_url ?? null,
          JSON.stringify(ghIssue.labels),
          new Date(ghIssue.created_at).toISOString(),
          new Date(ghIssue.updated_at).toISOString(),
          now,
          now,
        ],
      );

      return { data: ghIssue };
    } catch (error) {
      log.error({ err: error }, "Failed to create issue");
      return reply.status(500).send({
        error: "Failed to create issue on GitHub",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Create job from an issue
  // POST /api/repositories/:id/issues/:issueNumber/job
  fastify.post<{ Params: { id: string; issueNumber: string } }>(
    "/:id/issues/:issueNumber/job",
    async (request, reply) => {
      const { id: repositoryId, issueNumber: issueNumberStr } = request.params;
      const issueNumber = Number.parseInt(issueNumberStr, 10);

      if (Number.isNaN(issueNumber) || issueNumber <= 0) {
        return reply.status(400).send({ error: "Invalid issue number" });
      }

      const conn = await getDb();

      // Check repository exists
      const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);

      if (!repoRow) {
        return reply.status(404).send({ error: "Repository not found" });
      }

      // Check if job already exists
      const { exists, jobId } = await jobExistsForIssue(repositoryId, issueNumber);
      if (exists) {
        return reply.status(409).send({
          error: "Job already exists for this issue",
          jobId,
        });
      }

      // Try local DB first, fall back to GitHub API
      let issue: GitHubIssue | null = null;

      const localIssue = await queryOne<DbIssue>(
        conn,
        "SELECT * FROM issues WHERE repository_id = ? AND number = ? LIMIT 1",
        [repositoryId, issueNumber],
      );

      if (localIssue) {
        const mapped = mapIssue(localIssue);
        issue = {
          number: mapped.number,
          title: mapped.title,
          body: mapped.body,
          html_url: mapped.htmlUrl,
          state: mapped.state,
          labels: (mapped.labels ?? []) as GitHubIssue["labels"],
          created_at: mapped.githubCreatedAt?.toISOString() ?? mapped.createdAt.toISOString(),
          updated_at: mapped.githubUpdatedAt?.toISOString() ?? mapped.updatedAt.toISOString(),
          closed_at: mapped.closedAt?.toISOString() ?? null,
          user: mapped.authorLogin
            ? {
                login: mapped.authorLogin,
                avatar_url: mapped.authorAvatarUrl ?? "",
                html_url: mapped.authorHtmlUrl ?? "",
              }
            : null,
        };
      } else {
        // Fall back to GitHub
        issue = await getIssueByNumber(repositoryId, issueNumber);
      }

      if (!issue) {
        return reply.status(404).send({
          error: "Issue not found",
        });
      }

      // Create the job
      const { id: newJobId } = await createJobFromIssue(repositoryId, issue);

      return {
        success: true,
        jobId: newJobId,
        message: `Job created for issue #${issueNumber}`,
      };
    },
  );

  // Get comments for an issue (reads from local DB)
  // GET /api/repositories/:id/issues/:issueNumber/comments
  fastify.get<{ Params: { id: string; issueNumber: string } }>(
    "/:id/issues/:issueNumber/comments",
    async (request, reply) => {
      const { id: repositoryId, issueNumber: issueNumberStr } = request.params;
      const issueNumber = Number.parseInt(issueNumberStr, 10);

      if (Number.isNaN(issueNumber) || issueNumber <= 0) {
        return reply.status(400).send({ error: "Invalid issue number" });
      }

      const conn = await getDb();

      // Check repository exists
      const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);

      if (!repoRow) {
        return reply.status(404).send({ error: "Repository not found" });
      }

      // Check if we have local comments for this issue
      const localComments = await queryAll<DbIssueComment>(
        conn,
        "SELECT * FROM issue_comments WHERE repository_id = ? AND issue_number = ? ORDER BY github_created_at",
        [repositoryId, issueNumber],
      );

      // If no local comments, try syncing them on-demand
      if (localComments.length === 0) {
        try {
          await syncCommentsForIssue(repositoryId, issueNumber);

          const freshComments = await queryAll<DbIssueComment>(
            conn,
            "SELECT * FROM issue_comments WHERE repository_id = ? AND issue_number = ? ORDER BY github_created_at",
            [repositoryId, issueNumber],
          );

          return { data: freshComments.map(mapLocalCommentToResponse) };
        } catch (error) {
          log.error({ err: error }, "Failed to sync comments");
          return { data: [] };
        }
      }

      return { data: localComments.map(mapLocalCommentToResponse) };
    },
  );

  // Create a comment on an issue (write-through: GitHub first, then local DB)
  // POST /api/repositories/:id/issues/:issueNumber/comments
  fastify.post<{ Params: { id: string; issueNumber: string }; Body: unknown }>(
    "/:id/issues/:issueNumber/comments",
    async (request, reply) => {
      const { id: repositoryId, issueNumber: issueNumberStr } = request.params;
      const issueNumber = Number.parseInt(issueNumberStr, 10);

      if (Number.isNaN(issueNumber) || issueNumber <= 0) {
        return reply.status(400).send({ error: "Invalid issue number" });
      }

      const conn = await getDb();

      // Check repository exists
      const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);

      if (!repoRow) {
        return reply.status(404).send({ error: "Repository not found" });
      }

      const parsed = CreateCommentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: z.treeifyError(parsed.error),
        });
      }

      try {
        // Create on GitHub first
        const ghComment = await createIssueCommentForRepo(repositoryId, issueNumber, parsed.data.body);

        // Write-through: insert into local DB immediately
        const now = new Date().toISOString();
        await execute(
          conn,
          `INSERT INTO issue_comments (repository_id, issue_number, github_comment_id, body, html_url, github_created_at, github_updated_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [repositoryId, issueNumber, ghComment.id, parsed.data.body, ghComment.html_url, now, now, now, now],
        );

        return { data: ghComment };
      } catch (error) {
        log.error({ err: error }, "Failed to create comment");
        return reply.status(500).send({
          error: "Failed to create comment on GitHub",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Manual sync trigger for a repository's issues
  // POST /api/repositories/:id/issues/sync
  fastify.post<{ Params: { id: string } }>("/:id/issues/sync", async (request, reply) => {
    const repositoryId = request.params.id;
    const conn = await getDb();

    // Check repository exists
    const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);

    if (!repoRow) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    try {
      const { synced, comments } = await syncIssuesForRepo(repositoryId);

      broadcast({
        type: "issue:synced",
        payload: {
          repositoryId,
          issues: synced,
          comments,
        },
      });

      return {
        success: true,
        synced,
        comments,
        message: `Synced ${synced} issues and ${comments} comments`,
      };
    } catch (error) {
      log.error({ err: error }, "Manual sync failed");
      return reply.status(500).send({
        error: "Failed to sync issues from GitHub",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
