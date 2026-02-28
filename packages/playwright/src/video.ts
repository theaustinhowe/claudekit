import fs from "node:fs";
import path from "node:path";

/**
 * Finalize a video recording: find the .webm file in the raw recording directory,
 * move it to the destination path, and clean up the raw directory.
 *
 * @param rawDir - The directory where Playwright saved the raw recording
 * @param destPath - The final destination path for the video file
 * @returns The destination path
 */
export function finalizeVideo(rawDir: string, destPath: string): string {
  const files = fs.readdirSync(rawDir, "utf-8").filter((f) => f.endsWith(".webm"));
  if (files.length === 0) {
    throw new Error("No video file produced");
  }

  const srcVideo = path.join(rawDir, files[0]);
  fs.renameSync(srcVideo, destPath);
  fs.rmSync(rawDir, { recursive: true, force: true });

  return destPath;
}
