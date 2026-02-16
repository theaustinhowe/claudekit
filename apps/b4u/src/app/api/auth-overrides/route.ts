import { type NextRequest, NextResponse } from "next/server";
import { executePrepared, query } from "@/lib/db";
import { parseBody, togglePatchSchema } from "@/lib/validations";

export async function GET() {
  try {
    const rows = await query<{
      id: string;
      label: string;
      enabled: boolean;
    }>("SELECT id, label, enabled FROM auth_overrides");

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
  const { id, enabled } = parsed.data;

  try {
    await executePrepared("UPDATE auth_overrides SET enabled = $enabled WHERE id = $id", {
      $id: id,
      $enabled: enabled,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update auth override:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
