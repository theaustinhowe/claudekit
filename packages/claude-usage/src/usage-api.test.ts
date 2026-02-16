import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before imports
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn().mockReturnValue("/home/testuser"),
}));

// We need to use vi.resetModules() to clear the module-level cache
// between tests since getClaudeRateLimits uses module-level state
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

describe("getClaudeRateLimits", () => {
  let getClaudeRateLimits: typeof import("./usage-api").getClaudeRateLimits;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    // Re-import to clear module-level cache
    const mod = await import("./usage-api");
    getClaudeRateLimits = mod.getClaudeRateLimits;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetch);
  });

  describe("OAuth token retrieval", () => {
    it("uses macOS Keychain on darwin", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

      vi.mocked(execFile).mockImplementation((_cmd, _args, cb: unknown) => {
        (cb as (err: null, result: { stdout: string }) => void)(null, {
          stdout: JSON.stringify({ claudeAiOauth: { accessToken: "keychain-token" } }),
        });
        return {} as ReturnType<typeof execFile>;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 25, resets_at: "2026-02-16T17:00:00Z" },
          seven_day: { utilization: 50, resets_at: "2026-02-23T00:00:00Z" },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(result).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/api/oauth/usage",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer keychain-token",
          }),
        }),
      );

      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    });

    it("falls back to credentials file when Keychain fails on darwin", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

      vi.mocked(execFile).mockImplementation((_cmd, _args, cb: unknown) => {
        (cb as (err: Error) => void)(new Error("keychain error"));
        return {} as ReturnType<typeof execFile>;
      });

      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ claudeAiOauth: { accessToken: "file-token" } }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 10, resets_at: "" },
          seven_day: { utilization: 20, resets_at: "" },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(result).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/api/oauth/usage",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer file-token",
          }),
        }),
      );

      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    });

    it("uses credentials file on linux (no Keychain)", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });

      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ claudeAiOauth: { accessToken: "linux-token" } }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 10, resets_at: "" },
          seven_day: { utilization: 20, resets_at: "" },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(result).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/api/oauth/usage",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer linux-token",
          }),
        }),
      );

      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    });

    it("returns null when no OAuth token is available", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });

      vi.mocked(readFile).mockRejectedValue(new Error("file not found"));

      const result = await getClaudeRateLimits();
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();

      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    });
  });

  describe("API request", () => {
    beforeEach(() => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });

      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ claudeAiOauth: { accessToken: "test-token" } }));
    });

    it("sends correct URL and headers", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 0, resets_at: "" },
          seven_day: { utilization: 0, resets_at: "" },
        }),
      });

      await getClaudeRateLimits();

      expect(mockFetch).toHaveBeenCalledWith("https://api.anthropic.com/api/oauth/usage", {
        headers: {
          Authorization: "Bearer test-token",
          "anthropic-beta": "oauth-2025-04-20",
        },
        signal: expect.any(AbortSignal),
      });
    });

    it("returns null on non-OK status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await getClaudeRateLimits();
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      mockFetch.mockRejectedValue(new Error("network error"));

      const result = await getClaudeRateLimits();
      expect(result).toBeNull();
    });
  });

  describe("response parsing", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ claudeAiOauth: { accessToken: "test-token" } }));
    });

    it("parses five_hour and seven_day windows", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 25.5, resets_at: "2026-02-16T17:00:00Z" },
          seven_day: { utilization: 50, resets_at: "2026-02-23T00:00:00Z" },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(result).toEqual({
        fiveHour: { utilization: 25.5, resetsAt: "2026-02-16T17:00:00Z" },
        sevenDay: { utilization: 50, resetsAt: "2026-02-23T00:00:00Z" },
        modelLimits: {},
        extraUsage: null,
      });
    });

    it("parses model-specific limits from seven_day_ prefixed keys", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 10, resets_at: "" },
          seven_day: { utilization: 20, resets_at: "" },
          seven_day_opus: { utilization: 80, resets_at: "2026-02-23T00:00:00Z" },
          seven_day_sonnet: { utilization: 30, resets_at: "2026-02-23T00:00:00Z" },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(result!.modelLimits).toEqual({
        opus: { utilization: 80, resetsAt: "2026-02-23T00:00:00Z" },
        sonnet: { utilization: 30, resetsAt: "2026-02-23T00:00:00Z" },
      });
    });

    it("skips oauth_apps and cowork keys", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 0, resets_at: "" },
          seven_day: { utilization: 0, resets_at: "" },
          seven_day_oauth_apps: { utilization: 50, resets_at: "" },
          seven_day_cowork: { utilization: 30, resets_at: "" },
          seven_day_opus: { utilization: 10, resets_at: "" },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(result!.modelLimits).toEqual({
        opus: { utilization: 10, resetsAt: "" },
      });
      expect(result!.modelLimits).not.toHaveProperty("oauth_apps");
      expect(result!.modelLimits).not.toHaveProperty("cowork");
    });

    it("parses extra_usage when enabled", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 0, resets_at: "" },
          seven_day: { utilization: 0, resets_at: "" },
          extra_usage: {
            is_enabled: true,
            utilization: 25,
            used_credits: 5,
            monthly_limit: 20,
          },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(result!.extraUsage).toEqual({
        isEnabled: true,
        utilization: 25,
        usedCredits: 5,
        monthlyLimit: 20,
      });
    });

    it("returns null extraUsage when not enabled", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 0, resets_at: "" },
          seven_day: { utilization: 0, resets_at: "" },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(result!.extraUsage).toBeNull();
    });

    it("defaults to zero utilization when windows are missing", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await getClaudeRateLimits();
      expect(result!.fiveHour).toEqual({ utilization: 0, resetsAt: "" });
      expect(result!.sevenDay).toEqual({ utilization: 0, resetsAt: "" });
    });
  });

  describe("caching", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ claudeAiOauth: { accessToken: "test-token" } }));
    });

    it("returns cached result within 60s TTL", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 10, resets_at: "" },
          seven_day: { utilization: 20, resets_at: "" },
        }),
      });

      const result1 = await getClaudeRateLimits();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Within TTL
      vi.advanceTimersByTime(30_000);
      const result2 = await getClaudeRateLimits();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result2).toEqual(result1);

      vi.useRealTimers();
    });

    it("refreshes after 60s TTL expires", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 10, resets_at: "" },
          seven_day: { utilization: 20, resets_at: "" },
        }),
      });

      await getClaudeRateLimits();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Past TTL
      vi.advanceTimersByTime(61_000);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour: { utilization: 50, resets_at: "" },
          seven_day: { utilization: 60, resets_at: "" },
        }),
      });

      const result = await getClaudeRateLimits();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result!.fiveHour.utilization).toBe(50);

      vi.useRealTimers();
    });
  });
});
