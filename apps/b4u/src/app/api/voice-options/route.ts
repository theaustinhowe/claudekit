import { NextResponse } from "next/server";
import { listVoices } from "@/lib/audio/elevenlabs-client";
import { getDb, queryAll } from "@/lib/db";

let cachedVoices: { id: string; name: string; style: string }[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    // Try ElevenLabs API first (with cache)
    if (!cachedVoices || Date.now() > cacheExpiry) {
      try {
        const voices = await listVoices();
        cachedVoices = voices.map((v) => ({
          id: v.voice_id,
          name: v.name,
          style: v.labels?.accent || v.labels?.description || v.category || "default",
        }));
        cacheExpiry = Date.now() + CACHE_TTL;
      } catch {
        // API unavailable — fall through to DB
        cachedVoices = null;
      }
    }

    if (cachedVoices && cachedVoices.length > 0) {
      return NextResponse.json(cachedVoices);
    }

    // Fall back to DB voice_options table
    const conn = await getDb();
    const rows = await queryAll<{
      id: string;
      name: string;
      style: string;
    }>(conn, "SELECT id, name, style FROM voice_options");

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch voice options:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
