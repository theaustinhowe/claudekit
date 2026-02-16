import { NextResponse } from "next/server";
import { getClaudeRateLimits } from "@/lib/services/claude-usage-api";

export async function GET() {
  const rateLimits = await getClaudeRateLimits();
  return NextResponse.json({ rateLimits });
}
