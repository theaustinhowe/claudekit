import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface MergeOptions {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  onProgress?: (percent: number) => void;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("ffmpeg not found. Install it with: brew install ffmpeg"));
      } else {
        reject(err);
      }
    });
  });
}

export async function mergeVideoAudio(options: MergeOptions): Promise<void> {
  const { videoPath, audioPath, outputPath } = options;
  await runFfmpeg(["-y", "-i", videoPath, "-i", audioPath, "-c:v", "copy", "-c:a", "aac", "-shortest", outputPath]);
}

export async function concatenateVideos(videoPaths: string[], outputPath: string): Promise<void> {
  // Create concat file
  const concatDir = join(process.cwd(), "data", "tmp");
  await mkdir(concatDir, { recursive: true });
  const concatFile = join(concatDir, "concat.txt");
  const content = videoPaths.map((p) => `file '${p}'`).join("\n");
  await writeFile(concatFile, content);

  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c:v", "libx264", "-c:a", "aac", outputPath]);
}

export async function concatenateAudioFiles(audioPaths: string[], outputPath: string): Promise<void> {
  const concatDir = join(process.cwd(), "data", "tmp");
  await mkdir(concatDir, { recursive: true });
  const concatFile = join(concatDir, "audio-concat.txt");
  const content = audioPaths.map((p) => `file '${p}'`).join("\n");
  await writeFile(concatFile, content);

  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputPath]);
}

async function _convertToMp4(inputPath: string, outputPath: string): Promise<void> {
  await runFfmpeg(["-y", "-i", inputPath, "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", outputPath]);
}
