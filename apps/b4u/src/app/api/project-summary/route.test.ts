import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { GET } from "@/app/api/project-summary/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/project-summary?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/project-summary", () => {
  it("returns project summary with mapped fields", async () => {
    mockQueryAll.mockResolvedValue([
      {
        name: "My App",
        framework: "Next.js",
        directories: ["src", "public"],
        auth: "NextAuth",
        database_info: "PostgreSQL",
      },
    ] as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("My App");
    expect(data.database).toBe("PostgreSQL");
    expect(data.directories).toEqual(["src", "public"]);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/project-summary"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns 404 when no summary exists", async () => {
    mockQueryAll.mockResolvedValue([] as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("Project summary not found");
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
