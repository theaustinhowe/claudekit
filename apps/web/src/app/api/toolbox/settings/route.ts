import { type NextRequest, NextResponse } from "next/server";
import { readToolboxSettings, writeToolboxSettings } from "@/lib/toolbox-settings";

export async function GET() {
  const toolIds = readToolboxSettings();
  return NextResponse.json({ toolIds });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { toolIds } = body as { toolIds: string[] };

    if (!Array.isArray(toolIds)) {
      return NextResponse.json({ error: "toolIds must be an array" }, { status: 400 });
    }

    writeToolboxSettings(toolIds);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
