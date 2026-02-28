import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./browser", () => ({
  createBrowserSession: vi.fn(),
}));

vi.mock("./navigation", () => ({
  navigateTo: vi.fn(),
}));

import { createBrowserSession } from "./browser";
import { navigateTo } from "./navigation";
import { captureScreenshot } from "./screenshot";

const mockedCreateBrowserSession = vi.mocked(createBrowserSession);
const mockedNavigateTo = vi.mocked(navigateTo);

function createMockSession() {
  const session = {
    page: {
      screenshot: vi.fn().mockResolvedValue(Buffer.from("png-data")),
    },
    close: vi.fn().mockResolvedValue(undefined),
  };
  // BrowserSession has browser/context fields that aren't needed for screenshot tests
  mockedCreateBrowserSession.mockResolvedValue(session as never);
  return session;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedNavigateTo.mockResolvedValue(undefined);
});

describe("captureScreenshot", () => {
  it("runs full lifecycle: create session, navigate, screenshot, close", async () => {
    const session = createMockSession();

    await captureScreenshot("http://localhost:3000");

    expect(mockedCreateBrowserSession).toHaveBeenCalled();
    expect(mockedNavigateTo).toHaveBeenCalledWith(session.page, "http://localhost:3000", expect.any(Object));
    expect(session.page.screenshot).toHaveBeenCalled();
    expect(session.close).toHaveBeenCalled();
  });

  it("uses default viewport 1280x800, settleMs 2000, fullPage false", async () => {
    const session = createMockSession();

    await captureScreenshot("http://localhost:3000");

    expect(mockedCreateBrowserSession).toHaveBeenCalledWith({
      viewport: { width: 1280, height: 800 },
    });
    expect(mockedNavigateTo).toHaveBeenCalledWith(
      session.page,
      "http://localhost:3000",
      expect.objectContaining({ settleMs: 2000 }),
    );
    expect(session.page.screenshot).toHaveBeenCalledWith({
      path: undefined,
      fullPage: false,
    });
  });

  it("propagates custom viewport", async () => {
    createMockSession();

    await captureScreenshot("http://localhost:3000", {
      viewport: { width: 1920, height: 1080 },
    });

    expect(mockedCreateBrowserSession).toHaveBeenCalledWith({
      viewport: { width: 1920, height: 1080 },
    });
  });

  it("forwards fullPage and path options to page.screenshot", async () => {
    const session = createMockSession();

    await captureScreenshot("http://localhost:3000", {
      fullPage: true,
      path: "/tmp/shot.png",
    });

    expect(session.page.screenshot).toHaveBeenCalledWith({
      path: "/tmp/shot.png",
      fullPage: true,
    });
  });

  it("forwards navigation options to navigateTo", async () => {
    createMockSession();

    await captureScreenshot("http://localhost:3000", {
      navigation: {
        timeout: 5000,
        waitUntil: "load",
        fallbackWaitUntil: "domcontentloaded",
        settleMs: 500,
      },
    });

    expect(mockedNavigateTo).toHaveBeenCalledWith(expect.anything(), "http://localhost:3000", {
      timeout: 5000,
      waitUntil: "load",
      fallbackWaitUntil: "domcontentloaded",
      settleMs: 500,
    });
  });

  it("returns buffer, path, width, height", async () => {
    createMockSession();

    const result = await captureScreenshot("http://localhost:3000", {
      path: "/tmp/shot.png",
      viewport: { width: 800, height: 600 },
    });

    expect(result).toEqual({
      buffer: Buffer.from("png-data"),
      path: "/tmp/shot.png",
      width: 800,
      height: 600,
    });
  });

  it("cleans up on navigation error", async () => {
    const session = createMockSession();
    mockedNavigateTo.mockRejectedValue(new Error("nav failed"));

    await expect(captureScreenshot("http://localhost:3000")).rejects.toThrow("nav failed");

    expect(session.close).toHaveBeenCalled();
  });

  it("cleans up on screenshot error", async () => {
    const session = createMockSession();
    session.page.screenshot.mockRejectedValue(new Error("screenshot failed"));

    await expect(captureScreenshot("http://localhost:3000")).rejects.toThrow("screenshot failed");

    expect(session.close).toHaveBeenCalled();
  });
});
