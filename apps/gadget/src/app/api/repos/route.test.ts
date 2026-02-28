import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
}));
vi.mock("@/lib/actions/repos", () => ({
  deleteRepos: vi.fn(),
}));

import { NextRequest } from "next/server";
import { deleteRepos } from "@/lib/actions/repos";
import { execute, queryAll } from "@/lib/db";
import { DELETE, GET, POST } from "./route";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);
const mockDeleteRepos = vi.mocked(deleteRepos);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/repos", () => {
  it("returns repos with finding counts", async () => {
    mockQueryAll.mockResolvedValue(
      cast([{ id: "r1", name: "my-repo", critical_count: 2, warning_count: 5, info_count: 1 }]),
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].critical_count).toBe(2);
  });
});

describe("POST /api/repos", () => {
  it("creates a repo and returns id", async () => {
    mockExecute.mockResolvedValue(cast(undefined));

    const req = new NextRequest("http://localhost/api/repos", {
      method: "POST",
      body: JSON.stringify({ name: "new-repo", local_path: "/projects/new-repo" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.id).toBe("test-id");
    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO repos"), expect.any(Array));
  });
});

describe("DELETE /api/repos", () => {
  it("deletes a repo by id", async () => {
    mockDeleteRepos.mockResolvedValue(cast(undefined));

    const req = new NextRequest("http://localhost/api/repos?id=r1", { method: "DELETE" });
    const response = await DELETE(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockDeleteRepos).toHaveBeenCalledWith(["r1"]);
  });

  it("returns 400 when id missing", async () => {
    const req = new NextRequest("http://localhost/api/repos", { method: "DELETE" });
    const response = await DELETE(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing id");
  });
});
