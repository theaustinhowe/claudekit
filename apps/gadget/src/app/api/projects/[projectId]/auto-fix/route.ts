import { NextResponse } from "next/server";
import { getAutoFixEnabled, getAutoFixHistory, setAutoFixEnabled } from "@/lib/actions/auto-fix";
import * as autoFix from "@/lib/services/auto-fix-engine";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [enabled, history] = await Promise.all([getAutoFixEnabled(projectId), getAutoFixHistory(projectId, 10)]);
  const state = autoFix.getState(projectId);

  return NextResponse.json({
    enabled,
    status: state.status,
    currentRun: state.currentRun,
    history,
    consecutiveFailures: state.consecutiveFailures,
    cooldownUntil: state.cooldownUntil,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = await req.json();
  const action = body.action as string;

  if (action === "enable") {
    const projectDir = body.projectDir as string;
    if (!projectDir) {
      return NextResponse.json({ error: "projectDir required" }, { status: 400 });
    }
    await setAutoFixEnabled(projectId, true);
    autoFix.enable(projectId, projectDir);
    return NextResponse.json({ enabled: true });
  }

  if (action === "disable") {
    await setAutoFixEnabled(projectId, false);
    autoFix.disable(projectId);
    return NextResponse.json({ enabled: false });
  }

  if (action === "trigger") {
    const errorMessage = body.errorMessage as string | undefined;
    autoFix.manualTrigger(projectId, errorMessage);
    return NextResponse.json({ triggered: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  autoFix.cancelCurrentFix(projectId);
  return NextResponse.json({ cancelled: true });
}
