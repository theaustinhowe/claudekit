import { NextResponse } from "next/server";
import { type MaturityData, readMaturity, writeMaturity } from "@/lib/maturity";

export async function GET() {
  return NextResponse.json(readMaturity());
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as MaturityData;
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid maturity format" }, { status: 400 });
    }
    writeMaturity(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
