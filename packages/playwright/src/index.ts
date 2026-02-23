export { createBrowserSession, createVideoSession } from "./browser";
export { navigateTo, waitForSettle } from "./navigation";
export { captureScreenshot } from "./screenshot";
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
} from "./types";
export { finalizeVideo } from "./video";
