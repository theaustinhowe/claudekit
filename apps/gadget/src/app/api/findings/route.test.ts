import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
}));

import { NextRequest } from "next/server";
import { queryAll } from "@/lib/db";
import { GET } from "./route";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/findings", () => {
  it("returns all findings with parsed suggested_actions", async () => {
    mockQueryAll.mockResolvedValue([{ id: "f1", severity: "critical", suggested_actions: '["fix it"]' }] as never);

    const req = new NextRequest("http://localhost/api/findings");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].suggested_actions).toEqual(["fix it"]);
  });

  it("filters by repoId", async () => {
    mockQueryAll.mockResolvedValue([] as never);

    const req = new NextRequest("http://localhost/api/findings?repoId=r1");
    await GET(req);

    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      expect.stringContaining("repo_id = ?"),
      expect.arrayContaining(["r1"]),
    );
  });

  it("filters by severity", async () => {
    mockQueryAll.mockResolvedValue([] as never);

    const req = new NextRequest("http://localhost/api/findings?severity=warning");
    await GET(req);

    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      expect.stringContaining("severity = ?"),
      expect.arrayContaining(["warning"]),
    );
  });
});
