import { NextResponse } from "next/server";
import { listVoices } from "@/lib/audio/elevenlabs-client";

export async function GET() {
  try {
    const voices = await listVoices();
    // Map to simpler format
    const options = voices.slice(0, 20).map((v) => ({
      id: v.voice_id,
      name: v.name,
      style: v.labels?.accent || v.labels?.description || v.category || "General",
    }));
    return NextResponse.json(options);
  } catch (_err) {
    // Fallback to DB voices if API fails
    const { getDb, queryAll } = await import("@/lib/db");
    const conn = await getDb();
    const voices = await queryAll(conn, "SELECT * FROM voice_options");
    return NextResponse.json(voices);
  }
}
