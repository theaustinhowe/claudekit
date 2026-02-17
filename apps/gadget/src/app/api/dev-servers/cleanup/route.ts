import { NextResponse } from "next/server";
import * as devServerManager from "@/lib/services/dev-server-manager";

export async function GET() {
  const servers = devServerManager.listAll();
  return NextResponse.json({ servers });
}

export async function POST() {
  const stopped = devServerManager.stopAll();
  return NextResponse.json({ stopped });
}
