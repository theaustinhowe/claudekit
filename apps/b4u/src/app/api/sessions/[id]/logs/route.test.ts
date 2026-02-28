import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { GET } from "@/app/api/sessions/[id]/logs/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sessions/[id]/logs", () => {
  it("returns session logs", async () => {
    const logs = [
      { id: 1, session_id: "sess-1", log: "Starting", log_type: "info", created_at: "2024-01-01" },
      { id: 2, session_id: "sess-1", log: "Done", log_type: "info", created_at: "2024-01-01" },
    ];
    mockQueryAll.mockResolvedValue(cast(logs));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "sess-1" }),
    });
    const data = await response.json();

    expect(data.logs).toEqual(logs);
    expect(mockQueryAll).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("session_id = ?"), ["sess-1"]);
  });
});
