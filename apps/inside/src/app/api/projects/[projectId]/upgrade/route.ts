import { NextResponse } from "next/server";
import { getGeneratorProject } from "@/lib/actions/generator-projects";
import { getUpgradeTaskLogs } from "@/lib/actions/sessions";
import { getUpgradeTasks } from "@/lib/actions/upgrade-tasks";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

// ---------------------------------------------------------------------------
// GET — Return current upgrade state
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;

  const project = await getGeneratorProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const tasks = await getUpgradeTasks(projectId);

  // Fetch persisted session logs for completed/failed tasks
  const finishedTaskIds = tasks.filter((t) => t.status === "completed" || t.status === "failed").map((t) => t.id);
  const taskLogs = await getUpgradeTaskLogs(projectId, finishedTaskIds);

  return NextResponse.json({
    status: project.status,
    tasks,
    taskLogs,
  });
}
