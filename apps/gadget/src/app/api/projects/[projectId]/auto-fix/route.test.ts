import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/auto-fix", () => ({
  getAutoFixEnabled: vi.fn(),
  getAutoFixHistory: vi.fn(),
  setAutoFixEnabled: vi.fn(),
}));
vi.mock("@/lib/services/auto-fix-engine", () => ({
  getState: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  manualTrigger: vi.fn(),
  cancelCurrentFix: vi.fn(),
}));

import { getAutoFixEnabled, getAutoFixHistory } from "@/lib/actions/auto-fix";
import * as autoFix from "@/lib/services/auto-fix-engine";
import { DELETE, GET, POST } from "./route";

const mockGetAutoFixEnabled = vi.mocked(getAutoFixEnabled);
const mockGetAutoFixHistory = vi.mocked(getAutoFixHistory);
const mockGetState = vi.mocked(autoFix.getState);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/projects/[projectId]/auto-fix", () => {
  it("returns auto-fix state", async () => {
    mockGetAutoFixEnabled.mockResolvedValue(true as never);
    mockGetAutoFixHistory.mockResolvedValue([{ id: "r1" }] as never);
    mockGetState.mockReturnValue({
      status: "idle",
      currentRun: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
    } as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.enabled).toBe(true);
    expect(data.status).toBe("idle");
    expect(data.history).toHaveLength(1);
  });
});

describe("POST /api/projects/[projectId]/auto-fix", () => {
  it("enables auto-fix", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "enable", projectDir: "/projects/app" }),
    });

    const response = await POST(req, { params: Promise.resolve({ projectId: "p1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.enabled).toBe(true);
  });

  it("disables auto-fix", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "disable" }),
    });

    const response = await POST(req, { params: Promise.resolve({ projectId: "p1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.enabled).toBe(false);
  });

  it("triggers manual auto-fix", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "trigger" }),
    });

    const response = await POST(req, { params: Promise.resolve({ projectId: "p1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.triggered).toBe(true);
  });

  it("returns 400 for enable without projectDir", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "enable" }),
    });

    const response = await POST(req, { params: Promise.resolve({ projectId: "p1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("projectDir");
  });

  it("returns 400 for invalid action", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "invalid" }),
    });

    const response = await POST(req, { params: Promise.resolve({ projectId: "p1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid action");
  });
});

describe("DELETE /api/projects/[projectId]/auto-fix", () => {
  it("cancels current fix", async () => {
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ projectId: "p1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cancelled).toBe(true);
  });
});
