import { getClaudeRateLimits } from "@devkit/claude-usage/server";
import { NextResponse } from "next/server";

export async function GET() {
  const rateLimits = await getClaudeRateLimits();
  return NextResponse.json({ rateLimits });
}
