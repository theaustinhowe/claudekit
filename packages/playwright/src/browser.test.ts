import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

import { chromium } from "playwright";
import { createBrowserSession, createVideoSession } from "./browser";

const mockedLaunch = chromium.launch as unknown as MockInstance;

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
  mockedLaunch.mockResolvedValue(browser);
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
});
