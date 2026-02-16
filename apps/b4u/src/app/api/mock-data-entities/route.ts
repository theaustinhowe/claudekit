import { NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

export async function GET() {
  try {
    const conn = await getDb();
    const rows = await queryAll<{
      name: string;
      count: number;
      note: string;
    }>(conn, "SELECT name, count, note FROM mock_data_entities ORDER BY id");

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch mock data entities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
