import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import { parseBody, togglePatchSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      id: string;
      label: string;
      enabled: boolean;
    }>(conn, "SELECT id, label, enabled FROM auth_overrides WHERE run_id = ?", [runId]);

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch auth overrides:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = await parseBody(request, togglePatchSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { id, enabled, runId } = parsed.data;

  try {
    const conn = await getDb();
    await execute(conn, "UPDATE auth_overrides SET enabled = ? WHERE id = ? AND run_id = ?", [enabled, id, runId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update auth override:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
