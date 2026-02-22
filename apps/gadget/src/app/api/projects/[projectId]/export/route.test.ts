import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
  getMockData: vi.fn().mockResolvedValue([]),
  getUiSpec: vi.fn().mockResolvedValue(null),
  updateGeneratorProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/spec-exporter", () => ({
  generateExportFiles: vi.fn().mockReturnValue([]),
  writeExportToDisk: vi.fn().mockResolvedValue({ filesWritten: 5, fullPath: "/tmp/export/my-app" }),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("run-id-1"),
  nowTimestamp: vi.fn().mockReturnValue("2026-01-01T00:00:00.000Z"),
}));

import { getGeneratorProject, getMockData, getUiSpec, updateGeneratorProject } from "@/lib/actions/generator-projects";
import { execute, getDb } from "@/lib/db";
import { generateExportFiles, writeExportToDisk } from "@/lib/services/spec-exporter";
import { generateId, nowTimestamp } from "@/lib/utils";
import { POST } from "./route";

const mockGetGeneratorProject = vi.mocked(getGeneratorProject);
const mockGetUiSpec = vi.mocked(getUiSpec);
const mockGetMockData = vi.mocked(getMockData);
const mockUpdateGeneratorProject = vi.mocked(updateGeneratorProject);
const mockGenerateExportFiles = vi.mocked(generateExportFiles);
const mockWriteExportToDisk = vi.mocked(writeExportToDisk);
const mockExecute = vi.mocked(execute);

function createRequest(body?: Record<string, unknown>): Request {
  return new Request("http://localhost:2100/api/projects/proj-1/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  });
}

function createParams(projectId = "proj-1") {
  return { params: Promise.resolve({ projectId }) };
}

const mockProject = {
  id: "proj-1",
  title: "Test Project",
  idea_description: "A test project",
  platform: "nextjs",
  services: [],
  constraints: ["biome"],
  project_name: "my-app",
  project_path: "/tmp/export",
  package_manager: "pnpm" as const,
  status: "designing" as const,
  active_spec_version: 1,
  ai_provider: "claude-code" as const,
  ai_model: null,
  template_id: "tmpl-1",
  policy_id: "pol-1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  exported_at: null,
  implementation_prompt: null,
  repo_id: null,
  design_vibes: [],
  inspiration_urls: [],
  color_scheme: {},
  custom_features: [],
  scaffold_logs: null,
};

describe("POST /api/projects/[projectId]/export", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-establish default mock behavior after resetAllMocks
    mockGetGeneratorProject.mockResolvedValue(mockProject);
    mockGetUiSpec.mockResolvedValue(null);
    mockGetMockData.mockResolvedValue([] as never);
    mockUpdateGeneratorProject.mockResolvedValue(undefined as never);
    mockGenerateExportFiles.mockReturnValue([]);
    mockWriteExportToDisk.mockResolvedValue({ filesWritten: 5, fullPath: "/tmp/export/my-app" });
    vi.mocked(getDb).mockResolvedValue({} as never);
    mockExecute.mockResolvedValue(undefined as never);
    vi.mocked(generateId).mockReturnValue("run-id-1");
    vi.mocked(nowTimestamp).mockReturnValue("2026-01-01T00:00:00.000Z");
  });

  it("returns 404 when project is not found", async () => {
    mockGetGeneratorProject.mockResolvedValue(undefined as unknown as typeof mockProject);

    const res = await POST(createRequest() as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Project not found");
  });

  it("returns 400 when no spec is available", async () => {
    mockGetUiSpec.mockResolvedValue(null);

    const res = await POST(createRequest() as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("No spec found to export");
  });

  it("exports project successfully with spec from DB", async () => {
    const mockSpec = { version: 1, pages: [], components: [], layouts: [], navigation: { type: "sidebar", items: [] } };
    mockGetUiSpec.mockResolvedValue(mockSpec as never);

    const res = await POST(createRequest() as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.filesCreated).toBe(5);
    expect(body.projectPath).toBe("/tmp/export/my-app");
  });

  it("uses spec from request body when provided", async () => {
    const customSpec = {
      version: 2,
      pages: [{ id: "p1", route: "/", title: "Home" }],
      components: [],
      layouts: [],
      navigation: { type: "sidebar", items: [] },
    };

    const res = await POST(createRequest({ spec: customSpec }) as never, createParams());

    expect(res.status).toBe(200);
    expect(mockGenerateExportFiles).toHaveBeenCalledWith(mockProject, customSpec, expect.anything());
  });

  it("uses mockData from request body when provided", async () => {
    const mockSpec = { version: 1, pages: [], components: [], layouts: [], navigation: { type: "sidebar", items: [] } };
    mockGetUiSpec.mockResolvedValue(mockSpec as never);
    const customMockData = [{ id: "e1", name: "User", description: "A user", fields: [], sample_rows: [] }];

    const res = await POST(createRequest({ mockData: customMockData }) as never, createParams());

    expect(res.status).toBe(200);
    expect(mockGenerateExportFiles).toHaveBeenCalledWith(mockProject, mockSpec, customMockData);
  });

  it("locks the project before export", async () => {
    const mockSpec = { version: 1, pages: [], components: [], layouts: [], navigation: { type: "sidebar", items: [] } };
    mockGetUiSpec.mockResolvedValue(mockSpec as never);

    await POST(createRequest() as never, createParams());

    expect(mockUpdateGeneratorProject).toHaveBeenCalledWith("proj-1", { status: "locked" });
  });

  it("marks project as exported after success", async () => {
    const mockSpec = { version: 1, pages: [], components: [], layouts: [], navigation: { type: "sidebar", items: [] } };
    mockGetUiSpec.mockResolvedValue(mockSpec as never);

    await POST(createRequest() as never, createParams());

    expect(mockUpdateGeneratorProject).toHaveBeenCalledWith("proj-1", {
      status: "exported",
      exported_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("creates a generator_runs record", async () => {
    const mockSpec = { version: 1, pages: [], components: [], layouts: [], navigation: { type: "sidebar", items: [] } };
    mockGetUiSpec.mockResolvedValue(mockSpec as never);

    await POST(createRequest() as never, createParams());

    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO generator_runs"),
      expect.arrayContaining(["run-id-1", "tmpl-1", "pol-1"]),
    );
  });

  it("returns 500 and resets status on export error", async () => {
    const mockSpec = { version: 1, pages: [], components: [], layouts: [], navigation: { type: "sidebar", items: [] } };
    mockGetUiSpec.mockResolvedValue(mockSpec as never);
    mockWriteExportToDisk.mockRejectedValue(new Error("Disk full"));

    const res = await POST(createRequest() as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Disk full");
    // Should attempt to reset status to "designing"
    expect(mockUpdateGeneratorProject).toHaveBeenCalledWith("proj-1", { status: "designing" });
  });

  it("handles non-Error throw in catch block", async () => {
    const mockSpec = { version: 1, pages: [], components: [], layouts: [], navigation: { type: "sidebar", items: [] } };
    mockGetUiSpec.mockResolvedValue(mockSpec as never);
    mockWriteExportToDisk.mockRejectedValue("string error");

    const res = await POST(createRequest() as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Export failed");
  });

  it("handles malformed JSON body gracefully without crashing", async () => {
    const req = new Request("http://localhost:2100/api/projects/proj-1/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json",
    });

    // The route handles request.json().catch(() => ({})) so it doesn't crash.
    // Since body.spec is undefined, it falls back to getUiSpec which returns null,
    // so it returns 400 "No spec found to export".
    const res = await POST(req as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("No spec found to export");
  });

  it("handles malformed JSON body but exports when spec exists in DB", async () => {
    const mockSpec = { version: 1, pages: [], components: [], layouts: [], navigation: { type: "sidebar", items: [] } };
    mockGetUiSpec.mockResolvedValue(mockSpec as never);

    const req = new Request("http://localhost:2100/api/projects/proj-1/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json",
    });

    const res = await POST(req as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
