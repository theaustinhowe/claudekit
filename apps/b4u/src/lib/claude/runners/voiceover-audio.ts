import type { SessionRunner } from "@claudekit/session";
import { generateFlowVoiceover } from "@/lib/audio/voiceover-generator";
import { execute, getDb, queryAll } from "@/lib/db";

export function createVoiceoverAudioRunner(voiceId: string, speed: number = 1.0, runId: string): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading voiceover scripts...", progress: 5 });

    const conn = await getDb();

    // Load voiceover data from flow_voiceover
    const rows = await queryAll<{ flow_id: string; paragraphs_json: string }>(
      conn,
      "SELECT flow_id, paragraphs_json FROM flow_voiceover WHERE run_id = ?",
      [runId],
    );

    // Build flow map from paragraphs_json
    const flows: Array<[string, string[]]> = rows.map((row) => [row.flow_id, JSON.parse(row.paragraphs_json)]);

    const results: Array<{ flowId: string; filePath: string; duration: number }> = [];

    // Clear existing audio files
    await execute(conn, "DELETE FROM audio_files WHERE run_id = ?", [runId]);

    for (let i = 0; i < flows.length; i++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const [flowId, paragraphs] = flows[i];
      const flowProgress = 10 + (i / flows.length) * 80;

      onProgress({
        type: "progress",
        message: `Generating audio for flow: ${flowId}`,
        progress: flowProgress,
        data: { flowId, status: "generating" },
      });

      const result = await generateFlowVoiceover({
        flowId,
        paragraphs,
        voiceId,
        speed,
        onProgress: (msg, pct) => {
          onProgress({
            type: "log",
            message: msg,
            progress: flowProgress + (pct / 100) * (80 / flows.length),
          });
        },
      });

      results.push({ flowId, filePath: result.filePath, duration: result.durationEstimate });

      // Save to DB
      await execute(
        conn,
        `INSERT INTO audio_files (id, run_id, flow_id, voice_id, file_path, duration_seconds)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [`audio-${flowId}`, runId, flowId, voiceId, result.filePath, result.durationEstimate],
      );
    }

    onProgress({ type: "progress", message: "Audio generation complete", progress: 100 });
    return { result: { audioFiles: results } as unknown as Record<string, unknown> };
  };
}
