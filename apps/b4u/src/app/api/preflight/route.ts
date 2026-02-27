import { execSync } from "node:child_process";
import { NextResponse } from "next/server";

/**
 * External dependency checker — reports whether required tools
 * and API keys are available before starting a run.
 *
 * GET /api/preflight
 */
export async function GET() {
  const checks: Array<{ name: string; available: boolean; message: string }> = [];

  // Check ffmpeg
  try {
    execSync("ffmpeg -version", { stdio: "pipe", timeout: 5000 });
    checks.push({ name: "ffmpeg", available: true, message: "ffmpeg is installed" });
  } catch {
    checks.push({
      name: "ffmpeg",
      available: false,
      message: "ffmpeg not found. Install it to enable video merging (Phase 7).",
    });
  }

  // Check ElevenLabs API key
  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
  checks.push({
    name: "elevenlabs",
    available: hasElevenLabs,
    message: hasElevenLabs
      ? "ElevenLabs API key configured"
      : "ELEVENLABS_API_KEY not set. Set it to enable voiceover audio generation (Phase 6).",
  });

  const allAvailable = checks.every((c) => c.available);

  return NextResponse.json({ ok: allAvailable, checks });
}
