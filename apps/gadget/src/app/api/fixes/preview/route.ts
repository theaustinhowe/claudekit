import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";
import type { FixAction } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fixId = searchParams.get("id");

  if (!fixId) {
    return NextResponse.json({ error: "Missing fix id" }, { status: 400 });
  }

  const db = await getDb();
  const fix = await queryOne<FixAction>(db, "SELECT * FROM fix_actions WHERE id = ?", [fixId]);

  if (!fix) {
    return NextResponse.json({ error: "Fix not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: fix.id,
    title: fix.title,
    diff_file: fix.diff_file,
    diff_before: fix.diff_before,
    diff_after: fix.diff_after,
  });
}
