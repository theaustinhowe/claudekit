import { NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

export async function GET() {
  try {
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
