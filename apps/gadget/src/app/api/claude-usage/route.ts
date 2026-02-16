import { NextResponse } from "next/server";
import { getClaudeRateLimits } from "@devkit/claude-usage/server";

export async function GET() {
  const rateLimits = await getClaudeRateLimits();
  return NextResponse.json({ rateLimits });
}
