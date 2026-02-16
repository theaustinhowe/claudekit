import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_TOOLS, getToolById } from "@/lib/constants/tools";
import { checkTools } from "@/lib/services/tool-checker";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const toolIds: string[] = body.toolIds;

    if (!Array.isArray(toolIds) || toolIds.length === 0) {
      return NextResponse.json({ error: "toolIds must be a non-empty array" }, { status: 400 });
    }

    // Cap at total available tools to prevent abuse
    if (toolIds.length > DEFAULT_TOOLS.length) {
      return NextResponse.json({ error: "Too many tool IDs" }, { status: 400 });
    }

    const tools = toolIds.map((id) => getToolById(id)).filter(Boolean) as NonNullable<ReturnType<typeof getToolById>>[];

    if (tools.length === 0) {
      return NextResponse.json({ error: "No valid tool IDs provided" }, { status: 400 });
    }

    const results = await checkTools(tools);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
