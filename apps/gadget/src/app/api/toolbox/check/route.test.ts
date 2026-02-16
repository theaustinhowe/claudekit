import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/constants/tools", () => ({
  DEFAULT_TOOLS: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
  getToolById: vi.fn(),
}));
vi.mock("@/lib/services/tool-checker", () => ({
  checkTools: vi.fn(),
}));

import { NextRequest } from "next/server";
import { getToolById } from "@/lib/constants/tools";
import { checkTools } from "@/lib/services/tool-checker";
import { POST } from "./route";

const mockGetToolById = vi.mocked(getToolById);
const mockCheckTools = vi.mocked(checkTools);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/toolbox/check", () => {
  it("checks tools and returns results", async () => {
    mockGetToolById.mockReturnValue({ id: "node", name: "Node.js" } as never);
    mockCheckTools.mockResolvedValue([{ id: "node", installed: true, version: "20.0.0" }] as never);

    const req = new NextRequest("http://localhost/api/toolbox/check", {
      method: "POST",
      body: JSON.stringify({ toolIds: ["node"] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].installed).toBe(true);
  });

  it("returns 400 when toolIds is empty", async () => {
    const req = new NextRequest("http://localhost/api/toolbox/check", {
      method: "POST",
      body: JSON.stringify({ toolIds: [] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("non-empty array");
  });

  it("returns 400 when all toolIds are invalid", async () => {
    mockGetToolById.mockReturnValue(undefined as never);

    const req = new NextRequest("http://localhost/api/toolbox/check", {
      method: "POST",
      body: JSON.stringify({ toolIds: ["invalid"] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("No valid tool IDs");
  });
});
