import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
}));
vi.mock("@/lib/actions/screenshots", () => ({
  getProjectScreenshots: vi.fn(),
  saveScreenshot: vi.fn(),
}));
vi.mock("@/lib/services/screenshot-service", () => ({
  captureScreenshot: vi.fn(),
}));

import { getGeneratorProject } from "@/lib/actions/generator-projects";
import { getProjectScreenshots, saveScreenshot } from "@/lib/actions/screenshots";
import { captureScreenshot } from "@/lib/services/screenshot-service";
import { GET, POST } from "./route";

const mockGetGeneratorProject = vi.mocked(getGeneratorProject);
const mockGetProjectScreenshots = vi.mocked(getProjectScreenshots);
const mockCaptureScreenshot = vi.mocked(captureScreenshot);
const mockSaveScreenshot = vi.mocked(saveScreenshot);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/projects/[projectId]/screenshots", () => {
  it("returns screenshots for a project", async () => {
    mockGetGeneratorProject.mockResolvedValue({ id: "p1" } as never);
    mockGetProjectScreenshots.mockResolvedValue([{ id: "s1", file_path: "/screenshots/s1.png" }] as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.screenshots).toHaveLength(1);
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

describe("POST /api/projects/[projectId]/screenshots", () => {
  it("captures and saves a screenshot", async () => {
    mockGetGeneratorProject.mockResolvedValue({ id: "p1" } as never);
    mockCaptureScreenshot.mockResolvedValue({
      filePath: "/screenshots/new.png",
      width: 1280,
      height: 720,
      fileSize: 50000,
    } as never);
    mockSaveScreenshot.mockResolvedValue({ id: "s2" } as never);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ port: 3000, label: "homepage" }),
    });

    const response = await POST(req, { params: Promise.resolve({ projectId: "p1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.screenshot).toBeDefined();
  });

  it("returns 400 when port is missing", async () => {
    mockGetGeneratorProject.mockResolvedValue({ id: "p1" } as never);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req, { params: Promise.resolve({ projectId: "p1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Port is required");
  });

  it("returns 500 when screenshot capture fails", async () => {
    mockGetGeneratorProject.mockResolvedValue({ id: "p1" } as never);
    mockCaptureScreenshot.mockResolvedValue(null as never);

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ port: 3000 }),
    });

    const response = await POST(req, { params: Promise.resolve({ projectId: "p1" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("failed");
  });
});
