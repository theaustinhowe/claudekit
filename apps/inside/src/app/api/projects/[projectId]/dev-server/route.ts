import path from "node:path";
import { NextResponse } from "next/server";
import { getGeneratorProject, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { PLATFORMS_WITH_DEV_SERVER } from "@/lib/constants";
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

    // Non-server platforms (CLI tools, games, etc.) don't have dev servers
    if (!PLATFORMS_WITH_DEV_SERVER.has(project.platform)) {
      return NextResponse.json({ port: 0, status: "not-applicable" });
    }

    // 1. Already tracked in memory?
    const existing = devServerManager.getStatus(projectId);
    if (existing?.running) {
      return NextResponse.json({ port: existing.port, status: "running" });
    }

    // 2. Check DB for orphaned server
    if (project.dev_server_port && project.dev_server_pid) {
      const alive = devServerManager.isProcessAlive(project.dev_server_pid);
      const listening = alive && (await devServerManager.probePort(project.dev_server_port));

      if (alive && listening) {
        devServerManager.adopt(projectId, project.dev_server_port, project.dev_server_pid);
        return NextResponse.json({ port: project.dev_server_port, status: "running" });
      }
      // Stale — clean up
      await updateGeneratorProject(projectId, { dev_server_port: null, dev_server_pid: null });
    }

    // 3. Start fresh, preferring last-known port
    const projectDir = path.join(expandTilde(project.project_path), project.project_name);
    const { port } = await devServerManager.start(
      projectId,
      projectDir,
      project.package_manager,
      project.platform,
      project.dev_server_port ?? undefined,
    );

    // 4. Persist new port+pid
    const status = devServerManager.getStatus(projectId);
    if (status?.running && status.pid > 0) {
      await updateGeneratorProject(projectId, {
        dev_server_port: status.port,
        dev_server_pid: status.pid,
      });
    }

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
  await updateGeneratorProject(projectId, { dev_server_port: null, dev_server_pid: null });
  return NextResponse.json({ success: true });
}
