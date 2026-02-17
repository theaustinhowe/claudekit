import { type NextRequest, NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      id: string;
      file_path: string;
      duration_seconds: number;
    }>(
      conn,
      "SELECT id, file_path, duration_seconds FROM final_videos WHERE run_id = ? ORDER BY created_at DESC LIMIT 1",
      [runId],
    );

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
