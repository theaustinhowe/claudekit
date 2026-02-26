import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/tool-checker", () => ({
  checkTools: vi.fn(),
}));

vi.mock("@/lib/constants/tools", () => ({
  DEFAULT_TOOLS: [
    { id: "node", name: "Node.js" },
    { id: "git", name: "Git" },
    { id: "pnpm", name: "pnpm" },
  ],
  getToolById: vi.fn((id: string) => {
    const map: Record<string, { id: string; name: string }> = {
      node: { id: "node", name: "Node.js" },
      git: { id: "git", name: "Git" },
      pnpm: { id: "pnpm", name: "pnpm" },
    };
    return map[id];
  }),
}));

import { checkTools } from "@/lib/services/tool-checker";
import { POST } from "./route";

const mockCheckTools = vi.mocked(checkTools);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/toolbox/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/toolbox/check", () => {
  it("returns results for valid toolIds", async () => {
    const results = [
      { toolId: "node", installed: true, currentVersion: "22.0.0" },
      { toolId: "git", installed: true, currentVersion: "2.45.0" },
    ];
    mockCheckTools.mockResolvedValue(results as never);

    const response = await POST(makeRequest({ toolIds: ["node", "git"] }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toEqual(results);
    expect(mockCheckTools).toHaveBeenCalledWith([
      { id: "node", name: "Node.js" },
      { id: "git", name: "Git" },
    ]);
  });

  it("returns 400 when toolIds is not an array", async () => {
    const response = await POST(makeRequest({ toolIds: "node" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("toolIds must be a non-empty array");
  });

  it("returns 400 when toolIds is empty", async () => {
    const response = await POST(makeRequest({ toolIds: [] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("toolIds must be a non-empty array");
  });

  it("returns 400 when too many tool IDs", async () => {
    const toolIds = Array.from({ length: 100 }, (_, i) => `tool-${i}`);
    const response = await POST(makeRequest({ toolIds }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Too many tool IDs");
  });

  it("returns 400 when all tool IDs are unknown", async () => {
    const response = await POST(makeRequest({ toolIds: ["unknown-tool"] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No valid tool IDs provided");
  });

  it("returns 500 when checkTools throws", async () => {
    mockCheckTools.mockRejectedValue(new Error("check failed"));

    const response = await POST(makeRequest({ toolIds: ["node"] }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });
});
