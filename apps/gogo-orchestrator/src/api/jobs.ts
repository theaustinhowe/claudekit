import type { FastifyPluginAsync } from "fastify";
import {
  buildInClause,
  buildUpdate,
  execute,
  queryAll,
  queryOne,
} from "../db/helpers.js";
import { getConn } from "../db/index.js";
import {
  type DbJob,
  type DbJobEvent,
  type DbJobLog,
  type DbSetting,
  mapJob,
  mapJobEvent,
  mapJobLog,
  mapSetting,
} from "../db/schema.js";
import {
  CreateJobSchema,
  CreateManualJobSchema,
  EventsQuerySchema,
  JobActionSchema,
  JobsQuerySchema,
  LogsQuerySchema,
} from "../schemas/index.js";
import { resumeAgent, startAgent } from "../services/agent-executor.js";
import {
  isRunning as isJobRunning,
  startJobRun,
  stopJobRun,
} from "../services/agent-runner.js";
import {
  injectMessage,
  isRunning as isClaudeRunning,
  pauseClaudeRun,
  resumeClaudeRun,
  startClaudeRun,
  stopClaudeRun,
} from "../services/claude-code-agent.js";
import {
  isRunning as isMockRunning,
  startMockRun,
  stopMockRun,
} from "../services/mock-agent.js";
import {
  checkJobForResponseById,
  enterNeedsInfo,
} from "../services/needs-info.js";
import { processReadyToPr } from "../services/pr-flow.js";
import { applyActionAtomic } from "../services/state-machine.js";
import { broadcast } from "../ws/handler.js";

export const jobsRouter: FastifyPluginAsync = async (fastify) => {
  // List all jobs with pagination and filtering
  fastify.get<{ Querystring: Record<string, string> }>(
    "/",
    async (request, reply) => {
      const parsed = JobsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: parsed.error.format(),
        });
      }

      const { status, repositoryId, limit, offset } = parsed.data;
      const conn = getConn();

      // Build where conditions
      const whereParts: string[] = [];
      const whereParams: unknown[] = [];
      if (status) {
        whereParts.push("status = ?");
        whereParams.push(status);
      }
      if (repositoryId) {
        whereParts.push("repository_id = ?");
        whereParams.push(repositoryId);
      }
      const whereClause =
        whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

      // Get total count
      const countRow = await queryOne<{ total: bigint }>(
        conn,
        `SELECT COUNT(*) as total FROM jobs ${whereClause}`,
        whereParams,
      );

      // Get paginated results
      const rows = await queryAll<DbJob>(
        conn,
        `SELECT * FROM jobs ${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
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
    },
  );

  // Get stale jobs (unchanged for more than 1 hour in running/needs_info states)
  fastify.get<{ Querystring: { thresholdMinutes?: string } }>(
    "/stale",
    async (request, _reply) => {
      const thresholdMinutes = Number(request.query.thresholdMinutes) || 60;
      const staleThreshold = new Date(
        Date.now() - thresholdMinutes * 60 * 1000,
      );
      const conn = getConn();

      const { clause: inClause, params: inParams } = buildInClause("status", [
        "running",
        "needs_info",
      ]);

      const staleJobs = await queryAll<DbJob>(
        conn,
        `SELECT * FROM jobs WHERE ${inClause} AND updated_at < ? ORDER BY updated_at`,
        [...inParams, staleThreshold.toISOString()],
      );

      return {
        data: staleJobs.map(mapJob),
        thresholdMinutes,
        count: staleJobs.length,
      };
    },
  );

  // Get single job
  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const conn = getConn();
    const row = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [
      request.params.id,
    ]);
    if (!row) {
      return reply.status(404).send({ error: "Job not found" });
    }
    return { data: mapJob(row) };
  });

  // Create job (manual trigger)
  fastify.post<{ Body: unknown }>("/", async (request, reply) => {
    const parsed = CreateJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const conn = getConn();
    const now = new Date().toISOString();

    const newJob = await queryOne<DbJob>(
      conn,
      `INSERT INTO jobs (issue_number, issue_title, issue_url, issue_body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        parsed.data.issueNumber,
        parsed.data.issueTitle,
        parsed.data.issueUrl,
        parsed.data.issueBody ?? null,
        now,
        now,
      ],
    );

    if (!newJob) {
      return reply.status(500).send({ error: "Failed to create job" });
    }

    const mapped = mapJob(newJob);

    // Create job creation event
    await execute(
      conn,
      `INSERT INTO job_events (job_id, event_type, from_status, to_status, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mapped.id, "state_change", null, "queued", "Job created", now],
    );

    // Broadcast job created
    broadcast({ type: "job:created", payload: mapped });

    return { data: mapped };
  });

  // Create manual job (no GitHub issue)
  fastify.post<{ Body: unknown }>("/manual", async (request, reply) => {
    const parsed = CreateManualJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const { repositoryId, title, description } = parsed.data;
    const conn = getConn();

    // Verify repository exists and is active
    const repo = await queryOne<{ id: string; is_active: boolean }>(
      conn,
      "SELECT id, is_active FROM repositories WHERE id = ?",
      [repositoryId],
    );
    if (!repo) {
      return reply.status(404).send({ error: "Repository not found" });
    }
    if (!repo.is_active) {
      return reply.status(400).send({ error: "Repository is not active" });
    }

    // Generate synthetic negative issue number using atomic counter in settings
    const counterKey = "manual_job_counter";
    const existing = await queryOne<DbSetting>(
      conn,
      "SELECT * FROM settings WHERE key = ?",
      [counterKey],
    );

    const now = new Date().toISOString();
    let nextNumber: number;
    if (existing) {
      const mapped = mapSetting(existing);
      nextNumber = (mapped.value as number) - 1;
      await execute(
        conn,
        "UPDATE settings SET value = ?, updated_at = ? WHERE key = ?",
        [JSON.stringify(nextNumber), now, counterKey],
      );
    } else {
      nextNumber = -1;
      await execute(
        conn,
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
        [counterKey, JSON.stringify(nextNumber), now],
      );
    }

    const newJob = await queryOne<DbJob>(
      conn,
      `INSERT INTO jobs (repository_id, issue_number, issue_title, issue_url, issue_body, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        repositoryId,
        nextNumber,
        title,
        "",
        description ?? null,
        "manual",
        now,
        now,
      ],
    );

    if (!newJob) {
      return reply.status(500).send({ error: "Failed to create job" });
    }

    const mapped = mapJob(newJob);

    // Create job creation event
    await execute(
      conn,
      `INSERT INTO job_events (job_id, event_type, from_status, to_status, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mapped.id, "state_change", null, "queued", "Manual job created", now],
    );

    // Broadcast job created
    broadcast({ type: "job:created", payload: mapped });

    return { data: mapped };
  });

  // Perform job action (pause/resume/cancel/inject/request_info)
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    "/:id/actions",
    async (request, reply) => {
      const parsed = JobActionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid action", details: parsed.error.format() });
      }

      const action = parsed.data;
      const conn = getConn();

      // Get current job
      const jobRow = await queryOne<DbJob>(
        conn,
        "SELECT * FROM jobs WHERE id = ?",
        [request.params.id],
      );
      if (!jobRow) {
        return reply.status(404).send({ error: "Job not found" });
      }
      const job = mapJob(jobRow);

      // Handle request_info specially - it uses enterNeedsInfo which handles GitHub posting
      if (action.type === "request_info") {
        if (job.status !== "running") {
          return reply
            .status(400)
            .send({ error: "Can only request info from a running job" });
        }

        try {
          await enterNeedsInfo(request.params.id, action.payload.question);
          // Fetch the updated job to return
          const updatedRow = await queryOne<DbJob>(
            conn,
            "SELECT * FROM jobs WHERE id = ?",
            [request.params.id],
          );
          return { data: updatedRow ? mapJob(updatedRow) : null };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to post question to GitHub";
          return reply.status(500).send({ error: message });
        }
      }

      // Handle side effects BEFORE atomic state transition
      // For pause/cancel, stop running processes first
      if (action.type === "pause" || action.type === "cancel") {
        if (isMockRunning(job.id)) {
          stopMockRun(job.id);
        }
        if (isJobRunning(job.id)) {
          stopJobRun(job.id);
        }
        if (isClaudeRunning(job.id)) {
          await pauseClaudeRun(job.id);
        }
      }

      // Handle force_stop - immediate termination without session save
      if (action.type === "force_stop") {
        let stopFailed = false;
        let stopError = "";

        try {
          // Stop all possible running processes
          if (isMockRunning(job.id)) {
            stopMockRun(job.id);
          }
          if (isJobRunning(job.id)) {
            stopJobRun(job.id);
          }
          if (isClaudeRunning(job.id)) {
            // Use stopClaudeRun without session save (force stop = no resume)
            await stopClaudeRun(job.id, false);
          }
        } catch (error) {
          stopFailed = true;
          stopError = error instanceof Error ? error.message : "Unknown error";
        }

        // If stop failed, use atomic transition to failed state
        if (stopFailed) {
          const failResult = await applyActionAtomic(
            request.params.id,
            "cancel",
            { reason: `Force stop failed: ${stopError}` },
          );
          if (!failResult.success) {
            return reply.status(500).send({ error: failResult.error });
          }
          // Fetch the updated job to return
          const failedRow = await queryOne<DbJob>(
            conn,
            "SELECT * FROM jobs WHERE id = ?",
            [request.params.id],
          );
          return { data: failedRow ? mapJob(failedRow) : null };
        }
      }

      // Handle inject action with mode support (before atomic call since it's a side effect)
      if (action.type === "inject" && "payload" in action) {
        const mode = action.payload.mode || "immediate";
        const injectResult = await injectMessage(
          job.id,
          action.payload.message,
          mode,
        );
        if (!injectResult.success) {
          return reply.status(400).send({ error: injectResult.error });
        }
      }

      // Apply the action atomically using state machine
      const result = await applyActionAtomic(
        request.params.id,
        action.type,
        "payload" in action ? action.payload : undefined,
      );

      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      return { data: result.job };
    },
  );

  // Get job events (audit trail)
  fastify.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    "/:id/events",
    async (request, reply) => {
      const parsed = EventsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: parsed.error.format(),
        });
      }

      const { limit, offset, after } = parsed.data;
      const conn = getConn();

      // Check job exists
      const jobExists = await queryOne<{ id: string }>(
        conn,
        "SELECT id FROM jobs WHERE id = ?",
        [request.params.id],
      );
      if (!jobExists) {
        return reply.status(404).send({ error: "Job not found" });
      }

      // Build where clause
      const whereParts: string[] = ["job_id = ?"];
      const whereParams: unknown[] = [request.params.id];
      if (after) {
        whereParts.push("created_at > ?");
        whereParams.push(new Date(after).toISOString());
      }

      const events = await queryAll<DbJobEvent>(
        conn,
        `SELECT * FROM job_events WHERE ${whereParts.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...whereParams, limit, offset],
      );

      return { data: events.map(mapJobEvent) };
    },
  );

  // Get job logs
  fastify.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    "/:id/logs",
    async (request, reply) => {
      const parsed = LogsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: parsed.error.format(),
        });
      }

      const { limit, afterSequence, stream } = parsed.data;
      const conn = getConn();

      // Check job exists
      const jobExists = await queryOne<{ id: string }>(
        conn,
        "SELECT id FROM jobs WHERE id = ?",
        [request.params.id],
      );
      if (!jobExists) {
        return reply.status(404).send({ error: "Job not found" });
      }

      // Build where clause
      const whereParts: string[] = ["job_id = ?", "sequence > ?"];
      const whereParams: unknown[] = [request.params.id, afterSequence];
      if (stream) {
        whereParts.push("stream = ?");
        whereParams.push(stream);
      }

      const logs = await queryAll<DbJobLog>(
        conn,
        `SELECT * FROM job_logs WHERE ${whereParts.join(" AND ")} ORDER BY sequence LIMIT ?`,
        [...whereParams, limit],
      );

      return { data: logs.map(mapJobLog) };
    },
  );

  // Start real job run with git worktree
  fastify.post<{ Params: { id: string } }>(
    "/:id/start",
    async (request, reply) => {
      const result = await startJobRun(request.params.id);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      return { success: true, message: "Job run started" };
    },
  );

  // Trigger mock agent run (development only)
  fastify.post<{ Params: { id: string } }>(
    "/:id/mock-run",
    async (request, reply) => {
      // Check if in development mode
      if (process.env.NODE_ENV === "production") {
        return reply
          .status(403)
          .send({ error: "Mock runs are not available in production" });
      }

      const result = await startMockRun(request.params.id);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      return { success: true, message: "Mock run started" };
    },
  );

  // Start Claude Code agent run
  fastify.post<{ Params: { id: string } }>(
    "/:id/start-claude",
    async (request, reply) => {
      const result = await startClaudeRun(request.params.id);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      return { success: true, message: "Claude Code run started" };
    },
  );

  // Resume Claude Code run (for paused jobs)
  fastify.post<{ Params: { id: string }; Body: { message?: string } }>(
    "/:id/resume-claude",
    async (request, reply) => {
      const message = request.body?.message;
      const result = await resumeClaudeRun(request.params.id, message);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      return { success: true, message: "Claude Code run resumed" };
    },
  );

  // Start agent with optional type selection
  fastify.post<{ Params: { id: string }; Body: { agentType?: string } }>(
    "/:id/start-agent",
    async (request, reply) => {
      const result = await startAgent(
        request.params.id,
        request.body?.agentType,
      );
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      return { success: true, message: "Agent run started" };
    },
  );

  // Resume agent with optional message
  fastify.post<{
    Params: { id: string };
    Body: { message?: string; agentType?: string };
  }>("/:id/resume-agent", async (request, reply) => {
    const result = await resumeAgent(
      request.params.id,
      request.body?.message,
      request.body?.agentType,
    );
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }
    return { success: true, message: "Agent run resumed" };
  });

  // Create PR from ready_to_pr state
  fastify.post<{ Params: { id: string } }>(
    "/:id/create-pr",
    async (request, reply) => {
      const result = await processReadyToPr(request.params.id);

      if (!result.success) {
        // If it was a retry to running, that's not an error per se
        if (result.retriedToRunning) {
          return {
            success: false,
            message: result.error,
            retriedToRunning: true,
          };
        }
        return reply.status(400).send({ error: result.error });
      }

      return {
        success: true,
        prUrl: result.prUrl,
        prNumber: result.prNumber,
      };
    },
  );

  // Approve or reject a plan for a job in awaiting_plan_approval state
  fastify.post<{
    Params: { id: string };
    Body: { approved: boolean; message?: string };
  }>("/:id/approve-plan", async (request, reply) => {
    const { approved, message } = request.body ?? {};

    if (typeof approved !== "boolean") {
      return reply
        .status(400)
        .send({ error: "approved field (boolean) is required" });
    }

    const conn = getConn();
    const jobRow = await queryOne<DbJob>(
      conn,
      "SELECT * FROM jobs WHERE id = ?",
      [request.params.id],
    );

    if (!jobRow) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const job = mapJob(jobRow);

    if (job.status !== "awaiting_plan_approval") {
      return reply.status(400).send({
        error: `Job must be in 'awaiting_plan_approval' state (current: ${job.status})`,
      });
    }

    const action = approved ? "approve_plan" : "reject_plan";
    const result = await applyActionAtomic(
      request.params.id,
      action,
      { message: message || (approved ? "Plan approved" : "Plan rejected") },
      {
        initiator: "user",
        ...(message ? { feedback: message } : {}),
      },
    );

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return { data: result.job };
  });

  // Check for GitHub response on a needs_info job (manual trigger)
  fastify.post<{ Params: { id: string } }>(
    "/:id/check-response",
    async (request, reply) => {
      const conn = getConn();
      const jobRow = await queryOne<DbJob>(
        conn,
        "SELECT * FROM jobs WHERE id = ?",
        [request.params.id],
      );

      if (!jobRow) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const job = mapJob(jobRow);

      if (job.status !== "needs_info") {
        return reply
          .status(400)
          .send({ error: "Job is not in needs_info state" });
      }

      try {
        const result = await checkJobForResponseById(request.params.id);
        return {
          success: true,
          responseFound: result.responseFound,
          message: result.responseFound
            ? "Response found, job resumed"
            : "No new response found",
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to check for response";
        return reply.status(500).send({ error: message });
      }
    },
  );

  // Update job (legacy PATCH - keep for backwards compatibility)
  // SECURITY: Only allow explicit allowlisted fields - never spread raw request.body
  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; pauseReason?: string };
  }>("/:id", async (request, reply) => {
    const updateData: Record<string, unknown> = {};
    if (typeof request.body?.status === "string") {
      updateData.status = request.body.status;
    }
    if (typeof request.body?.pauseReason === "string") {
      updateData.pause_reason = request.body.pauseReason;
    }

    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({ error: "No valid fields to update" });
    }

    const conn = getConn();
    const update = buildUpdate("jobs", request.params.id, updateData);
    if (!update) {
      return reply.status(400).send({ error: "No valid fields to update" });
    }

    const updated = await queryOne<DbJob>(
      conn,
      `${update.sql} RETURNING *`,
      update.params,
    );

    if (!updated) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const mapped = mapJob(updated);

    // Broadcast update
    broadcast({ type: "job:updated", payload: mapped });

    return { data: mapped };
  });
};
