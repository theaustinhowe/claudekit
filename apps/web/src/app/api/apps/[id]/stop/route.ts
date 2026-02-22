import { NextResponse } from "next/server";

const DAEMON_CONTROL_URL = "http://localhost:2999";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${DAEMON_CONTROL_URL}/stop/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Daemon not reachable" }, { status: 503 });
  }
}
