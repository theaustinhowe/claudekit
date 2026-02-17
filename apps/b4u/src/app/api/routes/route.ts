import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import { parseBody, routesArraySchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      id: number;
      path: string;
      title: string;
      auth_required: boolean;
      description: string;
    }>(conn, "SELECT id, path, title, auth_required, description FROM routes WHERE run_id = ? ORDER BY id", [runId]);

    const routes = rows.map((r) => ({
      path: r.path,
      title: r.title,
      authRequired: r.auth_required,
      description: r.description,
    }));

    return NextResponse.json(routes);
  } catch (error) {
    console.error("Failed to fetch routes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  const parsed = await parseBody(request, routesArraySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const routes = parsed.data;

  try {
    const conn = await getDb();
    await execute(conn, "DELETE FROM routes WHERE run_id = ?", [runId]);

    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      await execute(
        conn,
        "INSERT INTO routes (id, run_id, path, title, auth_required, description) VALUES (?, ?, ?, ?, ?, ?)",
        [i + 1, runId, r.path, r.title, r.authRequired, r.description],
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update routes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
