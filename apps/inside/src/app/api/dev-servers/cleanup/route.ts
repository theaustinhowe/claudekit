import { NextResponse } from "next/server";
import { updateGeneratorProject } from "@/lib/actions/generator-projects";
import * as devServerManager from "@/lib/services/dev-server-manager";

export async function GET() {
  const servers = devServerManager.listAll();
  return NextResponse.json({ servers });
}

export async function POST() {
  const servers = devServerManager.listAll();
  const stopped = devServerManager.stopAll();
  await Promise.all(
    servers.map((s) => updateGeneratorProject(s.projectId, { dev_server_port: null, dev_server_pid: null })),
  );
  return NextResponse.json({ stopped });
}
