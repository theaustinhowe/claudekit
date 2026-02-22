import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/reporter", () => ({
  exportJSON: vi.fn(),
  exportMarkdown: vi.fn(),
  exportPRDescription: vi.fn(),
}));

import { NextRequest } from "next/server";
import { exportJSON, exportMarkdown, exportPRDescription } from "@/lib/services/reporter";
import { GET } from "./route";

const mockExportJSON = vi.mocked(exportJSON);
const mockExportMarkdown = vi.mocked(exportMarkdown);
const mockExportPRDescription = vi.mocked(exportPRDescription);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/reports", () => {
  it("returns JSON report by default", async () => {
    mockExportJSON.mockResolvedValue('{"findings": []}' as never);

    const req = new NextRequest("http://localhost/api/reports");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.findings).toEqual([]);
  });

  it("returns markdown report", async () => {
    mockExportMarkdown.mockResolvedValue("# Report\n\nNo issues found." as never);

    const req = new NextRequest("http://localhost/api/reports?format=markdown");
    const response = await GET(req);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown");
    expect(text).toContain("# Report");
  });

  it("returns PR description", async () => {
    mockExportPRDescription.mockResolvedValue("## Changes\n\n- Fixed X" as never);

    const req = new NextRequest("http://localhost/api/reports?format=pr");
    const response = await GET(req);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("## Changes");
  });
});
