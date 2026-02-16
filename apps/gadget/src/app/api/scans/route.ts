import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { queryAll } from "@/lib/db/helpers";

export async function GET() {
  const db = await getDb();
  const scans = await queryAll(db, "SELECT * FROM scans ORDER BY created_at DESC");
  return NextResponse.json(scans);
}
