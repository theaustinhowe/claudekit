import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/actions/repos", () => ({
  deleteRepos: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
  removeDirectory: vi.fn(),
}));

import { deleteRepos } from "@/lib/actions/repos";
import { queryOne } from "@/lib/db";
import { removeDirectory } from "@/lib/utils";
import { DELETE } from "./route";

const mockQueryOne = vi.mocked(queryOne);
const mockDeleteRepos = vi.mocked(deleteRepos);
const mockRemoveDirectory = vi.mocked(removeDirectory);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/repos/[repoId]", () => {
  it("deletes repo, removes directory, and cleans DB", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/projects/repo" } as never);
    mockRemoveDirectory.mockResolvedValue(undefined as never);
    mockDeleteRepos.mockResolvedValue(undefined as never);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ repoId: "r1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRemoveDirectory).toHaveBeenCalledWith("/projects/repo");
    expect(mockDeleteRepos).toHaveBeenCalledWith(["r1"]);
  });

  it("returns 404 when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined as never);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ repoId: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 500 on delete failure", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/projects/repo" } as never);
    mockRemoveDirectory.mockRejectedValue(new Error("Permission denied"));

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ repoId: "r1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Permission denied");
  });
});
