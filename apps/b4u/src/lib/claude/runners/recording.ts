import type { SessionRunner } from "@claudekit/session";
import { runRecordingPipeline } from "@/lib/recording/recording-orchestrator";

export function createRecordingRunner(
  projectPath: string,
  flowIds: string[] | undefined,
  runId: string,
): SessionRunner {
  return async ({ onProgress, signal }) => {
    const result = await runRecordingPipeline({
      projectPath,
      flowIds,
      runId,
      onProgress,
      signal,
    });
    return { result: { ...result } };
  };
}
