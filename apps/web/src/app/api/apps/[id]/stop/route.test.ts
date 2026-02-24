import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

function buildRequest(appId: string) {
  const req = new Request(`http://localhost:2000/api/apps/${appId}/stop`, { method: "POST" });
  const params = Promise.resolve({ id: appId });
  return { req, params };
}

describe("POST /api/apps/[id]/stop", () => {
  it("sends POST to daemon control endpoint with app id", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    const { req, params } = buildRequest("gadget");
    await POST(req, { params });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:2999/stop/gadget", {
      method: "POST",
    });
  });

  it("returns daemon response data and status", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ ok: true, stopped: true }),
    });

    const { req, params } = buildRequest("gadget");
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, stopped: true });
  });

  it("forwards non-200 status from daemon", async () => {
    fetchMock.mockResolvedValue({
      status: 404,
      json: () => Promise.resolve({ error: "App not found" }),
    });

    const { req, params } = buildRequest("unknown-app");
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("App not found");
  });

  it("returns 503 when daemon is not reachable", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));

    const { req, params } = buildRequest("gadget");
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("Daemon not reachable");
  });

  it("encodes app id in URL to handle special characters", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    const { req, params } = buildRequest("gogo-orchestrator");
    await POST(req, { params });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:2999/stop/gogo-orchestrator", {
      method: "POST",
    });
  });

  it("forwards 500 status from daemon", async () => {
    fetchMock.mockResolvedValue({
      status: 500,
      json: () => Promise.resolve({ error: "Internal error" }),
    });

    const { req, params } = buildRequest("gadget");
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal error");
  });
});
