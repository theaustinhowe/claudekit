import { type NextRequest, NextResponse } from "next/server";
import { getToolById } from "@/lib/constants/tools";
import { runCommand } from "@/lib/services/process-runner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { toolId, action, installMethod } = body as {
      toolId: string;
      action: "install" | "update";
      installMethod?: string;
    };

    if (!toolId || !action) {
      return NextResponse.json({ error: "toolId and action are required" }, { status: 400 });
    }

    const tool = getToolById(toolId);
    if (!tool) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    let command: string | undefined;
    const brewName = tool.brewPackage ?? tool.binary;
    if (installMethod === "homebrew") {
      command = action === "update" ? `brew upgrade ${brewName}` : `brew install ${brewName}`;
    } else {
      command = action === "update" ? (tool.updateCommand ?? tool.installCommand) : tool.installCommand;
    }

    if (!command) {
      return NextResponse.json({ error: "No command available for this tool" }, { status: 400 });
    }

    const stream = runCommand(command);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
