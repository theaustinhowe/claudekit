import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock next/server -- must be before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}));

import { createCancelHandler, createSessionsListHandler, createStreamHandler } from "./next";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function makeMockRequest(url = "http://localhost/api") {
  const controller = new AbortController();
  return { url, signal: controller.signal } as unknown as Request;
}

// ---------------------------------------------------------------------------
// createStreamHandler
// ---------------------------------------------------------------------------

describe("createStreamHandler", () => {
  it("extracts sessionId from params by default and returns a Response", async () => {
    const manager = {
      getLiveSession: vi.fn().mockReturnValue(null),
      subscribe: vi.fn(),
    };
    const replay = {
      getSession: vi.fn().mockResolvedValue(null),
      getLogs: vi.fn().mockResolvedValue([]),
    };

    const handler = createStreamHandler({ manager, replay });
    const request = makeMockRequest();
    const context = makeRouteContext({ sessionId: "abc-123" });

    const response = await handler(request, context);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("uses params.id as fallback when sessionId is not present", async () => {
    const manager = {
      getLiveSession: vi.fn().mockReturnValue(null),
      subscribe: vi.fn(),
    };
    const replay = {
      getSession: vi.fn().mockResolvedValue(null),
      getLogs: vi.fn().mockResolvedValue([]),
    };

    const handler = createStreamHandler({ manager, replay });
    const request = makeMockRequest();
    const context = makeRouteContext({ id: "fallback-id" });

    const response = await handler(request, context);
    expect(response).toBeInstanceOf(Response);
  });

  it("uses custom extractSessionId when provided", async () => {
    const manager = {
      getLiveSession: vi.fn().mockReturnValue(null),
      subscribe: vi.fn(),
    };
    const replay = {
      getSession: vi.fn().mockResolvedValue(null),
      getLogs: vi.fn().mockResolvedValue([]),
    };

    const extractSessionId = vi.fn((params: Record<string, string>) => params.customKey);

    const handler = createStreamHandler({ manager, replay, extractSessionId });
    const request = makeMockRequest();
    const context = makeRouteContext({ customKey: "custom-session-id" });

    await handler(request, context);
    expect(extractSessionId).toHaveBeenCalledWith({ customKey: "custom-session-id" });
  });

  it("passes heartbeatIntervalMs through to createSessionSSEResponse", async () => {
    const manager = {
      getLiveSession: vi.fn().mockReturnValue(null),
      subscribe: vi.fn(),
    };
    const replay = {
      getSession: vi.fn().mockResolvedValue(null),
      getLogs: vi.fn().mockResolvedValue([]),
    };

    const handler = createStreamHandler({
      manager,
      replay,
      heartbeatIntervalMs: 5000,
    });

    const response = await handler(makeMockRequest(), makeRouteContext({ sessionId: "s1" }));
    expect(response).toBeInstanceOf(Response);
  });

  it("prefers sessionId over id when both are present", async () => {
    const manager = {
      getLiveSession: vi.fn().mockReturnValue(null),
      subscribe: vi.fn(),
    };
    const replay = {
      getSession: vi.fn().mockResolvedValue({ status: "done", result_json: "{}" }),
      getLogs: vi.fn().mockResolvedValue([]),
    };

    const handler = createStreamHandler({ manager, replay });
    const request = makeMockRequest();
    const context = makeRouteContext({ sessionId: "preferred", id: "ignored" });

    const response = await handler(request, context);
    expect(response).toBeInstanceOf(Response);
    // getSession should be called with "preferred", not "ignored"
    expect(replay.getSession).toHaveBeenCalledWith("preferred");
  });
});

// ---------------------------------------------------------------------------
// createCancelHandler
// ---------------------------------------------------------------------------

describe("createCancelHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("cancels a running session and returns { ok: true }", async () => {
    const manager = {
      cancelSession: vi.fn().mockResolvedValue(true),
    };

    const handler = createCancelHandler({ manager });
    const result = await handler(makeMockRequest(), makeRouteContext({ sessionId: "s1" }));

    expect(manager.cancelSession).toHaveBeenCalledWith("s1");
    expect(result).toEqual({
      body: { ok: true, status: "cancelled" },
      status: 200,
    });
  });

  it("returns 404 when session not found or not running", async () => {
    const manager = {
      cancelSession: vi.fn().mockResolvedValue(false),
    };

    const handler = createCancelHandler({ manager });
    const result = await handler(makeMockRequest(), makeRouteContext({ sessionId: "s1" }));

    expect(result).toEqual({
      body: { error: "Session not found or not running" },
      status: 404,
    });
  });

  it("returns 500 when cancelSession throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const manager = {
      cancelSession: vi.fn().mockRejectedValue(new Error("DB down")),
    };

    const handler = createCancelHandler({ manager });
    const result = await handler(makeMockRequest(), makeRouteContext({ sessionId: "s1" }));

    expect(result).toEqual({
      body: { error: "Failed to cancel session" },
      status: 500,
    });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("uses params.id as fallback when sessionId is not present", async () => {
    const manager = {
      cancelSession: vi.fn().mockResolvedValue(true),
    };

    const handler = createCancelHandler({ manager });
    await handler(makeMockRequest(), makeRouteContext({ id: "id-fallback" }));

    expect(manager.cancelSession).toHaveBeenCalledWith("id-fallback");
  });

  it("uses custom extractSessionId when provided", async () => {
    const manager = {
      cancelSession: vi.fn().mockResolvedValue(true),
    };

    const extractSessionId = (params: Record<string, string>) => params.slug;
    const handler = createCancelHandler({ manager, extractSessionId });
    await handler(makeMockRequest(), makeRouteContext({ slug: "my-slug" }));

    expect(manager.cancelSession).toHaveBeenCalledWith("my-slug");
  });

  it("prefers sessionId over id when both are present", async () => {
    const manager = {
      cancelSession: vi.fn().mockResolvedValue(true),
    };

    const handler = createCancelHandler({ manager });
    await handler(makeMockRequest(), makeRouteContext({ sessionId: "preferred", id: "ignored" }));

    expect(manager.cancelSession).toHaveBeenCalledWith("preferred");
  });

  it("logs the sessionId in the error message on failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const manager = {
      cancelSession: vi.fn().mockRejectedValue(new Error("timeout")),
    };

    const handler = createCancelHandler({ manager });
    await handler(makeMockRequest(), makeRouteContext({ sessionId: "fail-session" }));

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("fail-session"), expect.any(Error));

    consoleError.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// createSessionsListHandler
// ---------------------------------------------------------------------------

describe("createSessionsListHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns sessions with no filter params", async () => {
    const sessions = [
      { id: "1", session_type: "audit", status: "done", label: "S1" },
      { id: "2", session_type: "review", status: "running", label: "S2" },
    ];
    const listSessions = vi.fn().mockResolvedValue(sessions);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions");
    const result = await handler(request);

    expect(listSessions).toHaveBeenCalledWith({
      status: undefined,
      contextId: undefined,
      contextType: undefined,
      sessionType: undefined,
      limit: undefined,
    });
    expect(result).toEqual({ body: sessions, status: 200 });
  });

  it("parses status as comma-separated values", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions?status=done,error");
    await handler(request);

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ["done", "error"],
      }),
    );
  });

  it("parses single status value as array with one element", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions?status=running");
    await handler(request);

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ["running"],
      }),
    );
  });

  it("passes contextId filter", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions?contextId=pr-42");
    await handler(request);

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId: "pr-42",
      }),
    );
  });

  it("passes contextType filter", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions?contextType=pull_request");
    await handler(request);

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: "pull_request",
      }),
    );
  });

  it("passes sessionType filter via type param", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions?type=audit");
    await handler(request);

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionType: "audit",
      }),
    );
  });

  it("parses limit as a number", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions?limit=25");
    await handler(request);

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 25,
      }),
    );
  });

  it("passes all filters simultaneously", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const url = "http://localhost/api/sessions?status=running&contextId=repo-1&contextType=repo&type=scan&limit=10";
    const request = new Request(url);
    await handler(request);

    expect(listSessions).toHaveBeenCalledWith({
      status: ["running"],
      contextId: "repo-1",
      contextType: "repo",
      sessionType: "scan",
      limit: 10,
    });
  });

  it("returns 500 when listSessions throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const listSessions = vi.fn().mockRejectedValue(new Error("query failed"));

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions");
    const result = await handler(request);

    expect(result).toEqual({
      body: { error: "Failed to list sessions" },
      status: 500,
    });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns empty array when no sessions match", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions?status=cancelled");
    const result = await handler(request);

    expect(result).toEqual({ body: [], status: 200 });
  });

  it("handles limit as undefined when param is absent", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions?status=done");
    await handler(request);

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: undefined,
      }),
    );
  });

  it("logs the error on failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const listSessions = vi.fn().mockRejectedValue(new Error("DB error"));

    const handler = createSessionsListHandler({ listSessions });
    const request = new Request("http://localhost/api/sessions");
    await handler(request);

    expect(consoleError).toHaveBeenCalledWith("[sessions] Error listing sessions:", expect.any(Error));

    consoleError.mockRestore();
  });
});
