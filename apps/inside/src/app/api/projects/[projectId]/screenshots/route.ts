import { NextResponse } from "next/server";
import { getGeneratorProject } from "@/lib/actions/generator-projects";
import { getProjectScreenshots, saveScreenshot } from "@/lib/actions/screenshots";
import { captureScreenshot } from "@/lib/services/screenshot-service";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

// GET — list screenshots for a project
export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;

  const project = await getGeneratorProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const screenshots = await getProjectScreenshots(projectId);
  return NextResponse.json({ screenshots });
}

// POST — trigger a new screenshot capture
export async function POST(request: Request, { params }: RouteContext) {
  const { projectId } = await params;

  const project = await getGeneratorProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let port: number;
  let label: string | undefined;
  let messageId: string | undefined;

  try {
    const body = await request.json();
    port = body.port;
    label = body.label;
    messageId = body.messageId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!port) {
    return NextResponse.json({ error: "Port is required" }, { status: 400 });
  }

  const result = await captureScreenshot(projectId, port);

  if (!result) {
    return NextResponse.json({ error: "Screenshot capture failed" }, { status: 500 });
  }

  const screenshot = await saveScreenshot({
    project_id: projectId,
    file_path: result.filePath,
    label,
    width: result.width,
    height: result.height,
    file_size: result.fileSize,
    message_id: messageId,
  });

  return NextResponse.json({ screenshot });
}
