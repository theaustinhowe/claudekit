import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import { parseBody, userFlowsArraySchema } from "@/lib/validations";

export async function GET() {
  try {
    const conn = await getDb();
    const rows = await queryAll<{
      id: string;
      name: string;
      steps: string[];
    }>(conn, "SELECT id, name, steps FROM user_flows");

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch user flows:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const parsed = await parseBody(request, userFlowsArraySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const flows = parsed.data;

  try {
    const conn = await getDb();
    await execute(conn, "DELETE FROM user_flows");

    for (const flow of flows) {
      await execute(conn, "INSERT INTO user_flows (id, name, steps) VALUES (?, ?, ?::VARCHAR[])", [
        flow.id,
        flow.name,
        JSON.stringify(flow.steps),
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update user flows:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
