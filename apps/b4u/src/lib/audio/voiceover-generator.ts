import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { concatenateAudioFiles, generateSilence } from "../video/ffmpeg-merger";
import { generateSpeech, getDefaultVoiceId } from "./elevenlabs-client";

interface GenerateOptions {
  flowId: string;
  paragraphs: string[];
  voiceId: string;
  speed?: number;
  outputDir?: string;
  onProgress?: (message: string, progress: number) => void;
}

interface VoiceoverResult {
  flowId: string;
  filePath: string;
  durationEstimate: number;
}

export async function generateFlowVoiceover(options: GenerateOptions): Promise<VoiceoverResult> {
  const { flowId, paragraphs, speed = 1.0, onProgress } = options;
  const outputDir = options.outputDir || join(process.cwd(), "data", "audio");
  const tmpDir = join(outputDir, "tmp");

  await mkdir(outputDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  // Resolve friendly voice name to a real ElevenLabs voice ID
  const voiceId = await getDefaultVoiceId(options.voiceId);

  const segmentPaths: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    onProgress?.(`Generating paragraph ${i + 1}/${paragraphs.length}`, ((i + 1) / paragraphs.length) * 100);

    const audio = await generateSpeech(paragraphs[i], voiceId, { speed });
    const segmentPath = join(tmpDir, `${flowId}-p${i}.mp3`);
    await writeFile(segmentPath, audio);
    segmentPaths.push(segmentPath);

    // Add a 0.5s silence gap between paragraphs via FFmpeg
    if (i < paragraphs.length - 1) {
      const silencePath = join(tmpDir, `${flowId}-silence${i}.mp3`);
      await generateSilence(silencePath, 0.5);
      segmentPaths.push(silencePath);
    }
  }

  // Concatenate all segments using FFmpeg for proper MP3 framing
  const filePath = join(outputDir, `${flowId}.mp3`);
  await concatenateAudioFiles(segmentPaths, filePath);

  // Cleanup temp segments
  for (const p of segmentPaths) {
    await unlink(p).catch(() => {});
  }

  // Rough estimate: ~150 words per minute at 1x speed
  const wordCount = paragraphs.join(" ").split(/\s+/).length;
  const durationEstimate = ((wordCount / 150) * 60) / speed;

  return { flowId, filePath, durationEstimate };
}
