import { realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { buildInClause, execute, queryAll, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import { type DbJob, type DbRepository, mapJob, mapRepositoryFull } from "../db/schema.js";
import {
  type GitConfig,
  getChangedFiles,
  getFileDiff,
  getRepoDir,
  listWorktrees,
  removeWorktree,
} from "../services/git.js";
import { getOctokitForRepo, getRepoConfigById } from "../services/github/index.js";
import {
  getWorkspaceSettings,
  toGitConfig,
  toGitConfigFromRepo,
  validateWorkspaceSettings,
} from "../services/settings-helper.js";
import { broadcast } from "../ws/handler.js";

interface CleanupRequestBody {
  dryRun?: boolean;
  jobIds?: string[];
  includeStatuses?: string[];
}

interface CleanupResult {
  cleaned: Array<{ jobId: string; worktreePath: string }>;
  errors: Array<{ jobId: string; error: string }>;
  skipped: Array<{ jobId: string; reason: string }>;
}

export const worktreesRouter: FastifyPluginAsync = async (fastify) => {
  // List worktrees with job status - supports multi-repo
  fastify.get("/", async (_request, _reply) => {
    const conn = getConn();

    // Get all active repositories
    const activeRepoRows = await queryAll<DbRepository>(conn, "SELECT * FROM repositories WHERE is_active = true");
    const activeRepos = activeRepoRows.map(mapRepositoryFull);

    // Get all jobs with worktree paths and their repository info
    const { clause: inClause, params: inParams } = buildInClause("status", [
      "running",
      "ready_to_pr",
      "pr_opened",
      "pr_reviewing",
      "paused",
      "needs_info",
      "done",
      "failed",
    ]);

    const jobRows = await queryAll<DbJob>(conn, `SELECT * FROM jobs WHERE ${inClause}`, inParams);
    const jobsWithWorktrees = jobRows.map(mapJob);

    // Create a map of worktree path to job
    const worktreeToJob = new Map<string, (typeof jobsWithWorktrees)[0]>();
    for (const job of jobsWithWorktrees) {
      if (job.worktreePath) {
        worktreeToJob.set(job.worktreePath, job);
      }
    }

    // Create a map of repository ID to repository info
    const repoMap = new Map<string, { id: string; owner: string; name: string; displayName: string | null }>();
    for (const repo of activeRepos) {
      repoMap.set(repo.id, {
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        displayName: repo.displayName,
      });
    }

    // Collect worktrees from all active repositories
    const allWorktrees: Array<{
      path: string;
      branch: string;
      commit: string;
      job: {
        id: string;
        issueNumber: number;
        issueTitle: string;
        status: string;
        prNumber: number | null;
        prUrl: string | null;
        updatedAt: string | null;
      } | null;
      repository: {
        id: string;
        owner: string;
        name: string;
        displayName: string | null;
      } | null;
    }> = [];

    for (const repo of activeRepos) {
      try {
        const gitConfig = toGitConfigFromRepo(repo);
        const worktrees = await listWorktrees(gitConfig);

        for (const wt of worktrees) {
          const job = worktreeToJob.get(wt.path);
          allWorktrees.push({
            path: wt.path,
            branch: wt.branch,
            commit: wt.commit,
            job: job
              ? {
                  id: job.id,
                  issueNumber: job.issueNumber,
                  issueTitle: job.issueTitle,
                  status: job.status,
                  prNumber: job.prNumber,
                  prUrl: job.prUrl,
                  updatedAt: job.updatedAt?.toISOString() ?? null,
                }
              : null,
            repository: repoMap.get(repo.id) ?? null,
          });
        }
      } catch (error) {
        // Repository may not have a base clone yet - log for debugging
        fastify.log.debug(
          { error, repoId: repo.id, repoName: `${repo.owner}/${repo.name}` },
          "Failed to list worktrees for repository",
        );
      }
    }

    // Fallback: if no active repos, try legacy workspace settings
    if (activeRepos.length === 0) {
      const validation = await validateWorkspaceSettings();
      if (validation.valid) {
        const workspaceSettings = await getWorkspaceSettings();
        if (workspaceSettings) {
          try {
            const gitConfig = toGitConfig(workspaceSettings);
            const worktrees = await listWorktrees(gitConfig);

            for (const wt of worktrees) {
              const job = worktreeToJob.get(wt.path);
              allWorktrees.push({
                path: wt.path,
                branch: wt.branch,
                commit: wt.commit,
                job: job
                  ? {
                      id: job.id,
                      issueNumber: job.issueNumber,
                      issueTitle: job.issueTitle,
                      status: job.status,
                      prNumber: job.prNumber,
                      prUrl: job.prUrl,
                      updatedAt: job.updatedAt?.toISOString() ?? null,
                    }
                  : null,
                repository: null, // Legacy mode has no repository record
              });
            }
          } catch (error) {
            // Legacy settings may not have a base clone yet - log for debugging
            fastify.log.debug({ error }, "Failed to list worktrees for legacy workspace settings");
          }
        }
      }
    }

    return { data: allWorktrees };
  });

  // Get PR merge status for a specific job
  fastify.get<{ Params: { jobId: string } }>("/:jobId/pr-status", async (request, reply) => {
    const { jobId } = request.params;
    const conn = getConn();

    // Look up job by ID
    const jobRow = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    if (!jobRow) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const job = mapJob(jobRow);

    // If no PR number, return not merged
    if (!job.prNumber) {
      return {
        merged: false,
        prNumber: null,
        prUrl: null,
      };
    }

    // If we have a repository ID, check PR merge status via GitHub API
    if (job.repositoryId) {
      try {
        const octokit = await getOctokitForRepo(job.repositoryId);
        const config = await getRepoConfigById(job.repositoryId);

        const { data: pr } = await octokit.rest.pulls.get({
          owner: config.owner,
          repo: config.name,
          pull_number: job.prNumber,
        });

        return {
          merged: pr.merged,
          prNumber: job.prNumber,
          prUrl: job.prUrl,
        };
      } catch (error: unknown) {
        const err = error as Error;
        return reply.status(500).send({
          error: "Failed to check PR status",
          details: err.message,
        });
      }
    }

    // No repository ID, return unknown merge status
    return {
      merged: false,
      prNumber: job.prNumber,
      prUrl: job.prUrl,
    };
  });

  // Get changed files in a worktree
  fastify.get<{ Params: { jobId: string } }>("/:jobId/changes", async (request, reply) => {
    const { jobId } = request.params;
    const conn = getConn();

    // Look up job by ID
    const jobRow = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    if (!jobRow) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const job = mapJob(jobRow);

    if (!job.worktreePath) {
      return reply.status(400).send({ error: "Job has no worktree", files: [] });
    }

    // Get git config for this job's repository
    let gitConfig: GitConfig;
    let baseBranch = "main";

    if (job.repositoryId) {
      const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [job.repositoryId]);

      if (!repoRow) {
        return reply.status(400).send({ error: "Repository not found" });
      }

      const repo = mapRepositoryFull(repoRow);
      gitConfig = toGitConfigFromRepo(repo);
      baseBranch = repo.baseBranch || "main";
    } else {
      // Legacy: use workspace settings
      const validation = await validateWorkspaceSettings();
      if (!validation.valid) {
        return reply.status(400).send({ error: "Workspace settings invalid" });
      }

      const workspaceSettings = await getWorkspaceSettings();
      if (!workspaceSettings) {
        return reply.status(500).send({ error: "Failed to load workspace settings" });
      }

      gitConfig = toGitConfig(workspaceSettings);
      // Legacy workspace settings don't have baseBranch, use default
    }

    try {
      const files = await getChangedFiles(gitConfig, job.worktreePath, baseBranch);
      return { files, baseBranch };
    } catch (error: unknown) {
      const err = error as Error;
      return reply.status(500).send({
        error: "Failed to get changed files",
        details: err.message,
      });
    }
  });

  // Get diff for a specific file
  fastify.get<{ Params: { jobId: string }; Querystring: { path: string } }>("/:jobId/diff", async (request, reply) => {
    const { jobId } = request.params;
    const { path: filePath } = request.query;

    if (!filePath) {
      return reply.status(400).send({ error: "File path is required" });
    }

    const conn = getConn();

    // Look up job by ID
    const jobRow = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    if (!jobRow) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const job = mapJob(jobRow);

    if (!job.worktreePath) {
      return reply.status(400).send({ error: "Job has no worktree" });
    }

    // Get git config for this job's repository
    let gitConfig: GitConfig;
    let baseBranch = "main";

    if (job.repositoryId) {
      const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [job.repositoryId]);

      if (!repoRow) {
        return reply.status(400).send({ error: "Repository not found" });
      }

      const repo = mapRepositoryFull(repoRow);
      gitConfig = toGitConfigFromRepo(repo);
      baseBranch = repo.baseBranch || "main";
    } else {
      // Legacy: use workspace settings
      const validation = await validateWorkspaceSettings();
      if (!validation.valid) {
        return reply.status(400).send({ error: "Workspace settings invalid" });
      }

      const workspaceSettings = await getWorkspaceSettings();
      if (!workspaceSettings) {
        return reply.status(500).send({ error: "Failed to load workspace settings" });
      }

      gitConfig = toGitConfig(workspaceSettings);
      // Legacy workspace settings don't have baseBranch, use default
    }

    try {
      const diff = await getFileDiff(gitConfig, job.worktreePath, baseBranch, filePath);
      return { diff, filePath, baseBranch };
    } catch (error: unknown) {
      const err = error as Error;
      return reply.status(500).send({
        error: "Failed to get file diff",
        details: err.message,
      });
    }
  });

  // Get changed files by worktree path (for orphaned worktrees)
  fastify.get<{ Querystring: { worktreePath: string } }>("/by-path/changes", async (request, reply) => {
    const { worktreePath } = request.query;

    if (!worktreePath) {
      return reply.status(400).send({ error: "worktreePath is required" });
    }

    const conn = getConn();

    // Find which repository this worktree belongs to by checking the path
    const activeRepoRows = await queryAll<DbRepository>(conn, "SELECT * FROM repositories WHERE is_active = true");
    const activeRepos = activeRepoRows.map(mapRepositoryFull);

    let gitConfig: GitConfig | null = null;
    let baseBranch = "main";

    // Resolve symlinks in the worktree path (e.g., /tmp -> /private/tmp on macOS)
    let resolvedWorktreePath: string;
    try {
      resolvedWorktreePath = await realpath(worktreePath);
    } catch {
      resolvedWorktreePath = resolve(worktreePath);
    }

    for (const repo of activeRepos) {
      const repoDir = getRepoDir(toGitConfigFromRepo(repo));
      // Resolve symlinks in repo dir too
      let resolvedRepoDir: string;
      try {
        resolvedRepoDir = await realpath(repoDir);
      } catch {
        resolvedRepoDir = resolve(repoDir);
      }
      if (resolvedWorktreePath.startsWith(resolvedRepoDir)) {
        gitConfig = toGitConfigFromRepo(repo);
        baseBranch = repo.baseBranch || "main";
        break;
      }
    }

    if (!gitConfig) {
      // Try legacy workspace settings
      const validation = await validateWorkspaceSettings();
      if (validation.valid) {
        const workspaceSettings = await getWorkspaceSettings();
        if (workspaceSettings) {
          const repoDir = getRepoDir(toGitConfig(workspaceSettings));
          let resolvedRepoDir: string;
          try {
            resolvedRepoDir = await realpath(repoDir);
          } catch {
            resolvedRepoDir = resolve(repoDir);
          }
          if (resolvedWorktreePath.startsWith(resolvedRepoDir)) {
            gitConfig = toGitConfig(workspaceSettings);
          }
        }
      }
    }

    if (!gitConfig) {
      return reply.status(400).send({
        error: "Could not find repository for this worktree path",
      });
    }

    try {
      const files = await getChangedFiles(gitConfig, worktreePath, baseBranch);
      return { files, baseBranch };
    } catch (error: unknown) {
      const err = error as Error;
      return reply.status(500).send({
        error: "Failed to get changed files",
        details: err.message,
      });
    }
  });

  // Get diff by worktree path (for orphaned worktrees)
  fastify.get<{ Querystring: { worktreePath: string; path: string } }>("/by-path/diff", async (request, reply) => {
    const { worktreePath, path: filePath } = request.query;

    if (!worktreePath) {
      return reply.status(400).send({ error: "worktreePath is required" });
    }
    if (!filePath) {
      return reply.status(400).send({ error: "path is required" });
    }

    const conn = getConn();

    // Find which repository this worktree belongs to
    const activeRepoRows = await queryAll<DbRepository>(conn, "SELECT * FROM repositories WHERE is_active = true");
    const activeRepos = activeRepoRows.map(mapRepositoryFull);

    let gitConfig: GitConfig | null = null;
    let baseBranch = "main";

    // Resolve symlinks in the worktree path (e.g., /tmp -> /private/tmp on macOS)
    let resolvedWorktreePath: string;
    try {
      resolvedWorktreePath = await realpath(worktreePath);
    } catch {
      resolvedWorktreePath = resolve(worktreePath);
    }

    for (const repo of activeRepos) {
      const repoDir = getRepoDir(toGitConfigFromRepo(repo));
      let resolvedRepoDir: string;
      try {
        resolvedRepoDir = await realpath(repoDir);
      } catch {
        resolvedRepoDir = resolve(repoDir);
      }
      if (resolvedWorktreePath.startsWith(resolvedRepoDir)) {
        gitConfig = toGitConfigFromRepo(repo);
        baseBranch = repo.baseBranch || "main";
        break;
      }
    }

    if (!gitConfig) {
      // Try legacy workspace settings
      const validation = await validateWorkspaceSettings();
      if (validation.valid) {
        const workspaceSettings = await getWorkspaceSettings();
        if (workspaceSettings) {
          const repoDir = getRepoDir(toGitConfig(workspaceSettings));
          let resolvedRepoDir: string;
          try {
            resolvedRepoDir = await realpath(repoDir);
          } catch {
            resolvedRepoDir = resolve(repoDir);
          }
          if (resolvedWorktreePath.startsWith(resolvedRepoDir)) {
            gitConfig = toGitConfig(workspaceSettings);
          }
        }
      }
    }

    if (!gitConfig) {
      return reply.status(400).send({
        error: "Could not find repository for this worktree path",
      });
    }

    try {
      const diff = await getFileDiff(gitConfig, worktreePath, baseBranch, filePath);
      return { diff, filePath, baseBranch };
    } catch (error: unknown) {
      const err = error as Error;
      return reply.status(500).send({
        error: "Failed to get file diff",
        details: err.message,
      });
    }
  });

  // Cleanup a single job's worktree with full cleanup (worktree + jobs dir)
  fastify.post<{ Params: { jobId: string } }>("/:jobId/cleanup", async (request, reply) => {
    const { jobId } = request.params;
    const conn = getConn();

    // Look up job by ID
    const jobRow = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    if (!jobRow) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const job = mapJob(jobRow);

    // Validate job status
    if (!["done", "failed"].includes(job.status)) {
      return reply.status(400).send({
        error: "Cannot cleanup job",
        details: `Job status must be 'done' or 'failed', but is '${job.status}'`,
      });
    }

    // If PR exists, verify it's merged
    if (job.prNumber && job.repositoryId) {
      try {
        const octokit = await getOctokitForRepo(job.repositoryId);
        const config = await getRepoConfigById(job.repositoryId);

        const { data: pr } = await octokit.rest.pulls.get({
          owner: config.owner,
          repo: config.name,
          pull_number: job.prNumber,
        });

        if (!pr.merged) {
          return reply.status(400).send({
            error: "Cannot cleanup job",
            details: "PR exists but is not merged. Merge or close the PR first.",
          });
        }
      } catch (error: unknown) {
        const err = error as Error;
        return reply.status(500).send({
          error: "Failed to check PR status",
          details: err.message,
        });
      }
    }

    // Validate worktree path
    if (!job.worktreePath) {
      return reply.status(400).send({
        error: "Cannot cleanup job",
        details: "Job has no worktree path",
      });
    }

    // Get git config for this job's repository
    let gitConfig: GitConfig;
    if (job.repositoryId) {
      // Multi-repo: get config from repository record
      const repoRow = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [job.repositoryId]);

      if (!repoRow) {
        return reply.status(400).send({
          error: "Cannot cleanup job",
          details: "Job's repository not found",
        });
      }

      gitConfig = toGitConfigFromRepo(mapRepositoryFull(repoRow));
    } else {
      // Legacy: use workspace settings
      const validation = await validateWorkspaceSettings();
      if (!validation.valid) {
        return reply.status(400).send({
          error: "Workspace settings invalid",
          details: validation.errors,
        });
      }

      const workspaceSettings = await getWorkspaceSettings();
      if (!workspaceSettings) {
        return reply.status(500).send({ error: "Failed to load workspace settings" });
      }

      gitConfig = toGitConfig(workspaceSettings);
    }

    // Path traversal check - validate against repo directory, not just workdir
    const repoDir = getRepoDir(gitConfig);
    const normalizedRepoDir = resolve(repoDir);
    const normalizedWorktreePath = resolve(job.worktreePath);
    if (!normalizedWorktreePath.startsWith(normalizedRepoDir)) {
      return reply.status(400).send({
        error: "Invalid worktree path",
        details: "Worktree path is outside of repository directory",
      });
    }

    // Construct jobs dir path (repoDir/jobs/issue-<number>)
    const jobsDir = join(repoDir, "jobs", `issue-${job.issueNumber}`);
    const normalizedJobsDir = resolve(jobsDir);
    if (!normalizedJobsDir.startsWith(normalizedRepoDir)) {
      return reply.status(400).send({
        error: "Invalid jobs directory path",
        details: "Jobs directory path is outside of repository directory",
      });
    }

    try {
      // Remove git worktree
      await removeWorktree(gitConfig, job.worktreePath);

      // Delete jobs/issue-<number> directory
      try {
        await rm(normalizedJobsDir, { recursive: true, force: true });
      } catch {
        // Directory may not exist or already deleted
      }

      // Update job: clear worktree path
      const now = new Date().toISOString();
      const updatedRow = await queryOne<DbJob>(
        conn,
        "UPDATE jobs SET worktree_path = NULL, updated_at = ? WHERE id = ? RETURNING *",
        [now, jobId],
      );

      // Insert job event for cleanup
      await execute(
        conn,
        `INSERT INTO job_events (job_id, event_type, message, metadata, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        [
          jobId,
          "user_action",
          "Worktree cleaned up by user",
          JSON.stringify({
            cleanedWorktreePath: job.worktreePath,
            cleanedJobsDir: normalizedJobsDir,
          }),
          now,
        ],
      );

      if (updatedRow) {
        const updated = mapJob(updatedRow);
        broadcast({ type: "job:updated", payload: updated });
      }

      return {
        success: true,
        cleaned: {
          worktreePath: job.worktreePath,
          jobsDir: normalizedJobsDir,
        },
      };
    } catch (error: unknown) {
      const err = error as Error;
      return reply.status(500).send({
        success: false,
        error: "Failed to cleanup worktree",
        details: err.message,
      });
    }
  });

  // Cleanup worktrees for completed/failed jobs
  // Per AGENTS.md: worktrees should NOT be auto-deleted before PR merge
  // This endpoint provides manual cleanup for users
  fastify.post<{ Body: CleanupRequestBody }>("/cleanup", async (request, reply) => {
    const { dryRun = false, jobIds, includeStatuses } = request.body ?? {};

    // Default: only "done" jobs. Can optionally include "failed".
    // Never allow cleanup of active jobs (running, needs_info, ready_to_pr, paused)
    const allowedStatuses = ["done", "failed"];
    const statusesToClean = includeStatuses ? includeStatuses.filter((s) => allowedStatuses.includes(s)) : ["done"]; // Default to only "done"

    if (statusesToClean.length === 0) {
      return reply.status(400).send({
        error: "No valid statuses provided. Allowed: done, failed",
      });
    }

    const conn = getConn();

    // Get jobs eligible for cleanup
    const { clause: inClause, params: inParams } = buildInClause("status", statusesToClean);
    let jobsToClean = (await queryAll<DbJob>(conn, `SELECT * FROM jobs WHERE ${inClause}`, inParams)).map(mapJob);

    // Filter by jobIds if provided
    if (jobIds && jobIds.length > 0) {
      jobsToClean = jobsToClean.filter((job) => jobIds.includes(job.id));
    }

    // Filter to only jobs with worktree paths
    jobsToClean = jobsToClean.filter((job) => job.worktreePath);

    // Group jobs by repository ID for efficient config loading
    const jobsByRepo = new Map<string | null, typeof jobsToClean>();
    for (const job of jobsToClean) {
      const repoId = job.repositoryId;
      if (!jobsByRepo.has(repoId)) {
        jobsByRepo.set(repoId, []);
      }
      jobsByRepo.get(repoId)?.push(job);
    }

    // Load repository configs
    const repoConfigs = new Map<string, GitConfig>();
    const repoIds = Array.from(jobsByRepo.keys()).filter((id): id is string => id !== null);
    if (repoIds.length > 0) {
      const { clause: repoInClause, params: repoInParams } = buildInClause("id", repoIds);
      const repoRows = await queryAll<DbRepository>(
        conn,
        `SELECT * FROM repositories WHERE ${repoInClause}`,
        repoInParams,
      );
      for (const row of repoRows) {
        const repo = mapRepositoryFull(row);
        repoConfigs.set(repo.id, toGitConfigFromRepo(repo));
      }
    }

    // Load legacy workspace settings if any jobs don't have a repository ID
    let legacyConfig: GitConfig | null = null;
    if (jobsByRepo.has(null)) {
      const validation = await validateWorkspaceSettings();
      if (validation.valid) {
        const workspaceSettings = await getWorkspaceSettings();
        if (workspaceSettings) {
          legacyConfig = toGitConfig(workspaceSettings);
        }
      }
    }

    const result: CleanupResult = {
      cleaned: [],
      errors: [],
      skipped: [],
    };

    for (const job of jobsToClean) {
      if (!job.worktreePath) {
        result.skipped.push({ jobId: job.id, reason: "No worktree path" });
        continue;
      }

      // Get the appropriate config for this job
      let gitConfig: GitConfig | null = null;
      if (job.repositoryId) {
        gitConfig = repoConfigs.get(job.repositoryId) ?? null;
      } else {
        gitConfig = legacyConfig;
      }

      if (!gitConfig) {
        result.skipped.push({
          jobId: job.id,
          reason: job.repositoryId ? "Repository config not found" : "Legacy workspace settings not configured",
        });
        continue;
      }

      // Validate path is within repo directory
      const repoDir = getRepoDir(gitConfig);
      const normalizedRepoDir = resolve(repoDir);
      const normalizedWorktreePath = resolve(job.worktreePath);
      if (!normalizedWorktreePath.startsWith(normalizedRepoDir)) {
        result.skipped.push({
          jobId: job.id,
          reason: "Worktree path is outside of repository directory",
        });
        continue;
      }

      if (dryRun) {
        result.cleaned.push({
          jobId: job.id,
          worktreePath: job.worktreePath,
        });
        continue;
      }

      try {
        await removeWorktree(gitConfig, job.worktreePath);

        // Clear worktree path in database
        const now = new Date().toISOString();
        const updatedRow = await queryOne<DbJob>(
          conn,
          "UPDATE jobs SET worktree_path = NULL, updated_at = ? WHERE id = ? RETURNING *",
          [now, job.id],
        );

        if (updatedRow) {
          const updated = mapJob(updatedRow);
          broadcast({ type: "job:updated", payload: updated });
        }

        result.cleaned.push({
          jobId: job.id,
          worktreePath: job.worktreePath,
        });
      } catch (error: unknown) {
        const err = error as Error;
        result.errors.push({ jobId: job.id, error: err.message });
      }
    }

    return {
      data: result,
      dryRun,
    };
  });
};
