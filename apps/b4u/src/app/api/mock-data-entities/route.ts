import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query<{
      name: string;
      count: number;
      note: string;
    }>("SELECT name, count, note FROM mock_data_entities ORDER BY id");

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch mock data entities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
