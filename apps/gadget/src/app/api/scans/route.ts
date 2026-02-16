import { NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

export async function GET() {
  const db = await getDb();
  const scans = await queryAll(db, "SELECT * FROM scans ORDER BY created_at DESC");
  return NextResponse.json(scans);
}
