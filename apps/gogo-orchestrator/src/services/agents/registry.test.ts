import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunner } from "./types.js";

function createMockRunner(type: string, displayName?: string): AgentRunner {
  return {
    type,
    displayName: displayName ?? type,
    capabilities: { canResume: false, canInject: false, supportsStreaming: true },
    start: async () => ({ success: true }),
    stop: async () => true,
    isRunning: () => false,
    getActiveRunCount: () => 0,
  };
}

describe("agent registry", () => {
  let AgentRegistryModule: typeof import("./registry.js");

  beforeEach(async () => {
    // Re-import to get a fresh singleton each time
    vi.resetModules();
    AgentRegistryModule = await import("./registry.js");
  });

  describe("register", () => {
    it("should register a runner", () => {
      const { agentRegistry } = AgentRegistryModule;
      const runner = createMockRunner("test-runner");

      agentRegistry.register(runner);

      expect(agentRegistry.has("test-runner")).toBe(true);
    });

    it("should throw when registering a duplicate type", () => {
      const { agentRegistry } = AgentRegistryModule;
      const runner = createMockRunner("duplicate");

      agentRegistry.register(runner);

      expect(() => agentRegistry.register(createMockRunner("duplicate"))).toThrow(
        "Agent runner 'duplicate' is already registered",
      );
    });

    it("should set first registered runner as default", () => {
      const { agentRegistry } = AgentRegistryModule;
      const runner = createMockRunner("first");

      agentRegistry.register(runner);

      expect(agentRegistry.getDefault()).toBe(runner);
    });

    it("should set runner as default when isDefault is true", () => {
      const { agentRegistry } = AgentRegistryModule;
      const first = createMockRunner("first");
      const second = createMockRunner("second");

      agentRegistry.register(first);
      agentRegistry.register(second, true);

      expect(agentRegistry.getDefault()).toBe(second);
    });

    it("should not change default when isDefault is false", () => {
      const { agentRegistry } = AgentRegistryModule;
      const first = createMockRunner("first");
      const second = createMockRunner("second");

      agentRegistry.register(first);
      agentRegistry.register(second);

      expect(agentRegistry.getDefault()).toBe(first);
    });
  });

  describe("get", () => {
    it("should return a registered runner", () => {
      const { agentRegistry } = AgentRegistryModule;
      const runner = createMockRunner("claude-code", "Claude Code");

      agentRegistry.register(runner);

      expect(agentRegistry.get("claude-code")).toBe(runner);
    });

    it("should return undefined for unregistered type", () => {
      const { agentRegistry } = AgentRegistryModule;

      expect(agentRegistry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("getDefault", () => {
    it("should return undefined when no runners registered", () => {
      const { agentRegistry } = AgentRegistryModule;

      expect(agentRegistry.getDefault()).toBeUndefined();
    });
  });

  describe("setDefault", () => {
    it("should set default to a registered type", () => {
      const { agentRegistry } = AgentRegistryModule;
      const first = createMockRunner("first");
      const second = createMockRunner("second");

      agentRegistry.register(first);
      agentRegistry.register(second);
      agentRegistry.setDefault("second");

      expect(agentRegistry.getDefault()).toBe(second);
    });

    it("should throw when setting default to unregistered type", () => {
      const { agentRegistry } = AgentRegistryModule;

      expect(() => agentRegistry.setDefault("nonexistent")).toThrow(
        "Cannot set default: agent type 'nonexistent' is not registered",
      );
    });
  });

  describe("getAll", () => {
    it("should return all registered runners", () => {
      const { agentRegistry } = AgentRegistryModule;
      const r1 = createMockRunner("a");
      const r2 = createMockRunner("b");

      agentRegistry.register(r1);
      agentRegistry.register(r2);

      const all = agentRegistry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(r1);
      expect(all).toContain(r2);
    });

    it("should return empty array when none registered", () => {
      const { agentRegistry } = AgentRegistryModule;

      expect(agentRegistry.getAll()).toEqual([]);
    });
  });

  describe("has", () => {
    it("should return true for registered type", () => {
      const { agentRegistry } = AgentRegistryModule;
      agentRegistry.register(createMockRunner("exists"));

      expect(agentRegistry.has("exists")).toBe(true);
    });

    it("should return false for unregistered type", () => {
      const { agentRegistry } = AgentRegistryModule;

      expect(agentRegistry.has("missing")).toBe(false);
    });
  });

  describe("getTypes", () => {
    it("should return all registered type identifiers", () => {
      const { agentRegistry } = AgentRegistryModule;
      agentRegistry.register(createMockRunner("alpha"));
      agentRegistry.register(createMockRunner("beta"));

      expect(agentRegistry.getTypes()).toEqual(["alpha", "beta"]);
    });
  });

  describe("listInfo", () => {
    it("should return info objects for all runners", () => {
      const { agentRegistry } = AgentRegistryModule;
      agentRegistry.register(createMockRunner("claude-code", "Claude Code"));

      const info = agentRegistry.listInfo();

      expect(info).toEqual([
        {
          type: "claude-code",
          displayName: "Claude Code",
          capabilities: { canResume: false, canInject: false, supportsStreaming: true },
        },
      ]);
    });
  });

  describe("getTotalActiveRunCount", () => {
    it("should sum active run counts across all runners", () => {
      const { agentRegistry } = AgentRegistryModule;
      const r1 = createMockRunner("a");
      const r2 = createMockRunner("b");
      r1.getActiveRunCount = () => 3;
      r2.getActiveRunCount = () => 2;

      agentRegistry.register(r1);
      agentRegistry.register(r2);

      expect(agentRegistry.getTotalActiveRunCount()).toBe(5);
    });

    it("should return 0 when no runners registered", () => {
      const { agentRegistry } = AgentRegistryModule;

      expect(agentRegistry.getTotalActiveRunCount()).toBe(0);
    });
  });
});
