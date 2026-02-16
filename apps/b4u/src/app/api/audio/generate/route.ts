import { NextResponse } from "next/server";
import { createVoiceoverAudioRunner } from "@/lib/claude/runners/voiceover-audio";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const { voiceId, speed } = await request.json();

  if (!voiceId) {
    return NextResponse.json({ error: "voiceId is required" }, { status: 400 });
  }

  const sessionId = await createSession({
    sessionType: "voiceover-audio",
    label: "Generating voiceover audio",
  });

  const runner = createVoiceoverAudioRunner(voiceId, speed || 1.0);
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
