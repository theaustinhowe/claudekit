import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
}));
vi.mock("@/lib/services/dev-server-manager", () => ({
  start: vi.fn(),
  getStatus: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
}));

import { getGeneratorProject } from "@/lib/actions/generator-projects";
import * as devServerManager from "@/lib/services/dev-server-manager";
import { DELETE, GET, POST } from "./route";

const mockGetGeneratorProject = vi.mocked(getGeneratorProject);
const mockStart = vi.mocked(devServerManager.start);
const mockGetStatus = vi.mocked(devServerManager.getStatus);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/projects/[projectId]/dev-server", () => {
  it("starts a dev server", async () => {
    mockGetGeneratorProject.mockResolvedValue({
      project_path: "/projects",
      project_name: "app",
      package_manager: "pnpm",
    } as never);
    mockStart.mockResolvedValue({ port: 3000 } as never);
    mockGetStatus.mockReturnValue({ running: true } as never);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.port).toBe(3000);
    expect(data.status).toBe("running");
  });

  it("returns 404 when project not found", async () => {
    mockGetGeneratorProject.mockResolvedValue(null as never);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});

describe("GET /api/projects/[projectId]/dev-server", () => {
  it("returns server status", async () => {
    mockGetStatus.mockReturnValue({ running: true, port: 3000, pid: 1234, logs: [] } as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.running).toBe(true);
  });

  it("returns not running when no status", async () => {
    mockGetStatus.mockReturnValue(null as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.running).toBe(false);
  });
});

describe("DELETE /api/projects/[projectId]/dev-server", () => {
  it("stops the dev server", async () => {
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
