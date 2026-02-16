import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query<{
      id: string;
      name: string;
      style: string;
    }>("SELECT id, name, style FROM voice_options");

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch voice options:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
