import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

import { cast } from "@claudekit/test-utils";
import { chromium } from "playwright";
import { createBrowserSession, createVideoSession } from "./browser";

const mockedLaunch = vi.mocked(chromium.launch);

// Playwright's Browser type has many EventEmitter methods that can't be
// realistically mocked; centralize the type bypass in this helper
function mockLaunchReturn(browser: { newContext: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }) {
  mockedLaunch.mockResolvedValue(cast(browser));
}

/** Build a mock chain: launch → browser → newContext → context → newPage → page. */
function createMockChain() {
  const page = { mockPage: true };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
  mockLaunchReturn(browser);
  return { browser, context, page };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createBrowserSession", () => {
  it("uses default viewport 1280x800 and headless true", async () => {
    createMockChain();

    await createBrowserSession();

    expect(mockedLaunch).toHaveBeenCalledWith({ headless: true });
  });

  it("propagates custom viewport and headless", async () => {
    const { browser } = createMockChain();

    await createBrowserSession({ viewport: { width: 800, height: 600 }, headless: false });

    expect(mockedLaunch).toHaveBeenCalledWith({ headless: false });
    expect(browser.newContext).toHaveBeenCalledWith({ viewport: { width: 800, height: 600 } });
  });

  it("returns browser, context, page, and close", async () => {
    const mocks = createMockChain();

    const session = await createBrowserSession();

    expect(session.browser).toBe(mocks.browser);
    expect(session.context).toBe(mocks.context);
    expect(session.page).toBe(mocks.page);
    expect(typeof session.close).toBe("function");
  });

  it("close() calls context.close then browser.close", async () => {
    const mocks = createMockChain();

    const session = await createBrowserSession();
    await session.close();

    expect(mocks.context.close).toHaveBeenCalled();
    expect(mocks.browser.close).toHaveBeenCalled();
  });
});

describe("createVideoSession", () => {
  it("uses default viewport 1920x1080", async () => {
    const { browser } = createMockChain();

    await createVideoSession({ videoDir: "/tmp/video" });

    expect(browser.newContext).toHaveBeenCalledWith({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: "/tmp/video", size: { width: 1920, height: 1080 } },
    });
  });

  it("passes recordVideo config with dir and size", async () => {
    const { browser } = createMockChain();

    await createVideoSession({
      videoDir: "/tmp/video",
      viewport: { width: 800, height: 600 },
      videoSize: { width: 400, height: 300 },
    });

    expect(browser.newContext).toHaveBeenCalledWith({
      viewport: { width: 800, height: 600 },
      recordVideo: { dir: "/tmp/video", size: { width: 400, height: 300 } },
    });
  });

  it("defaults videoSize to viewport", async () => {
    const { browser } = createMockChain();

    await createVideoSession({
      videoDir: "/tmp/video",
      viewport: { width: 640, height: 480 },
    });

    expect(browser.newContext).toHaveBeenCalledWith({
      viewport: { width: 640, height: 480 },
      recordVideo: { dir: "/tmp/video", size: { width: 640, height: 480 } },
    });
  });

  it("returns videoDir property", async () => {
    createMockChain();

    const session = await createVideoSession({ videoDir: "/tmp/video" });

    expect(session.videoDir).toBe("/tmp/video");
  });

  it("close() calls context.close then browser.close", async () => {
    const mocks = createMockChain();

    const session = await createVideoSession({ videoDir: "/tmp/video" });
    await session.close();

    expect(mocks.context.close).toHaveBeenCalled();
    expect(mocks.browser.close).toHaveBeenCalled();
  });

  it("uses headless false when specified", async () => {
    createMockChain();

    await createVideoSession({ videoDir: "/tmp/video", headless: false });

    expect(mockedLaunch).toHaveBeenCalledWith({ headless: false });
  });
});

describe("error handling", () => {
  it("createBrowserSession propagates launch errors", async () => {
    mockedLaunch.mockRejectedValue(new Error("Browser launch failed"));

    await expect(createBrowserSession()).rejects.toThrow("Browser launch failed");
  });

  it("createVideoSession propagates launch errors", async () => {
    mockedLaunch.mockRejectedValue(new Error("Browser launch failed"));

    await expect(createVideoSession({ videoDir: "/tmp/video" })).rejects.toThrow("Browser launch failed");
  });

  it("createBrowserSession propagates newContext errors", async () => {
    const browser = {
      newContext: vi.fn().mockRejectedValue(new Error("Context creation failed")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockLaunchReturn(browser);

    await expect(createBrowserSession()).rejects.toThrow("Context creation failed");
  });

  it("createBrowserSession propagates newPage errors", async () => {
    const context = {
      newPage: vi.fn().mockRejectedValue(new Error("Page creation failed")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockLaunchReturn(browser);

    await expect(createBrowserSession()).rejects.toThrow("Page creation failed");
  });
});
