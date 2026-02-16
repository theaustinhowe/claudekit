import { type NextRequest, NextResponse } from "next/server";
import { execute, executePrepared, query } from "@/lib/db";
import { parseBody, routesArraySchema } from "@/lib/validations";

export async function GET() {
  try {
    const rows = await query<{
      id: number;
      path: string;
      title: string;
      auth_required: boolean;
      description: string;
    }>("SELECT id, path, title, auth_required, description FROM routes ORDER BY id");

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
  const parsed = await parseBody(request, routesArraySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const routes = parsed.data;

  try {
    await execute("DELETE FROM routes");

    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      await executePrepared(
        "INSERT INTO routes (id, path, title, auth_required, description) VALUES ($id, $path, $title, $auth, $desc)",
        { $id: i + 1, $path: r.path, $title: r.title, $auth: r.authRequired, $desc: r.description },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update routes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
