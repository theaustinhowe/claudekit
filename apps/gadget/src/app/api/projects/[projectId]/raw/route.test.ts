import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock("@/lib/actions/generator-projects", () => ({
  getGeneratorProject: vi.fn(),
}));

vi.mock("@/lib/constants", () => ({
  IMAGE_MIME_TYPES: {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  },
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/testuser")),
}));

import fs from "node:fs/promises";
import { getGeneratorProject } from "@/lib/actions/generator-projects";
import { GET } from "./route";

const mockGetGeneratorProject = vi.mocked(getGeneratorProject);
const mockReadFile = vi.mocked(fs.readFile);

const mockProject = {
  id: "proj-1",
  title: "Test Project",
  idea_description: "A test",
  platform: "nextjs",
  services: [],
  constraints: [],
  project_name: "my-app",
  project_path: "~/projects",
  package_manager: "pnpm" as const,
  status: "designing" as const,
  active_spec_version: 1,
  ai_provider: "claude-code" as const,
  ai_model: null,
  template_id: null,
  policy_id: null,
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

function createRequest(filePath?: string): Request {
  const url = filePath
    ? `http://localhost:2100/api/projects/proj-1/raw?path=${encodeURIComponent(filePath)}`
    : "http://localhost:2100/api/projects/proj-1/raw";
  return new Request(url);
}

function createParams(projectId = "proj-1") {
  return { params: Promise.resolve({ projectId }) };
}

describe("GET /api/projects/[projectId]/raw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGeneratorProject.mockResolvedValue(mockProject);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when path parameter is missing", async () => {
    const res = await GET(createRequest() as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Missing path parameter");
  });

  it("returns 400 for unsupported file type", async () => {
    const res = await GET(createRequest("file.txt") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Unsupported file type");
  });

  it("returns 404 when project is not found", async () => {
    mockGetGeneratorProject.mockResolvedValue(undefined as never);

    const res = await GET(createRequest("image.png") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Project not found");
  });

  it("returns 403 for absolute file paths", async () => {
    const res = await GET(createRequest("/etc/passwd.png") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Invalid path");
  });

  it("returns 403 for path traversal attempts", async () => {
    const res = await GET(createRequest("../../etc/passwd.png") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Invalid path");
  });

  it("returns image data for valid requests", async () => {
    const imageData = Buffer.from("fake-png-data");
    mockReadFile.mockResolvedValue(imageData);

    const res = await GET(createRequest("screenshots/home.png") as never, createParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  it("returns correct mime type for jpg files", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("fake-jpg-data"));

    const res = await GET(createRequest("images/photo.jpg") as never, createParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("returns correct mime type for svg files", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("<svg></svg>"));

    const res = await GET(createRequest("icons/logo.svg") as never, createParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
  });

  it("returns 404 when file does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

    const res = await GET(createRequest("missing.png") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("File not found");
  });
});
