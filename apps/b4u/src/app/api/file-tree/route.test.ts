import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import { GET, PUT } from "@/app/api/file-tree/route";
import { execute, queryOne } from "@/lib/db";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/file-tree?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/file-tree", () => {
  it("returns the parsed file tree from run_content", async () => {
    const tree = { name: "root", type: "directory", children: [{ name: "src", type: "directory" }] };
    mockQueryOne.mockResolvedValue({ data_json: JSON.stringify(tree) } as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(tree);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/file-tree"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns 404 when no file tree exists", async () => {
    mockQueryOne.mockResolvedValue(null as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("File tree not found");
  });

  it("returns 500 on database error", async () => {
    mockQueryOne.mockRejectedValue(new Error("DB connection failed"));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});

describe("PUT /api/file-tree", () => {
  it("saves file tree to run_content", async () => {
    mockExecute.mockResolvedValue(undefined as never);

    const req = new NextRequest("http://localhost/api/file-tree?runId=run-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tree: [{ name: "src", type: "directory" }],
        name: "my-project",
      }),
    });

    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      "DELETE FROM run_content WHERE run_id = ? AND content_type = 'file_tree'",
      ["run-1"],
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO run_content"),
      expect.any(Array),
    );
  });

  it("returns 400 when runId is missing", async () => {
    const req = new NextRequest("http://localhost/api/file-tree", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree: [] }),
    });

    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns 400 when tree is missing", async () => {
    const req = new NextRequest("http://localhost/api/file-tree?runId=run-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "project" }),
    });

    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("tree required");
  });

  it("uses 'root' as default name", async () => {
    mockExecute.mockResolvedValue(undefined as never);

    const req = new NextRequest("http://localhost/api/file-tree?runId=run-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree: [] }),
    });

    const response = await PUT(req);
    expect(response.status).toBe(200);
  });

  it("returns 500 on database error", async () => {
    mockExecute.mockRejectedValue(new Error("DB error"));

    const req = new NextRequest("http://localhost/api/file-tree?runId=run-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree: [{ name: "x", type: "file" }] }),
    });

    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
