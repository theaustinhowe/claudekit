import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SessionRunner } from "@devkit/session";
import { execute, getDb, queryAll } from "@/lib/db";
import { generateChapters } from "@/lib/video/chapter-generator";
import { concatenateVideos, mergeVideoAudio } from "@/lib/video/ffmpeg-merger";

export function createFinalMergeRunner(): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading recordings and audio...", progress: 5 });

    const conn = await getDb();

    // Load recordings from DB
    const recordings = await queryAll<{
      id: string;
      flow_id: string;
      video_path: string;
      duration_seconds: number;
    }>(conn, "SELECT * FROM recordings WHERE status = 'done' ORDER BY flow_id");

    const audioFiles = await queryAll<{
      id: string;
      flow_id: string;
      file_path: string;
      duration_seconds: number;
    }>(conn, "SELECT * FROM audio_files ORDER BY flow_id");

    const flowScripts = await queryAll<{ flow_id: string; flow_name: string }>(
      conn,
      "SELECT * FROM flow_scripts ORDER BY id",
    );

    if (recordings.length === 0) throw new Error("No recordings found");

    const outputDir = join(process.cwd(), "data", "output");
    await mkdir(outputDir, { recursive: true });

    // Get project name
    const projectRows = await queryAll<{ name: string; project_path: string }>(
      conn,
      "SELECT name, project_path FROM project_summary LIMIT 1",
    );
    const projectName = projectRows[0]?.name || "project";
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // 1. Concatenate all flow videos
    onProgress({ type: "progress", message: "Concatenating video clips...", progress: 20 });

    const videoPaths = recordings.map((r) => r.video_path);
    const concatenatedPath = join(outputDir, `${safeName}-video.mp4`);
    await concatenateVideos(videoPaths, concatenatedPath);

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // 2. Merge with audio (if audio exists)
    let finalPath = concatenatedPath;

    if (audioFiles.length > 0) {
      onProgress({ type: "progress", message: "Merging audio track...", progress: 50 });

      // Concatenate audio files first (simple concat for mp3)
      const audioPaths = audioFiles.map((a) => a.file_path);
      // For now, use the first audio file (full merge would need ffmpeg concat)
      const audioPath = audioPaths[0];

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

    // Save chapters to DB
    await execute(conn, "DELETE FROM chapter_markers");
    for (let i = 0; i < chapters.length; i++) {
      await execute(
        conn,
        `INSERT INTO chapter_markers (id, flow_name, start_time)
        VALUES (?, ?, ?)`,
        [i + 1, chapters[i].flowName, chapters[i].startTime],
      );
    }

    // Save final video to DB
    await execute(conn, "DELETE FROM final_videos");
    const { statSync } = await import("node:fs");
    const stats = statSync(finalPath);
    const totalDuration = recordingInfo.reduce((sum, r) => sum + r.durationSeconds, 0);

    await execute(
      conn,
      `INSERT INTO final_videos (id, project_path, file_path, duration_seconds, format, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)`,
      ["final-1", projectRows[0]?.project_path || "", finalPath, totalDuration, "mp4", stats.size],
    );

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
