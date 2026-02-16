import { describe, expect, it, vi } from "vitest";
import { TIMEOUTS, withTimeout } from "./timeout.js";

describe("timeout", () => {
  describe("TIMEOUTS constants", () => {
    it("should have expected timeout values", () => {
      expect(TIMEOUTS.GITHUB_API).toBe(30_000);
      expect(TIMEOUTS.GIT_OPERATION).toBe(120_000);
      expect(TIMEOUTS.DATABASE_QUERY).toBe(10_000);
      expect(TIMEOUTS.PROCESS_TERM).toBe(5_000);
    });
  });

  describe("withTimeout", () => {
    it("should resolve when promise completes before timeout", async () => {
      const result = await withTimeout(Promise.resolve("success"), 1000, "test-op");
      expect(result).toBe("success");
    });

    it("should pass through the resolved value", async () => {
      const data = { id: 1, name: "test" };
      const result = await withTimeout(Promise.resolve(data), 1000, "test-op");
      expect(result).toEqual(data);
    });

    it("should throw TimeoutError when promise exceeds timeout", async () => {
      vi.useFakeTimers();

      const neverResolves = new Promise<string>(() => {});

      const promise = withTimeout(neverResolves, 100, "slow-operation");

      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow('Operation "slow-operation" timed out after 100ms');

      vi.useRealTimers();
    });

    it("should include operationName and timeoutMs in TimeoutError", async () => {
      vi.useFakeTimers();

      const neverResolves = new Promise<string>(() => {});

      const promise = withTimeout(neverResolves, 250, "fetch-issues");

      vi.advanceTimersByTime(250);

      try {
        await promise;
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).name).toBe("TimeoutError");
        expect((error as { operationName: string }).operationName).toBe("fetch-issues");
        expect((error as { timeoutMs: number }).timeoutMs).toBe(250);
      }

      vi.useRealTimers();
    });

    it("should propagate errors from the original promise", async () => {
      const err = new Error("Original error");
      await expect(withTimeout(Promise.reject(err), 1000, "test-op")).rejects.toThrow("Original error");
    });

    it("should clear timeout after promise resolves", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

      await withTimeout(Promise.resolve("ok"), 5000, "test-op");

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("should clear timeout after promise rejects", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

      await withTimeout(Promise.reject(new Error("fail")), 5000, "test-op").catch(() => {});

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
