import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health/apps", () => {
  it("returns all apps with running status when reachable", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(6);
    for (const app of data) {
      expect(app.status).toBe("running");
    }
  });

  it("returns stopped status when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(6);
    for (const app of data) {
      expect(app.status).toBe("stopped");
    }
  });

  it("includes correct app definitions", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    const response = await GET();
    const data = await response.json();

    const ids = data.map((a: { id: string }) => a.id);
    expect(ids).toEqual(["gadget", "gogo-web", "gogo-orchestrator", "b4u", "storybook", "web"]);
  });

  it("builds correct urls from ports", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    const response = await GET();
    const data = await response.json();

    const portMap: Record<string, number> = {
      gadget: 2100,
      "gogo-web": 2200,
      "gogo-orchestrator": 2201,
      b4u: 2300,
      storybook: 6006,
      web: 2000,
    };

    for (const app of data) {
      expect(app.url).toBe(`http://localhost:${portMap[app.id]}`);
      expect(app.port).toBe(portMap[app.id]);
    }
  });

  it("probes each app on its own port", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    await GET();

    const calledUrls = fetchMock.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(calledUrls).toContain("http://localhost:2100");
    expect(calledUrls).toContain("http://localhost:2200");
    expect(calledUrls).toContain("http://localhost:2201");
    expect(calledUrls).toContain("http://localhost:2300");
    expect(calledUrls).toContain("http://localhost:6006");
    expect(calledUrls).toContain("http://localhost:2000");
  });

  it("handles mixed running and stopped apps", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("2100")) return Promise.resolve({ status: 200 });
      return Promise.reject(new Error("Connection refused"));
    });

    const response = await GET();
    const data = await response.json();

    const gadget = data.find((a: { id: string }) => a.id === "gadget");
    const gogoWeb = data.find((a: { id: string }) => a.id === "gogo-web");
    expect(gadget.status).toBe("running");
    expect(gogoWeb.status).toBe("stopped");
  });

  it("uses AbortController with signal for timeout", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    await GET();

    for (const call of fetchMock.mock.calls) {
      const options = call[1] as { signal: AbortSignal };
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("treats any positive HTTP status as running", async () => {
    fetchMock.mockResolvedValue({ status: 503 });

    const response = await GET();
    const data = await response.json();

    for (const app of data) {
      expect(app.status).toBe("running");
    }
  });
});
