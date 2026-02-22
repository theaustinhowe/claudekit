import fs from "node:fs";
import path from "node:path";
import { captureScreenshot as playwrightScreenshot } from "@claudekit/playwright";
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
    const projectDir = path.join(SCREENSHOTS_DIR, projectId);
    fs.mkdirSync(projectDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `${timestamp}.png`;
    const filePath = path.join(projectDir, fileName);

    await playwrightScreenshot(`http://localhost:${port}`, {
      viewport: { width: 1280, height: 800 },
      path: filePath,
      navigation: { timeout: 30_000, settleMs: 2000 },
    });

    const stats = fs.statSync(filePath);

    return {
      filePath,
      width: 1280,
      height: 800,
      fileSize: stats.size,
    };
  } catch {
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
