import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
  deleteGeneratorProject: vi.fn(),
}));
vi.mock("@/lib/services/dev-server-manager", () => ({
  stop: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
  removeDirectory: vi.fn(),
}));

import { deleteGeneratorProject, getGeneratorProject } from "@/lib/actions/generator-projects";
import { removeDirectory } from "@/lib/utils";
import { DELETE } from "./route";

const mockGetGeneratorProject = vi.mocked(getGeneratorProject);
const mockDeleteGeneratorProject = vi.mocked(deleteGeneratorProject);
const mockRemoveDirectory = vi.mocked(removeDirectory);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/projects/[projectId]", () => {
  it("deletes a project", async () => {
    mockGetGeneratorProject.mockResolvedValue({
      project_path: "/projects",
      project_name: "my-app",
    } as never);
    mockRemoveDirectory.mockResolvedValue(undefined as never);
    mockDeleteGeneratorProject.mockResolvedValue(undefined as never);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 404 when project not found", async () => {
    mockGetGeneratorProject.mockResolvedValue(null as never);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 500 on delete failure", async () => {
    mockGetGeneratorProject.mockResolvedValue({
      project_path: "/projects",
      project_name: "app",
    } as never);
    mockRemoveDirectory.mockRejectedValue(new Error("EPERM"));

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("EPERM");
  });
});
