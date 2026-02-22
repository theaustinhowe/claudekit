import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScriptStep } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPage = {
  url: vi.fn().mockReturnValue(""),
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  mouse: { wheel: vi.fn().mockResolvedValue(undefined) },
  getByRole: vi.fn().mockReturnValue({
    first: () => ({
      click: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  getByText: vi.fn().mockReturnValue({
    first: () => ({
      click: vi.fn().mockResolvedValue(undefined),
      hover: vi.fn().mockResolvedValue(undefined),
      isVisible: vi.fn().mockResolvedValue(true),
    }),
  }),
  getByLabel: vi.fn().mockReturnValue({
    first: () => ({
      fill: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  getByPlaceholder: vi.fn().mockReturnValue({
    first: () => ({
      fill: vi.fn().mockResolvedValue(undefined),
    }),
  }),
};

const mockSession = {
  page: mockPage,
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@devkit/playwright", () => ({
  createVideoSession: vi.fn().mockResolvedValue(mockSession),
  finalizeVideo: vi.fn().mockReturnValue("/output/flow.webm"),
  navigateTo: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<ScriptStep> = {}): ScriptStep {
  return {
    id: "step-1",
    stepNumber: 1,
    url: "/dashboard",
    action: "View the dashboard",
    expectedOutcome: "Dashboard is visible",
    duration: "3s",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recordFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.url.mockReturnValue("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates output directories and returns video path", async () => {
    const { recordFlow } = await import("./playwright-runner");
    const { mkdir } = await import("node:fs/promises");

    const result = await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "login-flow",
      steps: [makeStep()],
      outputDir: "/tmp/output",
    });

    expect(mkdir).toHaveBeenCalledWith("/tmp/output", { recursive: true });
    expect(mkdir).toHaveBeenCalledWith("/tmp/output/login-flow-raw", { recursive: true });
    expect(result.videoPath).toBe("/tmp/output/login-flow.webm");
    expect(result.durationSeconds).toBe(3);
  });

  it("calls createVideoSession with correct options", async () => {
    const { recordFlow } = await import("./playwright-runner");
    const { createVideoSession } = await import("@devkit/playwright");

    await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "test-flow",
      steps: [makeStep()],
      outputDir: "/tmp/output",
    });

    expect(createVideoSession).toHaveBeenCalledWith({
      videoDir: "/tmp/output/test-flow-raw",
      viewport: { width: 1920, height: 1080 },
    });
  });

  it("navigates to URLs for each step", async () => {
    const { recordFlow } = await import("./playwright-runner");
    const { navigateTo } = await import("@devkit/playwright");

    await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "nav-flow",
      steps: [
        makeStep({ url: "/page-a", action: "View page A" }),
        makeStep({ id: "step-2", stepNumber: 2, url: "/page-b", action: "View page B" }),
      ],
      outputDir: "/tmp/output",
    });

    expect(navigateTo).toHaveBeenCalledWith(mockPage, "http://localhost:3000/page-a", {
      timeout: 15000,
      fallbackWaitUntil: "load",
    });
    expect(navigateTo).toHaveBeenCalledWith(mockPage, "http://localhost:3000/page-b", {
      timeout: 15000,
      fallbackWaitUntil: "load",
    });
  });

  it("skips navigation when page is already at the URL", async () => {
    const { recordFlow } = await import("./playwright-runner");
    const { navigateTo } = await import("@devkit/playwright");

    mockPage.url.mockReturnValue("http://localhost:3000/dashboard");

    await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "same-url",
      steps: [makeStep({ url: "/dashboard" })],
      outputDir: "/tmp/output",
    });

    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("calls onProgress with step info", async () => {
    const { recordFlow } = await import("./playwright-runner");
    const onProgress = vi.fn();

    await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "progress-flow",
      steps: [
        makeStep({ action: "Do step one" }),
        makeStep({ id: "step-2", stepNumber: 2, action: "Do step two" }),
      ],
      outputDir: "/tmp/output",
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith("Launching browser", 0);
    expect(onProgress).toHaveBeenCalledWith("Step 1/2: Do step one", 50);
    expect(onProgress).toHaveBeenCalledWith("Step 2/2: Do step two", 100);
  });

  it("sums durations correctly", async () => {
    const { recordFlow } = await import("./playwright-runner");

    const result = await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "duration-flow",
      steps: [
        makeStep({ duration: "2s" }),
        makeStep({ id: "step-2", stepNumber: 2, duration: "5s" }),
        makeStep({ id: "step-3", stepNumber: 3, duration: "1.5s" }),
      ],
      outputDir: "/tmp/output",
    });

    expect(result.durationSeconds).toBe(8.5);
  });

  it("uses default duration of 3s when format is unrecognized", async () => {
    const { recordFlow } = await import("./playwright-runner");

    const result = await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "default-dur",
      steps: [makeStep({ duration: "unknown" })],
      outputDir: "/tmp/output",
    });

    expect(result.durationSeconds).toBe(3);
  });

  it("closes session even when steps throw", async () => {
    const { recordFlow } = await import("./playwright-runner");
    const { navigateTo } = (await import("@devkit/playwright")) as unknown as { navigateTo: ReturnType<typeof vi.fn> };

    navigateTo.mockRejectedValueOnce(new Error("Navigation failed"));

    await expect(
      recordFlow({
        serverUrl: "http://localhost:3000",
        flowId: "error-flow",
        steps: [makeStep()],
        outputDir: "/tmp/output",
      }),
    ).rejects.toThrow("Navigation failed");

    expect(mockSession.close).toHaveBeenCalled();
  });

  it("finalizes video after recording", async () => {
    const { recordFlow } = await import("./playwright-runner");
    const { finalizeVideo } = await import("@devkit/playwright");

    await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "finalize-flow",
      steps: [makeStep()],
      outputDir: "/tmp/output",
    });

    expect(finalizeVideo).toHaveBeenCalledWith("/tmp/output/finalize-flow-raw", "/tmp/output/finalize-flow.webm");
  });

  it("handles click action", async () => {
    const { recordFlow } = await import("./playwright-runner");

    await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "click-flow",
      steps: [makeStep({ action: "Click the Submit button" })],
      outputDir: "/tmp/output",
    });

    expect(mockPage.getByRole).toHaveBeenCalledWith("button", {
      name: expect.any(RegExp),
    });
  });

  it("handles scroll action", async () => {
    const { recordFlow } = await import("./playwright-runner");

    await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "scroll-flow",
      steps: [makeStep({ action: "Scroll down to see more" })],
      outputDir: "/tmp/output",
    });

    expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, 300);
  });

  it("handles wait/view/review actions as pauses", async () => {
    const { recordFlow } = await import("./playwright-runner");

    await recordFlow({
      serverUrl: "http://localhost:3000",
      flowId: "wait-flow",
      steps: [makeStep({ action: "Wait for the page to load" })],
      outputDir: "/tmp/output",
    });

    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1500);
  });
});
