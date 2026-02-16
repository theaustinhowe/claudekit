import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/validations", () => ({
  parseBody: vi.fn(),
  voiceoverScriptsSchema: {},
}));

import { GET, PUT } from "@/app/api/voiceover-scripts/route";
import { execute, queryAll } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/voiceover-scripts", () => {
  it("returns scripts grouped by flow_id", async () => {
    mockQueryAll.mockResolvedValue([
      { flow_id: "flow-1", paragraph_index: 0, text: "Welcome to the app" },
      { flow_id: "flow-1", paragraph_index: 1, text: "Click the login button" },
      { flow_id: "flow-2", paragraph_index: 0, text: "Now view your dashboard" },
    ] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data["flow-1"]).toEqual(["Welcome to the app", "Click the login button"]);
    expect(data["flow-2"]).toEqual(["Now view your dashboard"]);
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});

describe("PUT /api/voiceover-scripts", () => {
  it("replaces all voiceover scripts", async () => {
    const scripts = { "flow-1": ["Script 1", "Script 2"] };
    mockParseBody.mockResolvedValue({ ok: true, data: scripts } as never);
    mockExecute.mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/voiceover-scripts", {
      method: "PUT",
      body: JSON.stringify(scripts),
    });
    const response = await PUT(req as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // Should delete old scripts then insert new ones
    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM voiceover_scripts");
  });

  it("returns validation error", async () => {
    mockParseBody.mockResolvedValue({ ok: false, error: "Invalid", status: 422 } as never);

    const req = new Request("http://localhost/api/voiceover-scripts", { method: "PUT", body: "{}" });
    const response = await PUT(req as never);

    expect(response.status).toBe(422);
  });
});
