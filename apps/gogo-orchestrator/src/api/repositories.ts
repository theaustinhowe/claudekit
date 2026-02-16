import { buildUpdate, execute, queryAll, queryOne } from "@devkit/duckdb";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { type DbJob, type DbRepository, mapJob, mapRepositoryFull } from "../db/schema.js";
import { getOctokitForRepo } from "../services/github/index.js";
import { createServiceLogger } from "../utils/logger.js";
import { TIMEOUTS, withTimeout } from "../utils/timeout.js";

const log = createServiceLogger("repositories-api");

// Validation schemas
const CreateRepositorySchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().optional(),
  githubToken: z.string().min(1),
  baseBranch: z.string().default("main"),
  triggerLabel: z.string().default("agent"),
  workdirPath: z.string().min(1),
  isActive: z.boolean().default(true),
  autoCreateJobs: z.boolean().default(true),
  autoStartJobs: z.boolean().default(true),
  autoCreatePr: z.boolean().default(true),
  removeLabelAfterCreate: z.boolean().default(false),
});

const UpdateRepositorySchema = z.object({
  displayName: z.string().optional(),
  githubToken: z.string().min(1).optional(),
  baseBranch: z.string().optional(),
  triggerLabel: z.string().optional(),
  workdirPath: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  autoCreateJobs: z.boolean().optional(),
  autoStartJobs: z.boolean().optional(),
  autoCreatePr: z.boolean().optional(),
  removeLabelAfterCreate: z.boolean().optional(),
});

// Per-repo settings schema (v2 multi-repo support)
const RepoSettingsSchema = z.object({
  pollIntervalMs: z.number().int().min(5000).max(300000).optional(),
  testCommand: z.string().optional().nullable(),
  agentProvider: z.enum(["claude-code", "mock"]).optional(),
  triggerLabel: z.string().min(1).optional(),
  branchPattern: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  autoCleanup: z.boolean().optional(),
  autoStartJobs: z.boolean().optional(),
  autoCreatePr: z.boolean().optional(),
});

// Query params for listing jobs
const RepoJobsQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// DELETE query params schema
const DeleteRepoQuerySchema = z.object({
  confirm: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional()
    .default(false),
});

/** Map camelCase field names from Zod schemas to snake_case DB column names */
function toSnakeCaseFields(data: Record<string, unknown>): Record<string, unknown> {
  const mapping: Record<string, string> = {
    displayName: "display_name",
    githubToken: "github_token",
    baseBranch: "base_branch",
    triggerLabel: "trigger_label",
    workdirPath: "workdir_path",
    isActive: "is_active",
    autoCreateJobs: "auto_create_jobs",
    autoStartJobs: "auto_start_jobs",
    autoCreatePr: "auto_create_pr",
    removeLabelAfterCreate: "remove_label_after_create",
    pollIntervalMs: "poll_interval_ms",
    testCommand: "test_command",
    agentProvider: "agent_provider",
    branchPattern: "branch_pattern",
    autoCleanup: "auto_cleanup",
  };

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const snakeKey = mapping[key] ?? key;
    result[snakeKey] = value;
  }
  return result;
}

export const repositoriesRouter: FastifyPluginAsync = async (fastify) => {
  // List all repositories
  fastify.get("/", async () => {
    const conn = await getDb();
    const repos = await queryAll<DbRepository>(conn, "SELECT * FROM repositories ORDER BY updated_at");

    // Mask tokens in response
    const maskedRepos = repos.map((row) => {
      const mapped = mapRepositoryFull(row);
      return {
        ...mapped,
        githubToken: mapped.githubToken ? "***" : null,
      };
    });

    return { data: maskedRepos };
  });

  // Get single repository
  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const conn = await getDb();
    const row = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [request.params.id]);

    if (!row) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const mapped = mapRepositoryFull(row);
    return {
      data: {
        ...mapped,
        githubToken: mapped.githubToken ? "***" : null,
      },
    };
  });

  // Create repository
  fastify.post<{ Body: unknown }>("/", async (request, reply) => {
    const parsed = CreateRepositorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: z.treeifyError(parsed.error),
      });
    }

    const conn = await getDb();
    const now = new Date().toISOString();
    const d = parsed.data;

    const newRepo = await queryOne<DbRepository>(
      conn,
      `INSERT INTO repositories (owner, name, display_name, github_token, base_branch, trigger_label, workdir_path, is_active, auto_create_jobs, auto_start_jobs, auto_create_pr, remove_label_after_create, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        d.owner,
        d.name,
        d.displayName ?? null,
        d.githubToken,
        d.baseBranch,
        d.triggerLabel,
        d.workdirPath,
        d.isActive,
        d.autoCreateJobs,
        d.autoStartJobs,
        d.autoCreatePr,
        d.removeLabelAfterCreate,
        now,
        now,
      ],
    );

    if (!newRepo) {
      return reply.status(500).send({ error: "Failed to create repository" });
    }

    const mapped = mapRepositoryFull(newRepo);
    return {
      data: {
        ...mapped,
        githubToken: "***",
      },
    };
  });

  // Update repository
  fastify.patch<{ Params: { id: string }; Body: unknown }>("/:id", async (request, reply) => {
    const parsed = UpdateRepositorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: z.treeifyError(parsed.error),
      });
    }

    const conn = await getDb();

    // Check repository exists
    const existing = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [request.params.id]);

    if (!existing) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const snakeData = toSnakeCaseFields(parsed.data);
    const update = buildUpdate("repositories", request.params.id, snakeData);

    if (!update) {
      return reply.status(400).send({ error: "No valid fields to update" });
    }

    const updated = await queryOne<DbRepository>(conn, `${update.sql} RETURNING *`, update.params);

    if (!updated) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const mapped = mapRepositoryFull(updated);
    return {
      data: {
        ...mapped,
        githubToken: "***",
      },
    };
  });

  // Delete repository
  fastify.delete<{
    Params: { id: string };
    Querystring: Record<string, string>;
  }>("/:id", async (request, reply) => {
    // Validate query params
    const queryParsed = DeleteRepoQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: z.treeifyError(queryParsed.error),
      });
    }
    const { confirm } = queryParsed.data;

    const conn = await getDb();

    // Check repository exists
    const existing = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [request.params.id]);

    if (!existing) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    // Count associated jobs by status
    const jobCounts = await queryAll<{ status: string; count: bigint }>(
      conn,
      "SELECT status, COUNT(*) as count FROM jobs WHERE repository_id = ? GROUP BY status",
      [request.params.id],
    );

    const jobsByStatus: Record<string, number> = {};
    let totalJobs = 0;
    let runningJobs = 0;

    for (const row of jobCounts) {
      const cnt = Number(row.count);
      jobsByStatus[row.status] = cnt;
      totalJobs += cnt;
      if (row.status === "running") {
        runningJobs = cnt;
      }
    }

    // Block deletion if there are running jobs (active agent processes)
    if (runningJobs > 0) {
      return reply.status(409).send({
        error: "Cannot delete repository with running jobs",
        details: { runningJobs },
      });
    }

    // Warn if there are associated jobs and confirm not provided
    if (totalJobs > 0 && !confirm) {
      return reply.status(409).send({
        error: "Repository has associated jobs",
        warning: {
          totalJobs,
          jobsByStatus,
          message: "Add ?confirm=true to delete anyway. Jobs will be orphaned (repositoryId set to null).",
        },
      });
    }

    // Orphan associated jobs if any exist
    let orphanedJobs = 0;
    if (totalJobs > 0) {
      await execute(conn, "UPDATE jobs SET repository_id = NULL WHERE repository_id = ?", [request.params.id]);
      orphanedJobs = totalJobs;
    }

    // Delete the repository
    await execute(conn, "DELETE FROM repositories WHERE id = ?", [request.params.id]);

    return { success: true, orphanedJobs };
  });

  // Get active repositories (for polling)
  fastify.get("/active", async () => {
    const conn = await getDb();
    const repos = await queryAll<DbRepository>(conn, "SELECT * FROM repositories WHERE is_active = true");

    // Mask tokens
    const maskedRepos = repos.map((row) => {
      const mapped = mapRepositoryFull(row);
      return {
        ...mapped,
        githubToken: mapped.githubToken ? "***" : null,
      };
    });

    return { data: maskedRepos };
  });

  // Get jobs for a specific repository
  fastify.get<{ Params: { id: string }; Querystring: Record<string, string> }>("/:id/jobs", async (request, reply) => {
    const conn = await getDb();

    // Check repository exists
    const repo = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [request.params.id]);

    if (!repo) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const parsed = RepoJobsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: z.treeifyError(parsed.error),
      });
    }

    const { status, limit, offset } = parsed.data;

    // Build where conditions
    const whereParts: string[] = ["repository_id = ?"];
    const whereParams: unknown[] = [request.params.id];
    if (status) {
      whereParts.push("status = ?");
      whereParams.push(status);
    }
    const whereClause = whereParts.join(" AND ");

    // Get total count
    const countRow = await queryOne<{ total: bigint }>(
      conn,
      `SELECT COUNT(*) as total FROM jobs WHERE ${whereClause}`,
      whereParams,
    );

    // Get paginated results
    const rows = await queryAll<DbJob>(
      conn,
      `SELECT * FROM jobs WHERE ${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...whereParams, limit, offset],
    );

    return {
      data: rows.map(mapJob),
      pagination: {
        total: Number(countRow?.total ?? 0),
        limit,
        offset,
      },
    };
  });

  // Get per-repo settings
  fastify.get<{ Params: { id: string } }>("/:id/settings", async (request, reply) => {
    const conn = await getDb();
    const row = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [request.params.id]);

    if (!row) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const full = mapRepositoryFull(row);
    return {
      data: {
        pollIntervalMs: full.pollIntervalMs,
        testCommand: full.testCommand,
        agentProvider: full.agentProvider,
        triggerLabel: full.triggerLabel,
        branchPattern: full.branchPattern,
        baseBranch: full.baseBranch,
        autoCleanup: full.autoCleanup,
        autoStartJobs: full.autoStartJobs,
        autoCreatePr: full.autoCreatePr,
      },
    };
  });

  // Update per-repo settings
  fastify.patch<{ Params: { id: string }; Body: unknown }>("/:id/settings", async (request, reply) => {
    const parsed = RepoSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: z.treeifyError(parsed.error),
      });
    }

    const conn = await getDb();

    // Check repository exists
    const existing = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [request.params.id]);

    if (!existing) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const snakeData = toSnakeCaseFields(parsed.data);
    const update = buildUpdate("repositories", request.params.id, snakeData);

    if (!update) {
      return reply.status(400).send({ error: "No valid fields to update" });
    }

    const updated = await queryOne<DbRepository>(conn, `${update.sql} RETURNING *`, update.params);

    if (!updated) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const full = mapRepositoryFull(updated);
    return {
      data: {
        pollIntervalMs: full.pollIntervalMs,
        testCommand: full.testCommand,
        agentProvider: full.agentProvider,
        triggerLabel: full.triggerLabel,
        branchPattern: full.branchPattern,
        baseBranch: full.baseBranch,
        autoCleanup: full.autoCleanup,
        autoStartJobs: full.autoStartJobs,
        autoCreatePr: full.autoCreatePr,
      },
    };
  });

  // Get branches for a repository from GitHub
  fastify.get<{ Params: { id: string } }>("/:id/branches", async (request, reply) => {
    const conn = await getDb();
    const row = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [request.params.id]);

    if (!row) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    const repo = mapRepositoryFull(row);

    try {
      const octokit = await getOctokitForRepo(request.params.id);

      const response = await withTimeout(
        octokit.rest.repos.listBranches({
          owner: repo.owner,
          repo: repo.name,
          per_page: 100,
        }),
        TIMEOUTS.GITHUB_API,
        "listBranches",
      );

      // Get the default branch info
      const repoInfoResponse = await withTimeout(
        octokit.rest.repos.get({
          owner: repo.owner,
          repo: repo.name,
        }),
        TIMEOUTS.GITHUB_API,
        "getRepo",
      );

      const defaultBranch = repoInfoResponse.data.default_branch;

      const branches = response.data.map((branch) => ({
        name: branch.name,
        isDefault: branch.name === defaultBranch,
        protected: branch.protected,
      }));

      // Sort to put default branch first
      branches.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });

      return { data: branches, defaultBranch };
    } catch (error) {
      log.error({ err: error, owner: repo.owner, repo: repo.name }, "Failed to fetch branches");
      return reply.status(500).send({
        error: "Failed to fetch branches from GitHub",
      });
    }
  });
};
