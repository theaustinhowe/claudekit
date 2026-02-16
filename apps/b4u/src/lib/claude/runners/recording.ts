import type { SessionRunner } from "@devkit/session";
import { runRecordingPipeline } from "@/lib/recording/recording-orchestrator";

export function createRecordingRunner(projectPath: string, flowIds?: string[]): SessionRunner {
  return async ({ onProgress, signal }) => {
    const result = await runRecordingPipeline({
      projectPath,
      flowIds,
      onProgress,
      signal,
    });
    return { result: result as unknown as Record<string, unknown> };
  };
}
