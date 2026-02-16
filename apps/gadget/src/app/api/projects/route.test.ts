import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/generator", () => ({
  generateProject: vi.fn(),
}));

import { NextRequest } from "next/server";
import { generateProject } from "@/lib/services/generator";
import { POST } from "./route";

const mockGenerateProject = vi.mocked(generateProject);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/projects", () => {
  it("generates a project successfully", async () => {
    mockGenerateProject.mockResolvedValue({ success: true, projectPath: "/projects/new-app" } as never);

    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({
        templateId: "next-app",
        projectName: "new-app",
        projectPath: "/projects",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 400 when required fields missing", async () => {
    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ templateId: "next-app" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing required fields");
  });

  it("returns 500 when generation fails", async () => {
    mockGenerateProject.mockResolvedValue({ success: false, error: "Template not found" } as never);

    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({
        templateId: "bad-template",
        projectName: "app",
        projectPath: "/projects",
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(500);
  });
});
