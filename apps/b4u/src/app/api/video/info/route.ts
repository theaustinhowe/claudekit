import { NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

export async function GET() {
  try {
    const conn = await getDb();
    const rows = await queryAll<{
      id: string;
      file_path: string;
      duration_seconds: number;
    }>(conn, "SELECT id, file_path, duration_seconds FROM final_videos ORDER BY created_at DESC LIMIT 1");

    if (rows.length === 0) {
      return NextResponse.json({ error: "No final video found" }, { status: 404 });
    }

    const video = rows[0];
    return NextResponse.json({
      id: video.id,
      durationSeconds: Number(video.duration_seconds),
    });
  } catch (error) {
    console.error("Failed to fetch video info:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
