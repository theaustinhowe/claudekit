import path from "node:path";
import { NextResponse } from "next/server";
import { deleteGeneratorProject, getGeneratorProject } from "@/lib/actions/generator-projects";
import * as devServerManager from "@/lib/services/dev-server-manager";
import { expandTilde, removeDirectory } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;

  try {
    const project = await getGeneratorProject(projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    devServerManager.stop(projectId);
    await removeDirectory(path.join(expandTilde(project.project_path), project.project_name));
    await deleteGeneratorProject(projectId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 });
  }
}
