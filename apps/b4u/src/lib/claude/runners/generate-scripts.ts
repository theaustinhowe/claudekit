import { runClaude } from "@devkit/claude-runner";
import { buildGenerateScriptsPrompt } from "@/lib/claude/prompts/generate-scripts";
import { buildGenerateVoiceoverPrompt } from "@/lib/claude/prompts/generate-voiceover";
import type { SessionRunner } from "@/lib/claude/types";
import { execute, query } from "@/lib/db";

export function createGenerateScriptsRunner(): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading flows and routes...", progress: 10 });

    // Read project context from DB
    const summaryRows = await query<{
      name: string;
      framework: string;
      project_path: string;
    }>("SELECT name, framework, project_path FROM project_summary LIMIT 1");

    if (summaryRows.length === 0) {
      throw new Error("No project summary found. Run analyze-project first.");
    }

    const summary = summaryRows[0];

    const routeRows = await query<{
      path: string;
      title: string;
      description: string;
    }>("SELECT path, title, description FROM routes ORDER BY id");

    const flowRows = await query<{
      id: string;
      name: string;
      steps: string[];
    }>("SELECT id, name, steps FROM user_flows ORDER BY id");

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
    await execute("DELETE FROM flow_scripts");
    await execute("DELETE FROM script_steps");

    if (scripts.scripts && Array.isArray(scripts.scripts)) {
      for (let i = 0; i < scripts.scripts.length; i++) {
        const s = scripts.scripts[i];
        await execute(`
          INSERT INTO flow_scripts (id, flow_id, flow_name)
          VALUES (${i + 1}, '${(s.flowId || "").replace(/'/g, "''")}', '${(s.flowName || "").replace(/'/g, "''")}')
        `);

        if (s.steps && Array.isArray(s.steps)) {
          for (const step of s.steps) {
            await execute(`
              INSERT INTO script_steps (id, flow_id, step_number, url, action, expected_outcome, duration)
              VALUES ('${(step.id || "").replace(/'/g, "''")}', '${(s.flowId || "").replace(/'/g, "''")}',
                ${step.stepNumber || 0}, '${(step.url || "").replace(/'/g, "''")}',
                '${(step.action || "").replace(/'/g, "''")}', '${(step.expectedOutcome || "").replace(/'/g, "''")}',
                '${(step.duration || "3s").replace(/'/g, "''")}')
            `);
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
    await execute("DELETE FROM voiceover_scripts");
    await execute("DELETE FROM timeline_markers");
    await execute("DELETE FROM chapter_markers");

    // Save voiceover scripts
    if (voiceover.voiceovers) {
      for (const [flowId, paragraphs] of Object.entries(voiceover.voiceovers)) {
        if (Array.isArray(paragraphs)) {
          for (let i = 0; i < paragraphs.length; i++) {
            const text = paragraphs[i] as string;
            await execute(`
              INSERT INTO voiceover_scripts (flow_id, paragraph_index, text)
              VALUES ('${flowId.replace(/'/g, "''")}', ${i}, '${text.replace(/'/g, "''")}')
            `);
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
            await execute(`
              INSERT INTO timeline_markers (id, flow_id, timestamp, label, paragraph_index)
              VALUES (${markerId++}, '${flowId.replace(/'/g, "''")}', '${(marker.timestamp || "0:00").replace(/'/g, "''")}',
                '${(marker.label || "").replace(/'/g, "''")}', ${marker.paragraphIndex || 0})
            `);
          }
        }
      }
    }

    // Save chapter markers (one per flow)
    if (scripts.scripts && Array.isArray(scripts.scripts)) {
      let cumulativeTime = "0:00";
      for (let i = 0; i < scripts.scripts.length; i++) {
        const s = scripts.scripts[i];
        await execute(`
          INSERT INTO chapter_markers (id, flow_name, start_time)
          VALUES (${i + 1}, '${(s.flowName || "").replace(/'/g, "''")}', '${cumulativeTime}')
        `);
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
