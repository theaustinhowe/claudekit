import { type NextRequest, NextResponse } from "next/server";
import { restoreApplyRun } from "@/lib/actions/fixes";

export async function POST(request: NextRequest) {
  const { runId } = await request.json();

  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 });
  }

  const result = await restoreApplyRun(runId);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
