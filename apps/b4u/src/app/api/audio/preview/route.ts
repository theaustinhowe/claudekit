import { NextResponse } from "next/server";
import { previewVoice } from "@/lib/audio/elevenlabs-client";

export async function POST(request: Request) {
  const { text, voiceId } = await request.json();

  if (!text || !voiceId) {
    return NextResponse.json({ error: "text and voiceId required" }, { status: 400 });
  }

  try {
    const audio = await previewVoice(text, voiceId);
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Preview failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
