import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
}));

vi.mock("../db/helpers.js", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
  parseJsonField: vi.fn((val: string) => {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }),
}));

import { queryOne } from "../db/helpers.js";

describe("auth middleware", () => {
  let authHook: typeof import("./auth.js").authHook;

  beforeEach(async () => {
    vi.resetAllMocks();
    delete process.env.API_TOKEN;
    // Reset module to clear cached token state (cachedToken, tokenChecked)
    vi.resetModules();
    const mod = await import("./auth.js");
    authHook = mod.authHook;
  });

  function createMockRequest(overrides?: Partial<Record<string, unknown>>) {
    return {
      url: "/api/jobs",
      headers: {} as Record<string, string | undefined>,
      ...overrides,
    };
  }

  function createMockReply() {
    const reply = {
      _statusCode: 200,
      _body: null as unknown,
      status(code: number) {
        reply._statusCode = code;
        return reply;
      },
      send(body: unknown) {
        reply._body = body;
        return body;
      },
    };
    return reply;
  }

  it("should skip auth for WebSocket upgrades", async () => {
    const request = createMockRequest({
      headers: { upgrade: "websocket" },
    });
    const reply = createMockReply();

    await authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(200);
    expect(reply._body).toBeNull();
  });

  it("should skip auth for /api/health", async () => {
    const request = createMockRequest({ url: "/api/health" });
    const reply = createMockReply();

    await authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(200);
    expect(reply._body).toBeNull();
  });

  it("should skip auth for /api/setup", async () => {
    const request = createMockRequest({ url: "/api/setup" });
    const reply = createMockReply();

    await authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(200);
    expect(reply._body).toBeNull();
  });

  it("should skip auth when no token is configured", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);

    const request = createMockRequest();
    const reply = createMockReply();

    await authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(200);
    expect(reply._body).toBeNull();
  });

  it("should return 401 when token is configured but no Authorization header", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      key: "api_token",
      value: '"secret-token"',
      updated_at: "",
    });

    const request = createMockRequest();
    const reply = createMockReply();

    await authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(401);
    expect(reply._body).toEqual({ error: "Authentication required" });
  });

  it("should return 401 when Authorization header has no Bearer prefix", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      key: "api_token",
      value: '"secret-token"',
      updated_at: "",
    });

    const request = createMockRequest({
      headers: { authorization: "Basic abc123" },
    });
    const reply = createMockReply();

    await authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(401);
    expect(reply._body).toEqual({ error: "Authentication required" });
  });

  it("should return 401 when token does not match", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      key: "api_token",
      value: '"secret-token"',
      updated_at: "",
    });

    const request = createMockRequest({
      headers: { authorization: "Bearer wrong-token" },
    });
    const reply = createMockReply();

    await authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(401);
    expect(reply._body).toEqual({ error: "Invalid token" });
  });

  it("should allow request when token matches", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      key: "api_token",
      value: '"secret-token"',
      updated_at: "",
    });

    const request = createMockRequest({
      headers: { authorization: "Bearer secret-token" },
    });
    const reply = createMockReply();

    await authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(200);
    expect(reply._body).toBeNull();
  });

  it("should fall back to API_TOKEN env var when DB has no token", async () => {
    vi.resetModules();
    process.env.API_TOKEN = "env-token";
    const mod = await import("./auth.js");

    vi.mocked(queryOne).mockResolvedValue(undefined);

    const request = createMockRequest({
      headers: { authorization: "Bearer env-token" },
    });
    const reply = createMockReply();

    await mod.authHook(request as never, reply as never);

    expect(reply._statusCode).toBe(200);
    expect(reply._body).toBeNull();

    delete process.env.API_TOKEN;
  });

  it("should cache token after first lookup", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);

    const request = createMockRequest();
    const reply = createMockReply();

    await authHook(request as never, reply as never);
    await authHook(request as never, reply as never);

    expect(queryOne).toHaveBeenCalledTimes(1);
  });
});
