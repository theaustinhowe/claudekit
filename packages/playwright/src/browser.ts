import { chromium } from "playwright";
import type { BrowserOptions, BrowserSession, VideoRecordingOptions, VideoSession } from "./types.js";

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

/**
 * Launch a headless Chromium browser with a page ready for use.
 * Call `session.close()` when done to clean up both context and browser.
 */
export async function createBrowserSession(options?: BrowserOptions): Promise<BrowserSession> {
  const viewport = options?.viewport ?? DEFAULT_VIEWPORT;
  const browser = await chromium.launch({ headless: options?.headless ?? true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

/**
 * Launch a browser session configured for video recording.
 * The `videoDir` receives raw `.webm` files from Playwright's recorder.
 */
export async function createVideoSession(options: VideoRecordingOptions): Promise<VideoSession> {
  const viewport = options.viewport ?? { width: 1920, height: 1080 };
  const videoSize = options.videoSize ?? viewport;
  const browser = await chromium.launch({ headless: options.headless ?? true });
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: options.videoDir, size: videoSize },
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    videoDir: options.videoDir,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}
