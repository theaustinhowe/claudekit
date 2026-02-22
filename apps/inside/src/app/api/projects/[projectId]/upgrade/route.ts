import { NextResponse } from "next/server";
import { getGeneratorProject } from "@/lib/actions/generator-projects";
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

  return NextResponse.json({
    status: project.status,
    tasks,
  });
}
