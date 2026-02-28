import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fs/scanner", () => ({
  buildFileTree: vi.fn(),
  detectFramework: vi.fn(),
  detectAuth: vi.fn(),
  detectDatabase: vi.fn(),
  detectKeyDirectories: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { POST } from "@/app/api/fs/tree/route";
import { buildFileTree, detectAuth, detectDatabase, detectFramework, detectKeyDirectories } from "@/lib/fs/scanner";

const mockBuildFileTree = vi.mocked(buildFileTree);
const mockDetectFramework = vi.mocked(detectFramework);
const mockDetectAuth = vi.mocked(detectAuth);
const mockDetectDatabase = vi.mocked(detectDatabase);
const mockDetectKeyDirectories = vi.mocked(detectKeyDirectories);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/fs/tree", () => {
  it("returns project analysis", async () => {
    mockBuildFileTree.mockResolvedValue(cast([{ name: "src", children: [] }]));
    mockDetectFramework.mockResolvedValue(cast("next"));
    mockDetectAuth.mockResolvedValue(cast("next-auth"));
    mockDetectDatabase.mockResolvedValue(cast("postgres"));
    mockDetectKeyDirectories.mockResolvedValue(cast(["src", "public"]));

    const req = new Request("http://localhost/api/fs/tree", {
      method: "POST",
      body: JSON.stringify({ path: "/projects/app" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("app");
    expect(data.path).toBe("/projects/app");
    expect(data.framework).toBe("next");
    expect(data.auth).toBe("next-auth");
    expect(data.database).toBe("postgres");
    expect(data.tree).toHaveLength(1);
  });

  it("returns 400 when path is missing", async () => {
    const req = new Request("http://localhost/api/fs/tree", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("path is required");
  });

  it("returns 500 on scan failure", async () => {
    mockBuildFileTree.mockRejectedValue(new Error("Permission denied"));
    mockDetectFramework.mockResolvedValue(cast(null));
    mockDetectAuth.mockResolvedValue(cast(null));
    mockDetectDatabase.mockResolvedValue(cast(null));
    mockDetectKeyDirectories.mockResolvedValue(cast([]));

    const req = new Request("http://localhost/api/fs/tree", {
      method: "POST",
      body: JSON.stringify({ path: "/restricted" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Permission denied");
  });
});
