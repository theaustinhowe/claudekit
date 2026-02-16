import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/services/apply-engine", () => ({
  applyFixes: vi.fn(),
}));

import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";
import { applyFixes } from "@/lib/services/apply-engine";
import { POST } from "./route";

const mockQueryOne = vi.mocked(queryOne);
const mockApplyFixes = vi.mocked(applyFixes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/fixes/apply", () => {
  it("applies fixes to a repo", async () => {
    mockQueryOne.mockResolvedValue({ id: "r1", local_path: "/projects/repo" } as never);
    mockApplyFixes.mockResolvedValue({ applied: 2, failed: 0 } as never);

    const req = new NextRequest("http://localhost/api/fixes/apply", {
      method: "POST",
      body: JSON.stringify({ repoId: "r1", fixActionIds: ["f1", "f2"] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.applied).toBe(2);
    expect(mockApplyFixes).toHaveBeenCalledWith(expect.objectContaining({ repoId: "r1", fixActionIds: ["f1", "f2"] }));
  });

  it("returns 400 when repoId missing", async () => {
    const req = new NextRequest("http://localhost/api/fixes/apply", {
      method: "POST",
      body: JSON.stringify({ fixActionIds: ["f1"] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing");
  });

  it("returns 404 when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);

    const req = new NextRequest("http://localhost/api/fixes/apply", {
      method: "POST",
      body: JSON.stringify({ repoId: "r1", fixActionIds: ["f1"] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});
