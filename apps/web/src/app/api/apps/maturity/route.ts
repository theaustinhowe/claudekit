import { NextResponse } from "next/server";
import { readMaturityOverrides, writeMaturityOverrides } from "@/lib/maturity";

export async function GET() {
  return NextResponse.json(readMaturityOverrides());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected an object" }, { status: 400 });
  }
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== "number" || value < 0 || value > 100) {
      return NextResponse.json({ error: `Invalid value for "${key}": must be a number 0-100` }, { status: 400 });
    }
  }
  writeMaturityOverrides(body as Record<string, number>);
  return NextResponse.json({ ok: true });
}
