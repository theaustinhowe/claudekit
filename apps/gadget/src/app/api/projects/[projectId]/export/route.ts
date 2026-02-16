import { type NextRequest, NextResponse } from "next/server";
import { getGeneratorProject, getMockData, getUiSpec, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { execute, getDb } from "@/lib/db";
import { generateExportFiles, writeExportToDisk } from "@/lib/services/spec-exporter";
import { generateId, nowTimestamp } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { projectId } = await params;

  try {
    const project = await getGeneratorProject(projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const spec = body.spec || (await getUiSpec(projectId));
    const mockData = body.mockData || (await getMockData(projectId, project.active_spec_version || 1));

    if (!spec) {
      return NextResponse.json({ error: "No spec found to export" }, { status: 400 });
    }

    // Lock the project
    await updateGeneratorProject(projectId, { status: "locked" });

    // Generate files
    const files = generateExportFiles(project, spec, mockData);

    // Write to disk
    const { filesWritten, fullPath } = await writeExportToDisk(project.project_path, project.project_name, files, true);

    // Create backward-compatible generator_runs record
    const db = await getDb();
    const runId = generateId();
    await execute(
      db,
      `INSERT INTO generator_runs (id, template_id, policy_id, intent, project_name, project_path, package_manager, features, status, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'done', ?)`,
      [
        runId,
        project.template_id,
        project.policy_id,
        project.idea_description,
        project.project_name,
        project.project_path,
        project.package_manager,
        JSON.stringify(project.services),
        nowTimestamp(),
      ],
    );

    // Mark as exported
    await updateGeneratorProject(projectId, {
      status: "exported",
      exported_at: nowTimestamp(),
    });

    return NextResponse.json({
      success: true,
      filesCreated: filesWritten,
      projectPath: fullPath,
    });
  } catch (err) {
    await updateGeneratorProject(projectId, { status: "designing" }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 500 });
  }
}
