import { type NextRequest, NextResponse } from "next/server";
import { exportJSON, exportMarkdown, exportPRDescription } from "@/lib/services/reporter";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json";
  const scanId = searchParams.get("scanId") || undefined;

  let content: string;

  switch (format) {
    case "markdown":
      content = await exportMarkdown(scanId);
      break;
    case "pr":
      content = await exportPRDescription(scanId);
      break;
    default:
      content = await exportJSON(scanId);
      break;
  }

  if (format === "json") {
    return NextResponse.json(JSON.parse(content));
  }

  return new Response(content, {
    headers: {
      "Content-Type": format === "markdown" || format === "pr" ? "text/markdown" : "application/json",
    },
  });
}
