import { runClaude } from "@/lib/claude/claude-runner";
import { buildEditContentPrompt } from "@/lib/claude/prompts/edit-content";
import type { SessionRunner } from "@/lib/claude/types";
import { execute, query } from "@/lib/db";

// Phase-to-data-type mapping
const PHASE_DATA_TYPES: Record<number, string> = {
  2: "project analysis and routes",
  3: "demo outline and user flows",
  4: "mock data plan",
  5: "demo scripts and voiceover",
};

async function loadPhaseData(phase: number): Promise<Record<string, unknown>> {
  switch (phase) {
    case 2: {
      const summary = await query<Record<string, unknown>>(
        "SELECT name, framework, auth, database_info, directories FROM project_summary LIMIT 1",
      );
      const routes = await query<Record<string, unknown>>(
        "SELECT path, title, auth_required, description FROM routes ORDER BY id",
      );
      return { summary: summary[0] || {}, routes };
    }
    case 3: {
      const routes = await query<Record<string, unknown>>(
        "SELECT path, title, auth_required, description FROM routes ORDER BY id",
      );
      const flows = await query<Record<string, unknown>>("SELECT id, name, steps FROM user_flows ORDER BY id");
      return { routes, flows };
    }
    case 4: {
      const entities = await query<Record<string, unknown>>(
        "SELECT name, count, note FROM mock_data_entities ORDER BY id",
      );
      const authOverrides = await query<Record<string, unknown>>(
        "SELECT id, label, enabled FROM auth_overrides ORDER BY id",
      );
      const envItems = await query<Record<string, unknown>>("SELECT id, label, enabled FROM env_items ORDER BY id");
      return { entities, authOverrides, envItems };
    }
    case 5: {
      const flowScripts = await query<Record<string, unknown>>(
        "SELECT flow_id, flow_name FROM flow_scripts ORDER BY id",
      );
      const scriptSteps = await query<Record<string, unknown>>(
        "SELECT id, flow_id, step_number, url, action, expected_outcome, duration FROM script_steps ORDER BY flow_id, step_number",
      );
      const voiceovers = await query<Record<string, unknown>>(
        "SELECT flow_id, paragraph_index, text FROM voiceover_scripts ORDER BY flow_id, paragraph_index",
      );
      const timelineMarkers = await query<Record<string, unknown>>(
        "SELECT flow_id, timestamp, label, paragraph_index FROM timeline_markers ORDER BY id",
      );
      return { flowScripts, scriptSteps, voiceovers, timelineMarkers };
    }
    default:
      throw new Error(`Unsupported phase for editing: ${phase}`);
  }
}

async function savePhaseData(phase: number, data: Record<string, unknown>): Promise<void> {
  switch (phase) {
    case 2: {
      // Update project summary
      const s = data.summary as Record<string, string> | undefined;
      if (s) {
        await execute("DELETE FROM project_summary");
        const dirs = (Array.isArray(data.directories) ? data.directories : [])
          .map((d: string) => `'${d.replace(/'/g, "''")}'`)
          .join(", ");
        await execute(`
          INSERT INTO project_summary (id, name, framework, directories, auth, database_info)
          VALUES (1, '${(s.name || "").replace(/'/g, "''")}', '${(s.framework || "").replace(/'/g, "''")}',
            [${dirs}], '${(s.auth || "").replace(/'/g, "''")}', '${(s.database_info || "").replace(/'/g, "''")}')
        `);
      }
      // Update routes
      const routes = data.routes as Array<Record<string, unknown>> | undefined;
      if (routes && Array.isArray(routes)) {
        await execute("DELETE FROM routes");
        for (let i = 0; i < routes.length; i++) {
          const r = routes[i];
          await execute(`
            INSERT INTO routes (id, path, title, auth_required, description)
            VALUES (${i + 1}, '${String(r.path || "").replace(/'/g, "''")}', '${String(r.title || "").replace(/'/g, "''")}',
              ${!!r.auth_required}, '${String(r.description || "").replace(/'/g, "''")}')
          `);
        }
      }
      break;
    }
    case 3: {
      // Update routes
      const routes = data.routes as Array<Record<string, unknown>> | undefined;
      if (routes && Array.isArray(routes)) {
        await execute("DELETE FROM routes");
        for (let i = 0; i < routes.length; i++) {
          const r = routes[i];
          await execute(`
            INSERT INTO routes (id, path, title, auth_required, description)
            VALUES (${i + 1}, '${String(r.path || "").replace(/'/g, "''")}', '${String(r.title || "").replace(/'/g, "''")}',
              ${!!r.auth_required}, '${String(r.description || "").replace(/'/g, "''")}')
          `);
        }
      }
      // Update user flows
      const flows = data.flows as Array<Record<string, unknown>> | undefined;
      if (flows && Array.isArray(flows)) {
        await execute("DELETE FROM user_flows");
        for (const flow of flows) {
          const steps = (Array.isArray(flow.steps) ? flow.steps : [])
            .map((s: string) => `'${s.replace(/'/g, "''")}'`)
            .join(", ");
          await execute(`
            INSERT INTO user_flows (id, name, steps)
            VALUES ('${String(flow.id || "").replace(/'/g, "''")}', '${String(flow.name || "").replace(/'/g, "''")}', [${steps}])
          `);
        }
      }
      break;
    }
    case 4: {
      // Update entities
      const entities = data.entities as Array<Record<string, unknown>> | undefined;
      if (entities && Array.isArray(entities)) {
        await execute("DELETE FROM mock_data_entities");
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          await execute(`
            INSERT INTO mock_data_entities (id, name, count, note)
            VALUES (${i + 1}, '${String(e.name || "").replace(/'/g, "''")}', ${Number(e.count) || 5},
              '${String(e.note || "").replace(/'/g, "''")}')
          `);
        }
      }
      // Update auth overrides
      const authOverrides = data.authOverrides as Array<Record<string, unknown>> | undefined;
      if (authOverrides && Array.isArray(authOverrides)) {
        await execute("DELETE FROM auth_overrides");
        for (const ao of authOverrides) {
          await execute(`
            INSERT INTO auth_overrides (id, label, enabled)
            VALUES ('${String(ao.id || "").replace(/'/g, "''")}', '${String(ao.label || "").replace(/'/g, "''")}',
              ${ao.enabled !== false})
          `);
        }
      }
      // Update env items
      const envItems = data.envItems as Array<Record<string, unknown>> | undefined;
      if (envItems && Array.isArray(envItems)) {
        await execute("DELETE FROM env_items");
        for (const ei of envItems) {
          await execute(`
            INSERT INTO env_items (id, label, enabled)
            VALUES ('${String(ei.id || "").replace(/'/g, "''")}', '${String(ei.label || "").replace(/'/g, "''")}',
              ${ei.enabled !== false})
          `);
        }
      }
      break;
    }
    case 5: {
      // Update flow scripts and steps
      const flowScripts = data.flowScripts as Array<Record<string, unknown>> | undefined;
      if (flowScripts && Array.isArray(flowScripts)) {
        await execute("DELETE FROM flow_scripts");
        for (let i = 0; i < flowScripts.length; i++) {
          const s = flowScripts[i];
          await execute(`
            INSERT INTO flow_scripts (id, flow_id, flow_name)
            VALUES (${i + 1}, '${String(s.flow_id || "").replace(/'/g, "''")}', '${String(s.flow_name || "").replace(/'/g, "''")}')
          `);
        }
      }
      const scriptSteps = data.scriptSteps as Array<Record<string, unknown>> | undefined;
      if (scriptSteps && Array.isArray(scriptSteps)) {
        await execute("DELETE FROM script_steps");
        for (const step of scriptSteps) {
          await execute(`
            INSERT INTO script_steps (id, flow_id, step_number, url, action, expected_outcome, duration)
            VALUES ('${String(step.id || "").replace(/'/g, "''")}', '${String(step.flow_id || "").replace(/'/g, "''")}',
              ${Number(step.step_number) || 0}, '${String(step.url || "").replace(/'/g, "''")}',
              '${String(step.action || "").replace(/'/g, "''")}', '${String(step.expected_outcome || "").replace(/'/g, "''")}',
              '${String(step.duration || "3s").replace(/'/g, "''")}')
          `);
        }
      }
      // Update voiceovers
      const voiceovers = data.voiceovers as Array<Record<string, unknown>> | undefined;
      if (voiceovers && Array.isArray(voiceovers)) {
        await execute("DELETE FROM voiceover_scripts");
        for (const v of voiceovers) {
          await execute(`
            INSERT INTO voiceover_scripts (flow_id, paragraph_index, text)
            VALUES ('${String(v.flow_id || "").replace(/'/g, "''")}', ${Number(v.paragraph_index) || 0},
              '${String(v.text || "").replace(/'/g, "''")}')
          `);
        }
      }
      // Update timeline markers
      const timelineMarkers = data.timelineMarkers as Array<Record<string, unknown>> | undefined;
      if (timelineMarkers && Array.isArray(timelineMarkers)) {
        await execute("DELETE FROM timeline_markers");
        for (let i = 0; i < timelineMarkers.length; i++) {
          const m = timelineMarkers[i];
          await execute(`
            INSERT INTO timeline_markers (id, flow_id, timestamp, label, paragraph_index)
            VALUES (${i + 1}, '${String(m.flow_id || "").replace(/'/g, "''")}', '${String(m.timestamp || "0:00").replace(/'/g, "''")}',
              '${String(m.label || "").replace(/'/g, "''")}', ${Number(m.paragraph_index) || 0})
          `);
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
    const summaryRows = await query<{ project_path: string }>("SELECT project_path FROM project_summary LIMIT 1");
    const cwd = summaryRows[0]?.project_path || process.cwd();

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
