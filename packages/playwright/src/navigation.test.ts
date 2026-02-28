import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { navigateTo, waitForSettle } from "./navigation";

function createMockPage() {
  return {
    goto: vi.fn() as MockInstance,
    waitForTimeout: vi.fn() as MockInstance,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("navigateTo", () => {
  it("uses networkidle and 30s timeout by default", async () => {
    const page = createMockPage();
    page.goto.mockResolvedValue(null);

    await navigateTo(cast(page), "http://localhost:3000");

    expect(page.goto).toHaveBeenCalledWith("http://localhost:3000", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
  });

  it("propagates custom waitUntil and timeout", async () => {
    const page = createMockPage();
    page.goto.mockResolvedValue(null);

    await navigateTo(cast(page), "http://localhost:3000", {
      waitUntil: "domcontentloaded",
      timeout: 5000,
    });

    expect(page.goto).toHaveBeenCalledWith("http://localhost:3000", {
      waitUntil: "domcontentloaded",
      timeout: 5000,
    });
  });

  it("retries with fallbackWaitUntil when primary fails", async () => {
    const page = createMockPage();
    page.goto.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(null);

    await navigateTo(cast(page), "http://localhost:3000", {
      fallbackWaitUntil: "load",
    });

    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.goto).toHaveBeenNthCalledWith(2, "http://localhost:3000", {
      waitUntil: "load",
      timeout: 30_000,
    });
  });

  it("throws descriptive error when no fallback is set", async () => {
    const page = createMockPage();
    page.goto.mockRejectedValue(new Error("timeout"));

    await expect(navigateTo(cast(page), "http://localhost:3000")).rejects.toThrow(
      "Navigation to http://localhost:3000 failed (waitUntil: networkidle, timeout: 30000ms)",
    );
  });

  it("propagates error when both primary and fallback fail", async () => {
    const page = createMockPage();
    page.goto.mockRejectedValue(new Error("timeout"));

    await expect(navigateTo(cast(page), "http://localhost:3000", { fallbackWaitUntil: "load" })).rejects.toThrow(
      "timeout",
    );
  });

  it("calls waitForTimeout when settleMs is set", async () => {
    const page = createMockPage();
    page.goto.mockResolvedValue(null);
    page.waitForTimeout.mockResolvedValue(undefined);

    await navigateTo(cast(page), "http://localhost:3000", { settleMs: 500 });

    expect(page.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it("skips settle when settleMs is 0", async () => {
    const page = createMockPage();
    page.goto.mockResolvedValue(null);

    await navigateTo(cast(page), "http://localhost:3000", { settleMs: 0 });

    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });

  it("settles even after fallback navigation", async () => {
    const page = createMockPage();
    page.goto.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(null);
    page.waitForTimeout.mockResolvedValue(undefined);

    await navigateTo(cast(page), "http://localhost:3000", {
      fallbackWaitUntil: "load",
      settleMs: 1000,
    });

    expect(page.waitForTimeout).toHaveBeenCalledWith(1000);
  });
});

describe("waitForSettle", () => {
  it("defaults to 2000ms", async () => {
    const page = createMockPage();
    page.waitForTimeout.mockResolvedValue(undefined);

    await waitForSettle(cast(page));

    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
  });

  it("uses custom ms value", async () => {
    const page = createMockPage();
    page.waitForTimeout.mockResolvedValue(undefined);

    await waitForSettle(cast(page), 500);

    expect(page.waitForTimeout).toHaveBeenCalledWith(500);
  });
});
