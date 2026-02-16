import { runClaude } from "@devkit/claude-runner";
import type { SessionRunner } from "@devkit/session";
import { buildEditContentPrompt } from "@/lib/claude/prompts/edit-content";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";

// Phase-to-data-type mapping
const PHASE_DATA_TYPES: Record<number, string> = {
  2: "project analysis and routes",
  3: "demo outline and user flows",
  4: "mock data plan",
  5: "demo scripts and voiceover",
};

async function loadPhaseData(phase: number): Promise<Record<string, unknown>> {
  const conn = await getDb();
  switch (phase) {
    case 2: {
      const summary = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT name, framework, auth, database_info, directories FROM project_summary LIMIT 1",
      );
      const routes = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT path, title, auth_required, description FROM routes ORDER BY id",
      );
      return { summary: summary[0] || {}, routes };
    }
    case 3: {
      const routes = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT path, title, auth_required, description FROM routes ORDER BY id",
      );
      const flows = await queryAll<Record<string, unknown>>(conn, "SELECT id, name, steps FROM user_flows ORDER BY id");
      return { routes, flows };
    }
    case 4: {
      const entities = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT name, count, note FROM mock_data_entities ORDER BY id",
      );
      const authOverrides = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT id, label, enabled FROM auth_overrides ORDER BY id",
      );
      const envItems = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT id, label, enabled FROM env_items ORDER BY id",
      );
      return { entities, authOverrides, envItems };
    }
    case 5: {
      const flowScripts = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT flow_id, flow_name FROM flow_scripts ORDER BY id",
      );
      const scriptSteps = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT id, flow_id, step_number, url, action, expected_outcome, duration FROM script_steps ORDER BY flow_id, step_number",
      );
      const voiceovers = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT flow_id, paragraph_index, text FROM voiceover_scripts ORDER BY flow_id, paragraph_index",
      );
      const timelineMarkers = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT flow_id, timestamp, label, paragraph_index FROM timeline_markers ORDER BY id",
      );
      return { flowScripts, scriptSteps, voiceovers, timelineMarkers };
    }
    default:
      throw new Error(`Unsupported phase for editing: ${phase}`);
  }
}

async function savePhaseData(phase: number, data: Record<string, unknown>): Promise<void> {
  const conn = await getDb();
  switch (phase) {
    case 2: {
      // Update project summary
      const s = data.summary as Record<string, string> | undefined;
      if (s) {
        await execute(conn, "DELETE FROM project_summary");
        const dirs = Array.isArray(data.directories) ? data.directories : [];
        await execute(
          conn,
          `INSERT INTO project_summary (id, name, framework, directories, auth, database_info)
          VALUES (1, ?, ?, ?, ?, ?)`,
          [s.name || "", s.framework || "", dirs, s.auth || "", s.database_info || ""],
        );
      }
      // Update routes
      const routes = data.routes as Array<Record<string, unknown>> | undefined;
      if (routes && Array.isArray(routes)) {
        await execute(conn, "DELETE FROM routes");
        for (let i = 0; i < routes.length; i++) {
          const r = routes[i];
          await execute(
            conn,
            `INSERT INTO routes (id, path, title, auth_required, description)
            VALUES (?, ?, ?, ?, ?)`,
            [i + 1, String(r.path || ""), String(r.title || ""), !!r.auth_required, String(r.description || "")],
          );
        }
      }
      break;
    }
    case 3: {
      // Update routes
      const routes = data.routes as Array<Record<string, unknown>> | undefined;
      if (routes && Array.isArray(routes)) {
        await execute(conn, "DELETE FROM routes");
        for (let i = 0; i < routes.length; i++) {
          const r = routes[i];
          await execute(
            conn,
            `INSERT INTO routes (id, path, title, auth_required, description)
            VALUES (?, ?, ?, ?, ?)`,
            [i + 1, String(r.path || ""), String(r.title || ""), !!r.auth_required, String(r.description || "")],
          );
        }
      }
      // Update user flows
      const flows = data.flows as Array<Record<string, unknown>> | undefined;
      if (flows && Array.isArray(flows)) {
        await execute(conn, "DELETE FROM user_flows");
        for (const flow of flows) {
          const steps = Array.isArray(flow.steps) ? flow.steps : [];
          await execute(
            conn,
            `INSERT INTO user_flows (id, name, steps)
            VALUES (?, ?, ?)`,
            [String(flow.id || ""), String(flow.name || ""), steps],
          );
        }
      }
      break;
    }
    case 4: {
      // Update entities
      const entities = data.entities as Array<Record<string, unknown>> | undefined;
      if (entities && Array.isArray(entities)) {
        await execute(conn, "DELETE FROM mock_data_entities");
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          await execute(
            conn,
            `INSERT INTO mock_data_entities (id, name, count, note)
            VALUES (?, ?, ?, ?)`,
            [i + 1, String(e.name || ""), Number(e.count) || 5, String(e.note || "")],
          );
        }
      }
      // Update auth overrides
      const authOverrides = data.authOverrides as Array<Record<string, unknown>> | undefined;
      if (authOverrides && Array.isArray(authOverrides)) {
        await execute(conn, "DELETE FROM auth_overrides");
        for (const ao of authOverrides) {
          await execute(
            conn,
            `INSERT INTO auth_overrides (id, label, enabled)
            VALUES (?, ?, ?)`,
            [String(ao.id || ""), String(ao.label || ""), ao.enabled !== false],
          );
        }
      }
      // Update env items
      const envItems = data.envItems as Array<Record<string, unknown>> | undefined;
      if (envItems && Array.isArray(envItems)) {
        await execute(conn, "DELETE FROM env_items");
        for (const ei of envItems) {
          await execute(
            conn,
            `INSERT INTO env_items (id, label, enabled)
            VALUES (?, ?, ?)`,
            [String(ei.id || ""), String(ei.label || ""), ei.enabled !== false],
          );
        }
      }
      break;
    }
    case 5: {
      // Update flow scripts and steps
      const flowScripts = data.flowScripts as Array<Record<string, unknown>> | undefined;
      if (flowScripts && Array.isArray(flowScripts)) {
        await execute(conn, "DELETE FROM flow_scripts");
        for (let i = 0; i < flowScripts.length; i++) {
          const s = flowScripts[i];
          await execute(
            conn,
            `INSERT INTO flow_scripts (id, flow_id, flow_name)
            VALUES (?, ?, ?)`,
            [i + 1, String(s.flow_id || ""), String(s.flow_name || "")],
          );
        }
      }
      const scriptSteps = data.scriptSteps as Array<Record<string, unknown>> | undefined;
      if (scriptSteps && Array.isArray(scriptSteps)) {
        await execute(conn, "DELETE FROM script_steps");
        for (const step of scriptSteps) {
          await execute(
            conn,
            `INSERT INTO script_steps (id, flow_id, step_number, url, action, expected_outcome, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              String(step.id || ""),
              String(step.flow_id || ""),
              Number(step.step_number) || 0,
              String(step.url || ""),
              String(step.action || ""),
              String(step.expected_outcome || ""),
              String(step.duration || "3s"),
            ],
          );
        }
      }
      // Update voiceovers
      const voiceovers = data.voiceovers as Array<Record<string, unknown>> | undefined;
      if (voiceovers && Array.isArray(voiceovers)) {
        await execute(conn, "DELETE FROM voiceover_scripts");
        for (const v of voiceovers) {
          await execute(
            conn,
            `INSERT INTO voiceover_scripts (flow_id, paragraph_index, text)
            VALUES (?, ?, ?)`,
            [String(v.flow_id || ""), Number(v.paragraph_index) || 0, String(v.text || "")],
          );
        }
      }
      // Update timeline markers
      const timelineMarkers = data.timelineMarkers as Array<Record<string, unknown>> | undefined;
      if (timelineMarkers && Array.isArray(timelineMarkers)) {
        await execute(conn, "DELETE FROM timeline_markers");
        for (let i = 0; i < timelineMarkers.length; i++) {
          const m = timelineMarkers[i];
          await execute(
            conn,
            `INSERT INTO timeline_markers (id, flow_id, timestamp, label, paragraph_index)
            VALUES (?, ?, ?, ?, ?)`,
            [
              i + 1,
              String(m.flow_id || ""),
              String(m.timestamp || "0:00"),
              String(m.label || ""),
              Number(m.paragraph_index) || 0,
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

export function createEditContentRunner(phase: number, editRequest: string): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading current data...", progress: 10 });

    const dataType = PHASE_DATA_TYPES[phase];
    if (!dataType) {
      throw new Error(`No editable data for phase ${phase}`);
    }

    const currentData = await loadPhaseData(phase);

    // Get project path for cwd
    const conn = await getDb();
    const summaryRow = await queryOne<{ project_path: string }>(
      conn,
      "SELECT project_path FROM project_summary LIMIT 1",
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

    await savePhaseData(phase, updatedData);

    onProgress({ type: "progress", message: "Edit complete", progress: 100 });

    return { result: updatedData };
  };
}
