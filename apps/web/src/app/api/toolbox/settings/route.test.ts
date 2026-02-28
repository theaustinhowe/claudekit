import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/toolbox-settings", () => ({
  readToolboxSettings: vi.fn(),
  writeToolboxSettings: vi.fn(),
}));

import { readToolboxSettings, writeToolboxSettings } from "@/lib/toolbox-settings";
import { GET, PUT } from "./route";

const mockRead = vi.mocked(readToolboxSettings);
const mockWrite = vi.mocked(writeToolboxSettings);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/toolbox/settings", () => {
  it("returns toolIds from readToolboxSettings", async () => {
    mockRead.mockReturnValue(["node", "git", "claude"]);

    const response = await GET();
    const data = await response.json();

    expect(data.toolIds).toEqual(["node", "git", "claude"]);
  });
});

describe("PUT /api/toolbox/settings", () => {
  it("writes valid array and returns ok", async () => {
    const body = { toolIds: ["node", "bun"] };
    const request = new Request("http://localhost/api/toolbox/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await PUT(request as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockWrite).toHaveBeenCalledWith(["node", "bun"]);
  });

  it("returns 400 when toolIds is not an array", async () => {
    const body = { toolIds: "not-an-array" };
    const request = new Request("http://localhost/api/toolbox/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await PUT(request as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("toolIds must be an array");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("returns 500 on invalid JSON", async () => {
    const request = new Request("http://localhost/api/toolbox/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const response = await PUT(request as NextRequest);

    expect(response.status).toBe(500);
  });
});
