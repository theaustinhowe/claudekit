import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateSpeech } from "./elevenlabs-client";

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
  const { flowId, paragraphs, voiceId, speed = 1.0, onProgress } = options;
  const outputDir = options.outputDir || join(process.cwd(), "data", "audio");

  await mkdir(outputDir, { recursive: true });

  const chunks: Buffer[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    onProgress?.(`Generating paragraph ${i + 1}/${paragraphs.length}`, ((i + 1) / paragraphs.length) * 100);

    const audio = await generateSpeech(paragraphs[i], voiceId, { speed });
    chunks.push(audio);

    // Add a small silence gap between paragraphs (0.5s of silence at 22050Hz mono)
    if (i < paragraphs.length - 1) {
      const silenceBytes = Math.floor(22050 * 0.5 * 2); // 0.5s silence
      chunks.push(Buffer.alloc(silenceBytes));
    }
  }

  const combined = Buffer.concat(chunks);
  const filePath = join(outputDir, `${flowId}.mp3`);
  await writeFile(filePath, combined);

  // Rough estimate: ~150 words per minute at 1x speed
  const wordCount = paragraphs.join(" ").split(/\s+/).length;
  const durationEstimate = ((wordCount / 150) * 60) / speed;

  return { flowId, filePath, durationEstimate };
}
