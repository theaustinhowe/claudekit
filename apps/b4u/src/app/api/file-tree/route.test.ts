import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

import { GET, PUT } from "@/app/api/file-tree/route";
import { execute, query } from "@/lib/db";

const mockQuery = vi.mocked(query);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/file-tree", () => {
  it("returns the parsed file tree", async () => {
    const tree = { name: "root", type: "directory", children: [{ name: "src", type: "directory" }] };
    mockQuery.mockResolvedValue([{ tree_json: JSON.stringify(tree) }] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(tree);
  });

  it("returns 404 when no file tree exists", async () => {
    mockQuery.mockResolvedValue([] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("File tree not found");
  });

  it("returns 500 on corrupt JSON in database", async () => {
    mockQuery.mockResolvedValue([{ tree_json: "not valid json{{{" }] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Corrupt file tree data");
  });

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValue(new Error("DB connection failed"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});

describe("PUT /api/file-tree", () => {
  it("saves file tree to database", async () => {
    mockExecute.mockResolvedValue(undefined);

    const req = new Request("http://localhost/api/file-tree", {
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
    expect(mockExecute).toHaveBeenCalledWith("DELETE FROM file_tree");
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO file_tree"));
  });

  it("returns 400 when tree is missing", async () => {
    const req = new Request("http://localhost/api/file-tree", {
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
    mockExecute.mockResolvedValue(undefined);

    const req = new Request("http://localhost/api/file-tree", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree: [] }),
    });

    const response = await PUT(req);
    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('"root"'));
  });

  it("returns 500 on database error", async () => {
    mockExecute.mockRejectedValue(new Error("DB error"));

    const req = new Request("http://localhost/api/file-tree", {
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
