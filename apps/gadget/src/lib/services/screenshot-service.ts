import fs from "node:fs";
import path from "node:path";
import { expandTilde } from "@/lib/utils";

const SCREENSHOTS_DIR = path.join(expandTilde("~"), ".gadget", "screenshots");

interface ScreenshotResult {
  filePath: string;
  width: number;
  height: number;
  fileSize: number;
}

export async function captureScreenshot(projectId: string, port: number): Promise<ScreenshotResult | null> {
  try {
    // Dynamic import for playwright (may not be installed)
    const { chromium } = await import("playwright");

    const projectDir = path.join(SCREENSHOTS_DIR, projectId);
    fs.mkdirSync(projectDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `${timestamp}.png`;
    const filePath = path.join(projectDir, fileName);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });

    try {
      await page.goto(`http://localhost:${port}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      // Extra wait for any animations/transitions to settle
      await page.waitForTimeout(2000);

      await page.screenshot({ path: filePath, fullPage: false });

      const stats = fs.statSync(filePath);

      return {
        filePath,
        width: 1280,
        height: 800,
        fileSize: stats.size,
      };
    } finally {
      await browser.close();
    }
  } catch {
    // Graceful degradation — Playwright may not be installed or screenshot may fail
    return null;
  }
}

export function deleteScreenshotFiles(projectId: string): void {
  const projectDir = path.join(SCREENSHOTS_DIR, projectId);
  try {
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}
