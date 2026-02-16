import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/fixes", () => ({
  restoreApplyRun: vi.fn(),
}));

import { NextRequest } from "next/server";
import { restoreApplyRun } from "@/lib/actions/fixes";
import { POST } from "./route";

const mockRestoreApplyRun = vi.mocked(restoreApplyRun);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/fixes/restore", () => {
  it("restores an apply run successfully", async () => {
    mockRestoreApplyRun.mockResolvedValue({ success: true } as never);

    const req = new NextRequest("http://localhost/api/fixes/restore", {
      method: "POST",
      body: JSON.stringify({ runId: "run-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 400 on restore failure", async () => {
    mockRestoreApplyRun.mockResolvedValue({ success: false, error: "No snapshot" } as never);

    const req = new NextRequest("http://localhost/api/fixes/restore", {
      method: "POST",
      body: JSON.stringify({ runId: "run-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("returns 400 when runId missing", async () => {
    const req = new NextRequest("http://localhost/api/fixes/restore", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing runId");
  });
});
