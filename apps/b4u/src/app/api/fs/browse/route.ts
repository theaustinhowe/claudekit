import { stat } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import { readDirectory } from "@/lib/fs/scanner";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");

  if (!path) {
    // Default to home directory
    const homePath = process.env.HOME || "/";
    const entries = await readDirectory(homePath);
    return NextResponse.json({ path: homePath, entries });
  }

  // Validate path exists and is a directory
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Path not found" }, { status: 404 });
  }

  const entries = await readDirectory(path);
  return NextResponse.json({ path, entries });
}
