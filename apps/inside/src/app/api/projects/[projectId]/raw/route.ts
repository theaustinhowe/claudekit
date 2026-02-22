import fs from "node:fs/promises";
import nodePath from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { getGeneratorProject } from "@/lib/actions/generator-projects";
import { IMAGE_MIME_TYPES } from "@/lib/constants";
import { expandTilde } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { projectId } = await params;
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  const ext = nodePath.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[ext];
  if (!mimeType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const project = await getGeneratorProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const projectDir = nodePath.join(expandTilde(project.project_path), project.project_name);

  // Security: reject absolute paths and traversal sequences before resolution
  if (nodePath.isAbsolute(filePath) || filePath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  const fullPath = nodePath.join(projectDir, filePath);
  const resolvedFull = nodePath.resolve(fullPath);
  const resolvedProject = nodePath.resolve(projectDir);

  // Security: prevent path traversal
  if (!resolvedFull.startsWith(resolvedProject + nodePath.sep) && resolvedFull !== resolvedProject) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  try {
    const data = await fs.readFile(fullPath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
