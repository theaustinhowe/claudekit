import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import { parseBody, userFlowsArraySchema } from "@/lib/validations";

function normalizeSteps(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object" && "toArray" in raw && typeof (raw as { toArray: unknown }).toArray === "function")
    return (raw as { toArray: () => unknown[] }).toArray().map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // DuckDB stringified format: "[Step 1, Step 2]"
      const inner = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
      if (inner) return inner.split(",").map((s) => s.trim());
    }
  }
  return [];
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      id: string;
      name: string;
      steps: unknown;
    }>(conn, "SELECT id, name, steps FROM user_flows WHERE run_id = ?", [runId]);

    const normalized = rows.map((r) => ({
      ...r,
      steps: normalizeSteps(r.steps),
    }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Failed to fetch user flows:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  const parsed = await parseBody(request, userFlowsArraySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const flows = parsed.data;

  try {
    const conn = await getDb();
    await execute(conn, "DELETE FROM user_flows WHERE run_id = ?", [runId]);

    for (const flow of flows) {
      await execute(conn, "INSERT INTO user_flows (id, run_id, name, steps) VALUES (?, ?, ?, ?::VARCHAR[])", [
        flow.id,
        runId,
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
