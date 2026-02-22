import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@claudekit/session";
import { buildEditContentPrompt } from "@/lib/claude/prompts/edit-content";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";

// Phase-to-data-type mapping
const PHASE_DATA_TYPES: Record<number, string> = {
  2: "project analysis and routes",
  3: "demo outline and user flows",
  4: "mock data plan",
  5: "demo scripts and voiceover",
};

async function loadPhaseData(phase: number, runId?: string): Promise<Record<string, unknown>> {
  const conn = await getDb();
  switch (phase) {
    case 2: {
      const runIdClause = runId ? " WHERE run_id = ?" : "";
      const runIdParams = runId ? [runId] : [];
      const summary = await queryAll<Record<string, unknown>>(
        conn,
        `SELECT name, framework, auth, database_info, directories FROM project_summary${runIdClause} LIMIT 1`,
        runIdParams,
      );

      const routesRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'routes'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'routes' LIMIT 1",
          );

      const routes = routesRow ? JSON.parse(routesRow.data_json) : [];
      return { summary: summary[0] || {}, routes };
    }
    case 3: {
      const routesRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'routes'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'routes' LIMIT 1",
          );

      const flowsRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'user_flows'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'user_flows' LIMIT 1",
          );

      const routes = routesRow ? JSON.parse(routesRow.data_json) : [];
      const flows = flowsRow ? JSON.parse(flowsRow.data_json) : [];
      return { routes, flows };
    }
    case 4: {
      const entitiesRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'mock_data_entities'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'mock_data_entities' LIMIT 1",
          );

      const authRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'auth_overrides'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'auth_overrides' LIMIT 1",
          );

      const envRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'env_items'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'env_items' LIMIT 1",
          );

      const entities = entitiesRow ? JSON.parse(entitiesRow.data_json) : [];
      const authOverrides = authRow ? JSON.parse(authRow.data_json) : [];
      const envItems = envRow ? JSON.parse(envRow.data_json) : [];
      return { entities, authOverrides, envItems };
    }
    case 5: {
      const flowScripts = await queryAll<{
        flow_id: string;
        flow_name: string;
        steps_json: string;
      }>(
        conn,
        runId
          ? "SELECT flow_id, flow_name, steps_json FROM flow_scripts WHERE run_id = ?"
          : "SELECT flow_id, flow_name, steps_json FROM flow_scripts",
        runId ? [runId] : [],
      );

      const voiceovers = await queryAll<{
        flow_id: string;
        paragraphs_json: string;
        markers_json: string;
      }>(
        conn,
        runId
          ? "SELECT flow_id, paragraphs_json, markers_json FROM flow_voiceover WHERE run_id = ?"
          : "SELECT flow_id, paragraphs_json, markers_json FROM flow_voiceover",
        runId ? [runId] : [],
      );

      return {
        flowScripts: flowScripts.map((f) => ({
          flow_id: f.flow_id,
          flow_name: f.flow_name,
          steps: JSON.parse(f.steps_json),
        })),
        voiceovers: voiceovers.map((v) => ({
          flow_id: v.flow_id,
          paragraphs: JSON.parse(v.paragraphs_json),
          markers: JSON.parse(v.markers_json),
        })),
      };
    }
    default:
      throw new Error(`Unsupported phase for editing: ${phase}`);
  }
}

async function savePhaseData(phase: number, data: Record<string, unknown>, runId?: string): Promise<void> {
  const conn = await getDb();
  switch (phase) {
    case 2: {
      // Update project summary
      const s = data.summary as Record<string, string> | undefined;
      if (s) {
        await execute(conn, "DELETE FROM project_summary WHERE run_id = ?", [runId]);
        const dirs = Array.isArray(data.directories) ? data.directories : [];
        await execute(
          conn,
          `INSERT INTO project_summary (id, run_id, name, framework, directories, auth, database_info)
          VALUES (1, ?, ?, ?, ?::VARCHAR[], ?, ?)`,
          [runId, s.name || "", s.framework || "", JSON.stringify(dirs), s.auth || "", s.database_info || ""],
        );
      }
      // Update routes in run_content
      const routes = data.routes as Array<Record<string, unknown>> | undefined;
      if (routes && Array.isArray(routes)) {
        await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'routes'", [runId]);
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'routes', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(routes)],
        );
      }
      break;
    }
    case 3: {
      // Update routes in run_content
      const routes = data.routes as Array<Record<string, unknown>> | undefined;
      if (routes && Array.isArray(routes)) {
        await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'routes'", [runId]);
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'routes', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(routes)],
        );
      }
      // Update user flows in run_content
      const flows = data.flows as Array<Record<string, unknown>> | undefined;
      if (flows && Array.isArray(flows)) {
        await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'user_flows'", [runId]);
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'user_flows', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(flows)],
        );
      }
      break;
    }
    case 4: {
      // Update entities in run_content
      const entities = data.entities as Array<Record<string, unknown>> | undefined;
      if (entities && Array.isArray(entities)) {
        await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'mock_data_entities'", [
          runId,
        ]);
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'mock_data_entities', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(entities)],
        );
      }
      // Update auth overrides in run_content
      const authOverrides = data.authOverrides as Array<Record<string, unknown>> | undefined;
      if (authOverrides && Array.isArray(authOverrides)) {
        await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'auth_overrides'", [runId]);
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'auth_overrides', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(authOverrides)],
        );
      }
      // Update env items in run_content
      const envItems = data.envItems as Array<Record<string, unknown>> | undefined;
      if (envItems && Array.isArray(envItems)) {
        await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'env_items'", [runId]);
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'env_items', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(envItems)],
        );
      }
      break;
    }
    case 5: {
      // Update flow scripts with embedded steps
      const flowScripts = data.flowScripts as
        | Array<{ flow_id: string; flow_name: string; steps: unknown[] }>
        | undefined;
      if (flowScripts && Array.isArray(flowScripts)) {
        await execute(conn, "DELETE FROM flow_scripts WHERE run_id = ?", [runId]);
        for (const s of flowScripts) {
          await execute(
            conn,
            `INSERT INTO flow_scripts (id, run_id, flow_id, flow_name, steps_json)
            VALUES (?, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              runId,
              String(s.flow_id || ""),
              String(s.flow_name || ""),
              JSON.stringify(s.steps || []),
            ],
          );
        }
      }
      // Update voiceovers in flow_voiceover
      const voiceovers = data.voiceovers as
        | Array<{ flow_id: string; paragraphs: unknown[]; markers: unknown[] }>
        | undefined;
      if (voiceovers && Array.isArray(voiceovers)) {
        await execute(conn, "DELETE FROM flow_voiceover WHERE run_id = ?", [runId]);
        for (const v of voiceovers) {
          await execute(
            conn,
            `INSERT INTO flow_voiceover (id, run_id, flow_id, paragraphs_json, markers_json)
            VALUES (?, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              runId,
              String(v.flow_id || ""),
              JSON.stringify(v.paragraphs || []),
              JSON.stringify(v.markers || []),
            ],
          );
        }
      }
      break;
    }
    default:
      throw new Error(`Unsupported phase for saving: ${phase}`);
  }
}

export function createEditContentRunner(phase: number, editRequest: string, runId?: string): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading current data...", progress: 10 });

    const dataType = PHASE_DATA_TYPES[phase];
    if (!dataType) {
      throw new Error(`No editable data for phase ${phase}`);
    }

    const currentData = await loadPhaseData(phase, runId);

    // Get project path for cwd
    const conn = await getDb();
    const summaryRow = await queryOne<{ project_path: string }>(
      conn,
      runId
        ? "SELECT project_path FROM project_summary WHERE run_id = ? LIMIT 1"
        : "SELECT project_path FROM project_summary LIMIT 1",
      runId ? [runId] : [],
    );
    const cwd = summaryRow?.project_path || process.cwd();

    onProgress({ type: "progress", message: `Editing ${dataType}...`, progress: 30 });

    const prompt = buildEditContentPrompt(editRequest, currentData, dataType);

    const claudeStart = Date.now();
    const estimateProgress = () => Math.min(75, 30 + 45 * (1 - Math.exp(-(Date.now() - claudeStart) / 60_000)));

    const result = await runClaude({
      cwd,
      prompt,
      allowedTools: "",
      disallowedTools: "Write,Edit,Bash,Read,Glob,Grep,LS",
      onProgress: (info) => {
        onProgress({
          type: "log",
          message: info.message,
          progress: Math.round(estimateProgress()),
          log: info.log,
          logType: info.logType,
          chunk: info.chunk,
        });
      },
      signal,
    });

    onProgress({ type: "progress", message: "Parsing edited content...", progress: 80 });

    // Parse the JSON result
    // biome-ignore lint/suspicious/noExplicitAny: dynamic JSON from Claude response
    let updatedData: Record<string, any>;
    try {
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude output");
      updatedData = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Failed to parse edit result: ${err instanceof Error ? err.message : String(err)}`);
    }

    onProgress({ type: "progress", message: "Saving updated data...", progress: 90 });

    await savePhaseData(phase, updatedData, runId);

    onProgress({ type: "progress", message: "Edit complete", progress: 100 });

    return { result: updatedData };
  };
}
