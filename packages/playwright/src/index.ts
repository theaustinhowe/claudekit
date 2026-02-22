export { createBrowserSession, createVideoSession } from "./browser.js";
export { navigateTo, waitForSettle } from "./navigation.js";
export { captureScreenshot } from "./screenshot.js";
export type {
  Browser,
  BrowserContext,
  BrowserOptions,
  BrowserSession,
  NavigationOptions,
  Page,
  ScreenshotOptions,
  ScreenshotResult,
  VideoRecordingOptions,
  VideoSession,
  ViewportSize,
} from "./types.js";
export { finalizeVideo } from "./video.js";
