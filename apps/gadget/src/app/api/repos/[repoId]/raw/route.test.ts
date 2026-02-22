import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryOne: vi.fn(),
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
import { queryOne } from "@/lib/db";
import { GET } from "./route";

const mockQueryOne = vi.mocked(queryOne);
const mockReadFile = vi.mocked(fs.readFile);

function createRequest(filePath?: string): Request {
  const url = filePath
    ? `http://localhost:2100/api/repos/repo-1/raw?path=${encodeURIComponent(filePath)}`
    : "http://localhost:2100/api/repos/repo-1/raw";
  return new Request(url);
}

function createParams(repoId = "repo-1") {
  return { params: Promise.resolve({ repoId }) };
}

describe("GET /api/repos/[repoId]/raw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryOne.mockResolvedValue({ local_path: "/home/testuser/repos/my-repo" });
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
    const res = await GET(createRequest("file.ts") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Unsupported file type");
  });

  it("returns 404 when repository is not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const res = await GET(createRequest("image.png") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Repository not found");
  });

  it("returns 403 for absolute file paths", async () => {
    const res = await GET(createRequest("/etc/shadow.png") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Invalid path");
  });

  it("returns 403 for path traversal attempts with ..", async () => {
    const res = await GET(createRequest("../../../etc/passwd.png") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Invalid path");
  });

  it("returns image data for valid requests", async () => {
    const imageData = Buffer.from("fake-png-data");
    mockReadFile.mockResolvedValue(imageData);

    const res = await GET(createRequest("assets/logo.png") as never, createParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  it("returns correct mime type for jpg files", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("fake-jpg"));

    const res = await GET(createRequest("docs/screenshot.jpg") as never, createParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("returns correct mime type for svg files", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("<svg></svg>"));

    const res = await GET(createRequest("public/icon.svg") as never, createParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
  });

  it("returns 404 when file does not exist on disk", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

    const res = await GET(createRequest("nonexistent.png") as never, createParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("File not found");
  });

  it("queries the database for repository local_path", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("data"));

    await GET(createRequest("test.png") as never, createParams("repo-42"));

    expect(mockQueryOne).toHaveBeenCalledWith(expect.anything(), "SELECT local_path FROM repos WHERE id = ?", [
      "repo-42",
    ]);
  });

  it("expands tilde in repository path", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "~/repos/my-repo" });
    mockReadFile.mockResolvedValue(Buffer.from("data"));

    const res = await GET(createRequest("test.png") as never, createParams());

    // Should succeed since expandTilde is mocked to replace ~
    expect(res.status).toBe(200);
  });
});
