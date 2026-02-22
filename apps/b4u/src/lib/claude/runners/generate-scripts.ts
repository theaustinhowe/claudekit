import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@claudekit/session";
import { buildGenerateScriptsPrompt } from "@/lib/claude/prompts/generate-scripts";
import { buildGenerateVoiceoverPrompt } from "@/lib/claude/prompts/generate-voiceover";
import { execute, getDb, queryAll } from "@/lib/db";

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

    const routeRows = await queryAll<{
      path: string;
      title: string;
      description: string;
    }>(
      conn,
      runId
        ? "SELECT path, title, description FROM routes WHERE run_id = ? ORDER BY id"
        : "SELECT path, title, description FROM routes ORDER BY id",
      runId ? [runId] : [],
    );

    const flowRows = await queryAll<{
      id: string;
      name: string;
      steps: string[];
    }>(
      conn,
      runId
        ? "SELECT id, name, steps FROM user_flows WHERE run_id = ? ORDER BY id"
        : "SELECT id, name, steps FROM user_flows ORDER BY id",
      runId ? [runId] : [],
    );

    if (flowRows.length === 0) {
      throw new Error("No user flows found. Run generate-outline first.");
    }

    const projectContext = {
      name: summary.name,
      framework: summary.framework,
      flows: flowRows.map((f) => ({ id: f.id, name: f.name, steps: f.steps })),
      routes: routeRows.map((r) => ({ path: r.path, title: r.title, description: r.description })),
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

    // Save scripts to DB
    await execute(conn, "DELETE FROM flow_scripts WHERE run_id = ?", [runId]);
    await execute(conn, "DELETE FROM script_steps WHERE run_id = ?", [runId]);

    if (scripts.scripts && Array.isArray(scripts.scripts)) {
      for (let i = 0; i < scripts.scripts.length; i++) {
        const s = scripts.scripts[i];
        await execute(
          conn,
          `INSERT INTO flow_scripts (id, run_id, flow_id, flow_name)
          VALUES (?, ?, ?, ?)`,
          [i + 1, runId, s.flowId || "", s.flowName || ""],
        );

        if (s.steps && Array.isArray(s.steps)) {
          for (const step of s.steps) {
            await execute(
              conn,
              `INSERT INTO script_steps (id, run_id, flow_id, step_number, url, action, expected_outcome, duration)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                step.id || "",
                runId,
                s.flowId || "",
                step.stepNumber || 0,
                step.url || "",
                step.action || "",
                step.expectedOutcome || "",
                step.duration || "3s",
              ],
            );
          }
        }
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

    // Save voiceover data
    await execute(conn, "DELETE FROM voiceover_scripts WHERE run_id = ?", [runId]);
    await execute(conn, "DELETE FROM timeline_markers WHERE run_id = ?", [runId]);
    await execute(conn, "DELETE FROM chapter_markers WHERE run_id = ?", [runId]);

    // Save voiceover scripts
    if (voiceover.voiceovers) {
      for (const [flowId, paragraphs] of Object.entries(voiceover.voiceovers)) {
        if (Array.isArray(paragraphs)) {
          for (let i = 0; i < paragraphs.length; i++) {
            const text = paragraphs[i] as string;
            await execute(
              conn,
              `INSERT INTO voiceover_scripts (run_id, flow_id, paragraph_index, text)
              VALUES (?, ?, ?, ?)`,
              [runId, flowId, i, text],
            );
          }
        }
      }
    }

    // Save timeline markers
    if (voiceover.timelineMarkers) {
      let markerId = 1;
      for (const [flowId, markers] of Object.entries(voiceover.timelineMarkers)) {
        if (Array.isArray(markers)) {
          for (const m of markers) {
            const marker = m as { timestamp: string; label: string; paragraphIndex: number };
            await execute(
              conn,
              `INSERT INTO timeline_markers (id, run_id, flow_id, timestamp, label, paragraph_index)
              VALUES (?, ?, ?, ?, ?, ?)`,
              [markerId++, runId, flowId, marker.timestamp || "0:00", marker.label || "", marker.paragraphIndex || 0],
            );
          }
        }
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
