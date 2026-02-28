import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { concatenateAudioFiles } from "@/lib/video/ffmpeg-merger";

export async function GET() {
  try {
    const audioDir = join(process.cwd(), "data", "audio");

    // List all MP3 files (one per flow)
    let files: string[];
    try {
      const entries = await readdir(audioDir, "utf-8");
      files = entries
        .filter((f) => f.endsWith(".mp3") && !f.startsWith("combined"))
        .map((f) => join(audioDir, f))
        .sort();
    } catch {
      return NextResponse.json({ error: "No audio files found" }, { status: 404 });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No audio files found" }, { status: 404 });
    }

    // If there's only one file, serve it directly
    let servePath: string;
    if (files.length === 1) {
      servePath = files[0];
    } else {
      // Concatenate all flow audio files into one combined file
      servePath = join(audioDir, "combined-walkthrough.mp3");
      const combinedStat = await stat(servePath).catch(() => null);
      const latestSource = Math.max(...(await Promise.all(files.map(async (f) => (await stat(f)).mtimeMs))));

      // Re-generate if combined file is stale or doesn't exist
      if (!combinedStat || combinedStat.mtimeMs < latestSource) {
        await concatenateAudioFiles(files, servePath);
      }
    }

    const buffer = await readFile(servePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="walkthrough-audio.mp3"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("Failed to serve audio:", error);
    return NextResponse.json({ error: "Failed to serve audio" }, { status: 500 });
  }
}
