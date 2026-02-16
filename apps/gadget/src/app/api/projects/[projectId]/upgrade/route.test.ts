import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
}));
vi.mock("@/lib/actions/upgrade-tasks", () => ({
  getUpgradeTasks: vi.fn(),
}));

import { getGeneratorProject } from "@/lib/actions/generator-projects";
import { getUpgradeTasks } from "@/lib/actions/upgrade-tasks";
import { GET } from "./route";

const mockGetGeneratorProject = vi.mocked(getGeneratorProject);
const mockGetUpgradeTasks = vi.mocked(getUpgradeTasks);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/projects/[projectId]/upgrade", () => {
  it("returns upgrade state with tasks", async () => {
    mockGetGeneratorProject.mockResolvedValue({
      status: "designing",
      repo_id: "r1",
    } as never);
    mockGetUpgradeTasks.mockResolvedValue([{ id: "t1", status: "pending" }] as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("designing");
    expect(data.tasks).toHaveLength(1);
  });

  it("returns 404 when project not found", async () => {
    mockGetGeneratorProject.mockResolvedValue(null as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});
