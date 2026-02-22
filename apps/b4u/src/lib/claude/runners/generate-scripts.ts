import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@claudekit/session";
import { buildGenerateScriptsPrompt } from "@/lib/claude/prompts/generate-scripts";
import { buildGenerateVoiceoverPrompt } from "@/lib/claude/prompts/generate-voiceover";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";

export function createGenerateScriptsRunner(runId?: string): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading flows and routes...", progress: 10 });

    const conn = await getDb();

    // Read project context from DB
    const summaryRows = await queryAll<{
      name: string;
      framework: string;
      project_path: string;
    }>(
      conn,
      runId
        ? "SELECT name, framework, project_path FROM project_summary WHERE run_id = ? LIMIT 1"
        : "SELECT name, framework, project_path FROM project_summary LIMIT 1",
      runId ? [runId] : [],
    );

    if (summaryRows.length === 0) {
      throw new Error("No project summary found. Run analyze-project first.");
    }

    const summary = summaryRows[0];

    // Read routes from run_content
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

    const routeData: Array<{ path: string; title: string; description: string }> = routesRow
      ? JSON.parse(routesRow.data_json)
      : [];

    // Read user flows from run_content
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

    const flowData: Array<{ id: string; name: string; steps: string[] }> = flowsRow
      ? JSON.parse(flowsRow.data_json)
      : [];

    if (flowData.length === 0) {
      throw new Error("No user flows found. Run generate-outline first.");
    }

    const projectContext = {
      name: summary.name,
      framework: summary.framework,
      flows: flowData.map((f) => ({ id: f.id, name: f.name, steps: f.steps })),
      routes: routeData.map((r) => ({ path: r.path, title: r.title, description: r.description })),
    };

    const cwd = summary.project_path || process.cwd();

    // --- Step 1: Generate scripts ---
    onProgress({ type: "progress", message: "Generating demo scripts...", progress: 20 });

    const scriptsPrompt = buildGenerateScriptsPrompt(projectContext);

    let claudeStart = Date.now();
    const estimateScriptProgress = () => Math.min(48, 20 + 28 * (1 - Math.exp(-(Date.now() - claudeStart) / 90_000)));

    const scriptsResult = await runClaude({
      cwd,
      prompt: scriptsPrompt,
      allowedTools: "Read,Glob,Grep,LS",
      disallowedTools: "Write,Edit,Bash",
      onProgress: (info) => {
        onProgress({
          type: "log",
          message: info.message,
          progress: Math.round(estimateScriptProgress()),
          log: info.log,
          logType: info.logType,
          chunk: info.chunk,
        });
      },
      signal,
    });

    onProgress({ type: "progress", message: "Parsing script results...", progress: 50 });

    // biome-ignore lint/suspicious/noExplicitAny: dynamic JSON from Claude response
    let scripts: Record<string, any>;
    try {
      const jsonMatch = scriptsResult.stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude output");
      scripts = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Failed to parse scripts: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Save scripts to DB (flow_scripts with embedded steps_json)
    await execute(conn, "DELETE FROM flow_scripts WHERE run_id = ?", [runId]);

    if (scripts.scripts && Array.isArray(scripts.scripts)) {
      for (const s of scripts.scripts) {
        await execute(
          conn,
          `INSERT INTO flow_scripts (id, run_id, flow_id, flow_name, steps_json)
          VALUES (?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), runId, s.flowId || "", s.flowName || "", JSON.stringify(s.steps || [])],
        );
      }
    }

    // --- Step 2: Generate voiceover ---
    onProgress({ type: "progress", message: "Generating voiceover narration...", progress: 60 });

    const voiceoverInput = (scripts.scripts || []).map(
      (s: {
        flowId: string;
        flowName: string;
        steps: Array<{ action: string; expectedOutcome: string; duration: string }>;
      }) => ({
        flowId: s.flowId,
        flowName: s.flowName,
        steps: (s.steps || []).map((step: { action: string; expectedOutcome: string; duration: string }) => ({
          action: step.action,
          expectedOutcome: step.expectedOutcome,
          duration: step.duration,
        })),
      }),
    );

    const voiceoverPrompt = buildGenerateVoiceoverPrompt(voiceoverInput);

    claudeStart = Date.now();
    const estimateVoiceoverProgress = () =>
      Math.min(78, 60 + 18 * (1 - Math.exp(-(Date.now() - claudeStart) / 60_000)));

    const voiceoverResult = await runClaude({
      cwd,
      prompt: voiceoverPrompt,
      allowedTools: "",
      disallowedTools: "Write,Edit,Bash,Read,Glob,Grep,LS",
      onProgress: (info) => {
        onProgress({
          type: "log",
          message: info.message,
          progress: Math.round(estimateVoiceoverProgress()),
          log: info.log,
          logType: info.logType,
          chunk: info.chunk,
        });
      },
      signal,
    });

    onProgress({ type: "progress", message: "Parsing voiceover results...", progress: 80 });

    // biome-ignore lint/suspicious/noExplicitAny: dynamic JSON from Claude response
    let voiceover: Record<string, any>;
    try {
      const jsonMatch = voiceoverResult.stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude output");
      voiceover = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Failed to parse voiceover: ${err instanceof Error ? err.message : String(err)}`);
    }

    onProgress({ type: "progress", message: "Saving to database...", progress: 90 });

    // Save voiceover data to flow_voiceover
    await execute(conn, "DELETE FROM flow_voiceover WHERE run_id = ?", [runId]);
    await execute(conn, "DELETE FROM chapter_markers WHERE run_id = ?", [runId]);

    // Build flow_voiceover rows: paragraphs_json and markers_json per flow
    if (voiceover.voiceovers) {
      for (const [flowId, paragraphs] of Object.entries(voiceover.voiceovers)) {
        const paragraphsArray = Array.isArray(paragraphs) ? paragraphs : [];

        // Get timeline markers for this flow
        const flowMarkers =
          voiceover.timelineMarkers && voiceover.timelineMarkers[flowId]
            ? (voiceover.timelineMarkers[flowId] as Array<{
                timestamp: string;
                label: string;
                paragraphIndex: number;
              }>)
            : [];

        await execute(
          conn,
          `INSERT INTO flow_voiceover (id, run_id, flow_id, paragraphs_json, markers_json)
          VALUES (?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), runId, flowId, JSON.stringify(paragraphsArray), JSON.stringify(flowMarkers)],
        );
      }
    }

    // Save chapter markers (one per flow)
    if (scripts.scripts && Array.isArray(scripts.scripts)) {
      let cumulativeTime = "0:00";
      for (let i = 0; i < scripts.scripts.length; i++) {
        const s = scripts.scripts[i];
        await execute(
          conn,
          `INSERT INTO chapter_markers (id, run_id, flow_name, start_time)
          VALUES (?, ?, ?, ?)`,
          [i + 1, runId, s.flowName || "", cumulativeTime],
        );
        // Estimate cumulative time from step durations
        const totalSeconds = (s.steps || []).reduce((acc: number, step: { duration: string }) => {
          const match = (step.duration || "3s").match(/(\d+)/);
          return acc + (match ? parseInt(match[1], 10) : 3);
        }, 0);
        const prevParts = cumulativeTime.split(":").map(Number);
        const prevTotal = prevParts[0] * 60 + prevParts[1] + totalSeconds;
        cumulativeTime = `${Math.floor(prevTotal / 60)}:${String(prevTotal % 60).padStart(2, "0")}`;
      }
    }

    onProgress({ type: "progress", message: "Scripts and voiceover complete", progress: 100 });

    return { result: { scripts, voiceover } };
  };
}
