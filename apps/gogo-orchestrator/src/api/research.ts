import { execute, queryAll, queryOne } from "@devkit/duckdb";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getConn } from "../db/index.js";
import type { DbJob, DbResearchSession, DbResearchSuggestion, DbSetting } from "../db/schema.js";
import { mapJob, mapResearchSession, mapResearchSuggestion, mapSetting } from "../db/schema.js";
import { cancelResearchSession, getSessionSuggestions, startResearchSession } from "../services/research.js";

const StartResearchSchema = z.object({
  repositoryId: z.string().uuid(),
  focusAreas: z
    .array(z.enum(["ui", "ux", "security", "durability", "performance", "testing", "accessibility", "documentation"]))
    .min(1),
});

const ConvertSuggestionSchema = z.object({
  convertTo: z.enum(["github_issue", "manual_job"]),
});

export const researchRouter: FastifyPluginAsync = async (fastify) => {
  // GET / — list all sessions with suggestion counts
  fastify.get("/sessions", async () => {
    const conn = getConn();
    const rows = await queryAll<DbResearchSession>(conn, "SELECT * FROM research_sessions ORDER BY created_at DESC");

    const sessions = await Promise.all(
      rows.map(async (row) => {
        const countResult = await queryOne<{ count: bigint }>(
          conn,
          "SELECT COUNT(*) as count FROM research_suggestions WHERE session_id = ?",
          [row.id],
        );
        return {
          ...mapResearchSession(row),
          suggestionCount: Number(countResult?.count ?? 0),
        };
      }),
    );

    return { data: sessions };
  });

  // GET /:id — get session with suggestions
  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const conn = getConn();
    const row = await queryOne<DbResearchSession>(conn, "SELECT * FROM research_sessions WHERE id = ?", [
      request.params.id,
    ]);

    if (!row) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const suggestions = await getSessionSuggestions(row.id);

    return {
      data: {
        ...mapResearchSession(row),
        suggestions,
      },
    };
  });

  // POST / — start new research session
  fastify.post("/sessions", async (request, reply) => {
    const parsed = StartResearchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: z.treeifyError(parsed.error),
      });
    }

    try {
      const session = await startResearchSession(parsed.data.repositoryId, parsed.data.focusAreas);
      return { data: mapResearchSession(session) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(400).send({ error: message });
    }
  });

  // DELETE /:id — cancel running session
  fastify.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      await cancelResearchSession(request.params.id);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(400).send({ error: message });
    }
  });

  // GET /suggestions — list suggestions with optional filters
  fastify.get("/suggestions", async (request) => {
    const conn = getConn();
    const query = request.query as {
      sessionId?: string;
      category?: string;
      severity?: string;
    };

    let sql = "SELECT * FROM research_suggestions WHERE 1=1";
    const params: unknown[] = [];

    if (query.sessionId) {
      sql += " AND session_id = ?";
      params.push(query.sessionId);
    }
    if (query.category) {
      sql += " AND category = ?";
      params.push(query.category);
    }
    if (query.severity) {
      sql += " AND severity = ?";
      params.push(query.severity);
    }

    sql += " ORDER BY created_at DESC";

    const rows = await queryAll<DbResearchSuggestion>(conn, sql, params);
    return { data: rows.map(mapResearchSuggestion) };
  });

  // POST /:id/suggestions/:suggestionId/convert — convert suggestion to job or issue
  fastify.post<{
    Params: { id: string; suggestionId: string };
  }>("/:id/suggestions/:suggestionId/convert", async (request, reply) => {
    const parsed = ConvertSuggestionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: z.treeifyError(parsed.error),
      });
    }

    const conn = getConn();
    const suggestion = await queryOne<DbResearchSuggestion>(
      conn,
      "SELECT * FROM research_suggestions WHERE id = ? AND session_id = ?",
      [request.params.suggestionId, request.params.id],
    );

    if (!suggestion) {
      return reply.status(404).send({ error: "Suggestion not found" });
    }

    if (suggestion.converted_to) {
      return reply.status(400).send({ error: "Suggestion already converted" });
    }

    const { convertTo } = parsed.data;

    if (convertTo === "manual_job") {
      // Get session to find repository
      const session = await queryOne<DbResearchSession>(conn, "SELECT * FROM research_sessions WHERE id = ?", [
        request.params.id,
      ]);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      try {
        // Generate synthetic negative issue number using atomic counter
        const counterKey = "manual_job_counter";
        const existing = await queryOne<DbSetting>(conn, "SELECT * FROM settings WHERE key = ?", [counterKey]);

        const now = new Date().toISOString();
        let nextNumber: number;
        if (existing) {
          const mapped = mapSetting(existing);
          nextNumber = (mapped.value as number) - 1;
          await execute(conn, "UPDATE settings SET value = ?, updated_at = ? WHERE key = ?", [
            JSON.stringify(nextNumber),
            now,
            counterKey,
          ]);
        } else {
          nextNumber = -1;
          await execute(conn, "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)", [
            counterKey,
            JSON.stringify(nextNumber),
            now,
          ]);
        }

        const newJob = await queryOne<DbJob>(
          conn,
          `INSERT INTO jobs (repository_id, issue_number, issue_title, issue_url, issue_body, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
          [session.repository_id, nextNumber, suggestion.title, "", suggestion.description, "manual", now, now],
        );

        if (!newJob) {
          return reply.status(500).send({ error: "Failed to create job" });
        }

        // Mark suggestion as converted
        await execute(conn, "UPDATE research_suggestions SET converted_to = ?, converted_id = ? WHERE id = ?", [
          convertTo,
          newJob.id,
          request.params.suggestionId,
        ]);

        return {
          data: {
            convertedTo: convertTo,
            convertedId: newJob.id,
            job: mapJob(newJob),
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[research] Failed to convert suggestion to job:", message);
        return reply.status(500).send({ error: `Failed to create job: ${message}` });
      }
    }

    // For github_issue, just mark it — the frontend can handle the actual creation
    await execute(conn, "UPDATE research_suggestions SET converted_to = ? WHERE id = ?", [
      convertTo,
      request.params.suggestionId,
    ]);

    return {
      data: {
        convertedTo: convertTo,
        convertedId: null,
      },
    };
  });
};
