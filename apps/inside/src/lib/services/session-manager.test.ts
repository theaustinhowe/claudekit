import { describe, expect, it, vi } from "vitest";

const mockCreateSessionManager = vi.fn().mockReturnValue({
  startSession: vi.fn(),
  cancelSession: vi.fn(),
  subscribe: vi.fn(),
  getLiveSession: vi.fn(),
  setCleanupFn: vi.fn(),
  setSessionPid: vi.fn(),
});

vi.mock("@claudekit/session", () => ({
  createSessionManager: mockCreateSessionManager,
  SESSION_EVENT_BUFFER_SIZE: 100,
  SESSION_LOG_FLUSH_INTERVAL_MS: 5000,
}));

describe("session-manager module", () => {
  it("exports createSession function", async () => {
    const mod = await import("./session-manager");
    expect(typeof mod.createSession).toBe("function");
  });

  it("exports manager methods", async () => {
    const mod = await import("./session-manager");
    expect(typeof mod.startSession).toBe("function");
    expect(typeof mod.cancelSession).toBe("function");
    expect(typeof mod.subscribe).toBe("function");
    expect(typeof mod.getLiveSession).toBe("function");
    expect(typeof mod.setCleanupFn).toBe("function");
    expect(typeof mod.setSessionPid).toBe("function");
  });

  it("exports sessionManager instance", async () => {
    const mod = await import("./session-manager");
    expect(mod.sessionManager).toBeDefined();
  });

  it("createSession delegates to createSessionRecord", async () => {
    vi.mock("@/lib/actions/sessions", () => ({
      createSessionRecord: vi.fn().mockResolvedValue("new-session-id"),
      getSessionRecord: vi.fn(),
      updateSessionRecord: vi.fn(),
      insertSessionLogs: vi.fn(),
    }));

    const mod = await import("./session-manager");
    const id = await mod.createSession({
      sessionType: "scaffold",
      label: "Test session",
    });
    expect(id).toBe("new-session-id");
  });
});
