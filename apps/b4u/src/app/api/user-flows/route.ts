import { type NextRequest, NextResponse } from "next/server";
import { execute, executePrepared, query } from "@/lib/db";
import { parseBody, userFlowsArraySchema } from "@/lib/validations";

export async function GET() {
  try {
    const rows = await query<{
      id: string;
      name: string;
      steps: string[];
    }>("SELECT id, name, steps FROM user_flows");

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
    await execute("DELETE FROM user_flows");

    for (const flow of flows) {
      // Escape backslashes and single quotes for DuckDB array literal
      const stepsArray = flow.steps.map((s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`).join(", ");
      await executePrepared(`INSERT INTO user_flows (id, name, steps) VALUES ($id, $name, [${stepsArray}])`, {
        $id: flow.id,
        $name: flow.name,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update user flows:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
