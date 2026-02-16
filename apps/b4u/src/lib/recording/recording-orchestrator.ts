import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SessionEvent } from "@/lib/claude/types";
import { query } from "@/lib/db";
import type { FlowScript } from "@/lib/types";
import { startDevServer, stopDevServer } from "./app-launcher";
import { injectEnvOverrides, restoreProject } from "./data-seeder";
import { recordFlow } from "./playwright-runner";

interface OrchestratorOptions {
  projectPath: string;
  flowIds?: string[];
  onProgress: (event: SessionEvent) => void;
  signal: AbortSignal;
}

export async function runRecordingPipeline(
  options: OrchestratorOptions,
): Promise<{ recordings: Array<{ flowId: string; videoPath: string; duration: number }> }> {
  const { projectPath, flowIds, onProgress, signal } = options;
  const outputDir = join(process.cwd(), "data", "recordings");
  await mkdir(outputDir, { recursive: true });

  // 1. Load flow scripts from DB
  onProgress({ type: "progress", message: "Loading flow scripts...", progress: 5 });

  const flowScriptRows = await query<{ flow_id: string; flow_name: string }>(
    "SELECT flow_id, flow_name FROM flow_scripts",
  );
  const stepRows = await query<{
    flow_id: string;
    id: string;
    step_number: number;
    url: string;
    action: string;
    expected_outcome: string;
    duration: string;
  }>("SELECT * FROM script_steps ORDER BY flow_id, step_number");

  // Build flow scripts
  let scripts: FlowScript[] = flowScriptRows.map((f) => ({
    flowId: f.flow_id,
    flowName: f.flow_name,
    steps: stepRows
      .filter((s) => s.flow_id === f.flow_id)
      .map((s) => ({
        id: s.id,
        stepNumber: s.step_number,
        url: s.url,
        action: s.action,
        expectedOutcome: s.expected_outcome,
        duration: s.duration,
      })),
  }));

  // Filter to requested flows
  if (flowIds && flowIds.length > 0) {
    scripts = scripts.filter((s) => flowIds.includes(s.flowId));
  }

  if (scripts.length === 0) throw new Error("No flow scripts found");

  // 2. Load data plan for env overrides
  const entities = await query<{ name: string; count: number; note: string }>("SELECT * FROM mock_data_entities");
  const authOverrides = await query<{ id: string; label: string; enabled: boolean }>("SELECT * FROM auth_overrides");
  const envItems = await query<{ id: string; label: string; enabled: boolean }>("SELECT * FROM env_items");

  // 3. Inject env overrides
  onProgress({ type: "progress", message: "Configuring environment...", progress: 10 });
  await injectEnvOverrides(projectPath, {
    entities: entities as unknown as Array<{ name: string; count: number; note: string }>,
    authOverrides: authOverrides as unknown as Array<{ id: string; label: string; enabled: boolean }>,
    envItems: envItems as unknown as Array<{ id: string; label: string; enabled: boolean }>,
  });

  // 4. Start dev server
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  onProgress({ type: "progress", message: "Starting dev server...", progress: 15 });

  const server = await startDevServer(projectPath);

  const recordings: Array<{ flowId: string; videoPath: string; duration: number }> = [];

  try {
    // 5. Record each flow
    for (let i = 0; i < scripts.length; i++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const script = scripts[i];
      const flowProgress = 20 + (i / scripts.length) * 70;

      onProgress({
        type: "progress",
        message: `Recording: ${script.flowName}`,
        progress: flowProgress,
        data: { flowId: script.flowId, flowName: script.flowName, status: "recording" },
      });

      const result = await recordFlow({
        serverUrl: server.url,
        flowId: script.flowId,
        steps: script.steps,
        outputDir,
        onProgress: (msg, pct) => {
          const subProgress = flowProgress + (pct / 100) * (70 / scripts.length);
          onProgress({
            type: "log",
            message: msg,
            progress: subProgress,
            data: { flowId: script.flowId, flowName: script.flowName, status: "recording" },
          });
        },
      });

      recordings.push({ flowId: script.flowId, videoPath: result.videoPath, duration: result.durationSeconds });

      // Save recording to DB
      await import("@/lib/db").then((db) =>
        db.execute(`
        INSERT INTO recordings (id, flow_id, project_path, video_path, duration_seconds, status)
        VALUES ('rec-${script.flowId}', '${script.flowId}', '${projectPath.replace(/'/g, "''")}',
          '${result.videoPath.replace(/'/g, "''")}', ${result.durationSeconds}, 'done')
      `),
      );

      onProgress({
        type: "progress",
        message: `Completed: ${script.flowName}`,
        progress: flowProgress + 70 / scripts.length,
        data: { flowId: script.flowId, status: "done" },
      });
    }
  } finally {
    // 6. Cleanup
    stopDevServer(server.process);
    await restoreProject(projectPath);
  }

  onProgress({ type: "progress", message: "All recordings complete", progress: 100 });

  return { recordings };
}
