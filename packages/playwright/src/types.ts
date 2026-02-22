import type { Browser, BrowserContext, Page } from "playwright";

export type { Browser, BrowserContext, Page };

export interface ViewportSize {
  width: number;
  height: number;
}

export interface BrowserOptions {
  headless?: boolean;
  viewport?: ViewportSize;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export interface NavigationOptions {
  waitUntil?: "networkidle" | "load" | "domcontentloaded" | "commit";
  timeout?: number;
  fallbackWaitUntil?: "load" | "domcontentloaded" | "commit";
  settleMs?: number;
}

export interface VideoRecordingOptions extends BrowserOptions {
  videoDir: string;
  videoSize?: ViewportSize;
}

export interface VideoSession extends BrowserSession {
  videoDir: string;
}

export interface ScreenshotOptions {
  viewport?: ViewportSize;
  path?: string;
  fullPage?: boolean;
  navigation?: NavigationOptions;
}

export interface ScreenshotResult {
  buffer: Buffer;
  path?: string;
  width: number;
  height: number;
}
