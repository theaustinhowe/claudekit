import { type NextRequest, NextResponse } from "next/server";
import { deleteRepos } from "@/lib/actions/repos";
import { getDb } from "@/lib/db";
import { execute, queryAll } from "@/lib/db/helpers";
import { generateId } from "@/lib/utils";

export async function GET() {
  const db = await getDb();
  const repos = await queryAll(
    db,
    `
    SELECT r.*,
      (SELECT COUNT(*) FROM findings f WHERE f.repo_id = r.id AND f.severity = 'critical') as critical_count,
      (SELECT COUNT(*) FROM findings f WHERE f.repo_id = r.id AND f.severity = 'warning') as warning_count,
      (SELECT COUNT(*) FROM findings f WHERE f.repo_id = r.id AND f.severity = 'info') as info_count
    FROM repos r
    ORDER BY r.created_at DESC
  `,
  );

  return NextResponse.json(repos);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const db = await getDb();
  const id = generateId();

  await execute(
    db,
    `
    INSERT INTO repos (id, name, local_path, git_remote, default_branch, package_manager, repo_type, is_monorepo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      id,
      body.name,
      body.local_path,
      body.git_remote || null,
      body.default_branch || "main",
      body.package_manager || null,
      body.repo_type || null,
      body.is_monorepo ? "true" : "false",
    ],
  );

  return NextResponse.json({ id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await deleteRepos([id]);

  return NextResponse.json({ success: true });
}
