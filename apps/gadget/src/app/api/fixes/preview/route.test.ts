import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryOne: vi.fn(),
}));

import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";
import { GET } from "./route";

const mockQueryOne = vi.mocked(queryOne);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/fixes/preview", () => {
  it("returns fix preview data", async () => {
    mockQueryOne.mockResolvedValue(
      cast({
        id: "fix-1",
        title: "Fix import",
        diff_file: "src/index.ts",
        diff_before: "old code",
        diff_after: "new code",
      }),
    );

    const req = new NextRequest("http://localhost/api/fixes/preview?id=fix-1");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.title).toBe("Fix import");
    expect(data.diff_file).toBe("src/index.ts");
  });

  it("returns 400 when id missing", async () => {
    const req = new NextRequest("http://localhost/api/fixes/preview");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing fix id");
  });

  it("returns 404 when fix not found", async () => {
    mockQueryOne.mockResolvedValue(cast(undefined));

    const req = new NextRequest("http://localhost/api/fixes/preview?id=nonexistent");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});
