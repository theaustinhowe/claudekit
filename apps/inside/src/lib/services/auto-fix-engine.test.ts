import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies before importing
vi.mock("@/lib/actions/auto-fix", () => ({
  saveAutoFixRun: vi.fn().mockResolvedValue("run-1"),
  updateAutoFixRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./dev-server-manager", () => ({
  onLog: vi.fn().mockReturnValue(() => {}),
  getLogs: vi.fn().mockReturnValue([]),
}));

vi.mock("./session-manager", () => ({
  createSession: vi.fn().mockResolvedValue("session-1"),
  startSession: vi.fn().mockResolvedValue({
    status: "done",
    completionPromise: Promise.resolve(),
  }),
  subscribe: vi.fn().mockReturnValue(() => {}),
  cancelSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session-runners/auto-fix", () => ({
  createAutoFixRunner: vi.fn().mockReturnValue({}),
}));

import { saveAutoFixRun, updateAutoFixRun } from "@/lib/actions/auto-fix";
import { onLog } from "./dev-server-manager";

// We need to import the module after mocks are set up
// Use dynamic import + resetModules to get a clean state per test
let engine: typeof import("./auto-fix-engine");

beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock("@/lib/actions/auto-fix", () => ({
    saveAutoFixRun: vi.fn().mockResolvedValue("run-1"),
    updateAutoFixRun: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock("./dev-server-manager", () => ({
    onLog: vi.fn().mockReturnValue(() => {}),
    getLogs: vi.fn().mockReturnValue([]),
  }));
  vi.doMock("./session-manager", () => ({
    createSession: vi.fn().mockResolvedValue("session-1"),
    startSession: vi.fn().mockResolvedValue({
      status: "done",
      completionPromise: Promise.resolve(),
    }),
    subscribe: vi.fn().mockReturnValue(() => {}),
    cancelSession: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock("./session-runners/auto-fix", () => ({
    createAutoFixRunner: vi.fn().mockReturnValue({}),
  }));

  engine = await import("./auto-fix-engine");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getState", () => {
  it("returns default state for unknown project IDs", () => {
    const state = engine.getState("nonexistent");
    expect(state).toEqual({
      enabled: false,
      status: "idle",
      currentRun: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
      lastError: null,
    });
  });
});

describe("enable / disable", () => {
  it("enable subscribes to dev server logs", async () => {
    const { onLog: mockOnLog } = await import("./dev-server-manager");

    engine.enable("proj-1", "/tmp/proj");

    const state = engine.getState("proj-1");
    expect(state.enabled).toBe(true);
    expect(state.status).toBe("idle");
    expect(vi.mocked(mockOnLog)).toHaveBeenCalledWith("proj-1", expect.any(Function));
  });

  it("disable unsubscribes and clears pending state", async () => {
    const unsubFn = vi.fn();
    const { onLog: mockOnLog } = await import("./dev-server-manager");
    vi.mocked(mockOnLog).mockReturnValue(unsubFn);

    engine.enable("proj-1", "/tmp/proj");
    engine.disable("proj-1");

    const state = engine.getState("proj-1");
    expect(state.enabled).toBe(false);
    expect(unsubFn).toHaveBeenCalled();
  });

  it("enable is idempotent", async () => {
    const { onLog: mockOnLog } = await import("./dev-server-manager");

    engine.enable("proj-1", "/tmp/proj");
    engine.enable("proj-1", "/tmp/proj");

    expect(vi.mocked(mockOnLog)).toHaveBeenCalledTimes(1);
  });

  it("disable on unknown project is a no-op", () => {
    expect(() => engine.disable("nonexistent")).not.toThrow();
  });
});

describe("cancelCurrentFix", () => {
  it("is a no-op when not fixing", () => {
    engine.enable("proj-1", "/tmp/proj");
    // Not in fixing state — should not throw
    expect(() => engine.cancelCurrentFix("proj-1")).not.toThrow();
    expect(engine.getState("proj-1").status).toBe("idle");
  });

  it("is a no-op for unknown project", () => {
    expect(() => engine.cancelCurrentFix("nonexistent")).not.toThrow();
  });
});
