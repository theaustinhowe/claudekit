import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SessionRunner } from "@claudekit/session";
import { execute, getDb, queryAll } from "@/lib/db";
import { generateChapters } from "@/lib/video/chapter-generator";
import { concatenateAudioFiles, concatenateVideos, mergeVideoAudio } from "@/lib/video/ffmpeg-merger";

export function createFinalMergeRunner(runId: string): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading recordings and audio...", progress: 5 });

    const conn = await getDb();

    // Load recordings from DB
    const recordings = await queryAll<{
      id: string;
      flow_id: string;
      file_path: string;
      duration_seconds: number;
    }>(
      conn,
      "SELECT id, flow_id, file_path, duration_seconds FROM recordings WHERE status = 'done' AND run_id = ? ORDER BY flow_id",
      [runId],
    );

    const audioFiles = await queryAll<{
      id: string;
      flow_id: string;
      file_path: string;
      duration_seconds: number;
    }>(conn, "SELECT id, flow_id, file_path, duration_seconds FROM audio_files WHERE run_id = ? ORDER BY flow_id", [
      runId,
    ]);

    const flowScripts = await queryAll<{ flow_id: string; flow_name: string }>(
      conn,
      "SELECT flow_id, flow_name FROM flow_scripts WHERE run_id = ?",
      [runId],
    );

    if (recordings.length === 0) throw new Error("No recordings found");

    const outputDir = join(process.cwd(), "data", "output");
    await mkdir(outputDir, { recursive: true });

    // Get project name
    const projectRows = await queryAll<{ name: string; project_path: string }>(
      conn,
      "SELECT name, project_path FROM project_summary WHERE run_id = ? LIMIT 1",
      [runId],
    );
    const projectName = projectRows[0]?.name || "project";
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // 1. Concatenate all flow videos
    onProgress({ type: "progress", message: "Concatenating video clips...", progress: 20 });

    const videoPaths = recordings.map((r) => r.file_path);
    const concatenatedPath = join(outputDir, `${safeName}-video.mp4`);
    await concatenateVideos(videoPaths, concatenatedPath);

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // 2. Merge with audio (if audio exists)
    let finalPath = concatenatedPath;

    if (audioFiles.length > 0) {
      onProgress({ type: "progress", message: "Merging audio track...", progress: 50 });

      const audioPaths = audioFiles.map((a) => a.file_path);
      let audioPath: string;

      if (audioPaths.length > 1) {
        // Concatenate all audio files for multi-flow videos
        onProgress({ type: "progress", message: "Concatenating audio tracks...", progress: 40 });
        audioPath = join(outputDir, `${safeName}-audio.mp3`);
        await concatenateAudioFiles(audioPaths, audioPath);
      } else {
        audioPath = audioPaths[0];
      }

      finalPath = join(outputDir, `${safeName}-walkthrough.mp4`);
      await mergeVideoAudio({
        videoPath: concatenatedPath,
        audioPath,
        outputPath: finalPath,
      });
    }

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // 3. Generate chapters
    onProgress({ type: "progress", message: "Generating chapter markers...", progress: 80 });

    const recordingInfo = recordings.map((r) => {
      const flow = flowScripts.find((f) => f.flow_id === r.flow_id);
      return {
        flowId: r.flow_id,
        flowName: flow?.flow_name || r.flow_id,
        durationSeconds: Number(r.duration_seconds),
      };
    });

    const chapters = generateChapters(recordingInfo);

    // Save chapters and final video to DB
    const { statSync } = await import("node:fs");
    const stats = statSync(finalPath);
    const totalDuration = recordingInfo.reduce((sum, r) => sum + r.durationSeconds, 0);

    try {
      await execute(conn, "BEGIN TRANSACTION");

      await execute(conn, "DELETE FROM chapter_markers WHERE run_id = ?", [runId]);
      for (let i = 0; i < chapters.length; i++) {
        await execute(
          conn,
          `INSERT INTO chapter_markers (id, run_id, flow_name, start_time)
          VALUES (?, ?, ?, ?)`,
          [i + 1, runId, chapters[i].flowName, chapters[i].startTime],
        );
      }

      await execute(conn, "DELETE FROM final_videos WHERE run_id = ?", [runId]);
      await execute(
        conn,
        `INSERT INTO final_videos (id, run_id, file_path, duration_seconds, file_size_bytes, status)
        VALUES (?, ?, ?, ?, ?, 'done')`,
        ["final-1", runId, finalPath, totalDuration, stats.size],
      );

      await execute(conn, "COMMIT");
    } catch (err) {
      await execute(conn, "ROLLBACK").catch(() => {});
      throw err;
    }

    onProgress({ type: "progress", message: "Video merge complete!", progress: 100 });

    return {
      result: {
        videoPath: finalPath,
        duration: totalDuration,
        chapters,
        size: stats.size,
      },
    };
  };
}
