import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import { parseBody, togglePatchSchema } from "@/lib/validations";

export async function GET() {
  try {
    const conn = await getDb();
    const rows = await queryAll<{
      id: string;
      label: string;
      enabled: boolean;
    }>(conn, "SELECT id, label, enabled FROM env_items");

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch environment config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = await parseBody(request, togglePatchSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { id, enabled } = parsed.data;

  try {
    const conn = await getDb();
    await execute(conn, "UPDATE env_items SET enabled = ? WHERE id = ?", [enabled, id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update env config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
