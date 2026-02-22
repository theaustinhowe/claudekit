import { createBrowserSession } from "./browser.js";
import { navigateTo } from "./navigation.js";
import type { ScreenshotOptions, ScreenshotResult } from "./types.js";

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

/**
 * Capture a screenshot of a URL. Handles the full browser lifecycle:
 * launch -> navigate -> settle -> screenshot -> cleanup.
 */
export async function captureScreenshot(url: string, options?: ScreenshotOptions): Promise<ScreenshotResult> {
  const viewport = options?.viewport ?? DEFAULT_VIEWPORT;
  const session = await createBrowserSession({ viewport });

  try {
    await navigateTo(session.page, url, {
      timeout: options?.navigation?.timeout,
      waitUntil: options?.navigation?.waitUntil,
      fallbackWaitUntil: options?.navigation?.fallbackWaitUntil,
      settleMs: options?.navigation?.settleMs ?? 2000,
    });

    const buffer = await session.page.screenshot({
      path: options?.path,
      fullPage: options?.fullPage ?? false,
    });

    return {
      buffer,
      path: options?.path,
      width: viewport.width,
      height: viewport.height,
    };
  } finally {
    await session.close();
  }
}
