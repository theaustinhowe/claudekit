import type { Page } from "playwright";
import type { NavigationOptions } from "./types.js";

const DEFAULT_TIMEOUT = 30_000;

/**
 * Navigate to a URL with networkidle wait and optional fallback.
 * If the primary waitUntil fails (e.g. networkidle timeout), retries with fallbackWaitUntil.
 * Optionally waits an extra `settleMs` for animations/transitions to complete.
 */
export async function navigateTo(page: Page, url: string, options?: NavigationOptions): Promise<void> {
  const waitUntil = options?.waitUntil ?? "networkidle";
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const fallback = options?.fallbackWaitUntil;

  try {
    await page.goto(url, { waitUntil, timeout });
  } catch {
    if (fallback) {
      await page.goto(url, { waitUntil: fallback, timeout });
    } else {
      throw new Error(`Navigation to ${url} failed (waitUntil: ${waitUntil}, timeout: ${timeout}ms)`);
    }
  }

  if (options?.settleMs) {
    await waitForSettle(page, options.settleMs);
  }
}

/**
 * Wait for the page to settle after navigation (animations, transitions, lazy loads).
 */
export async function waitForSettle(page: Page, ms = 2000): Promise<void> {
  await page.waitForTimeout(ms);
}
