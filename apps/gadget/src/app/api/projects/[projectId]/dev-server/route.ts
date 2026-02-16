import path from "node:path";
import { NextResponse } from "next/server";
import { getGeneratorProject } from "@/lib/actions/generator-projects";
import * as devServerManager from "@/lib/services/dev-server-manager";
import { expandTilde } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;

  try {
    const project = await getGeneratorProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectDir = path.join(expandTilde(project.project_path), project.project_name);
    const { port } = await devServerManager.start(projectId, projectDir, project.package_manager);
    const status = devServerManager.getStatus(projectId);

    return NextResponse.json({ port, status: status?.running ? "running" : "starting" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start dev server" },
      { status: 500 },
    );
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;

  const status = devServerManager.getStatus(projectId);
  if (!status) {
    return NextResponse.json({ running: false, port: null, pid: null, logs: [] });
  }

  return NextResponse.json(status);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;

  devServerManager.stop(projectId);
  return NextResponse.json({ success: true });
}
