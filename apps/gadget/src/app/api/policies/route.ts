import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import { generateId, nowTimestamp, parsePolicy } from "@/lib/utils";

export async function GET() {
  const db = await getDb();
  const rows = await queryAll<Record<string, unknown>>(db, "SELECT * FROM policies ORDER BY created_at DESC");
  return NextResponse.json(rows.map(parsePolicy));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const db = await getDb();
  const id = generateId();

  await execute(
    db,
    `
    INSERT INTO policies (id, name, description, expected_versions, banned_dependencies, allowed_package_managers, preferred_package_manager, ignore_patterns, generator_defaults)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      id,
      body.name,
      body.description || null,
      JSON.stringify(body.expected_versions || {}),
      JSON.stringify(body.banned_dependencies || []),
      JSON.stringify(body.allowed_package_managers || []),
      body.preferred_package_manager || "pnpm",
      JSON.stringify(body.ignore_patterns || []),
      JSON.stringify(body.generator_defaults || {}),
    ],
  );

  return NextResponse.json({ id }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = await getDb();

  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await execute(
    db,
    `
    UPDATE policies
    SET name = ?, description = ?, expected_versions = ?, banned_dependencies = ?,
        allowed_package_managers = ?, preferred_package_manager = ?,
        ignore_patterns = ?, generator_defaults = ?, updated_at = ?
    WHERE id = ?
  `,
    [
      body.name,
      body.description || null,
      JSON.stringify(body.expected_versions || {}),
      JSON.stringify(body.banned_dependencies || []),
      JSON.stringify(body.allowed_package_managers || []),
      body.preferred_package_manager || "pnpm",
      JSON.stringify(body.ignore_patterns || []),
      JSON.stringify(body.generator_defaults || {}),
      nowTimestamp(),
      body.id,
    ],
  );

  return NextResponse.json({ success: true });
}
