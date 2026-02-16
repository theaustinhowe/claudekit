import type { ScriptStep } from "@/lib/types";

interface RecordFlowOptions {
  serverUrl: string;
  flowId: string;
  steps: ScriptStep[];
  outputDir: string;
  onProgress?: (message: string, progress: number) => void;
}

interface RecordingResult {
  videoPath: string;
  durationSeconds: number;
}

export async function recordFlow(options: RecordFlowOptions): Promise<RecordingResult> {
  const { serverUrl, flowId, steps, outputDir, onProgress } = options;

  // Dynamic import to avoid requiring playwright at startup
  const { chromium } = await import("playwright");
  const { join } = await import("node:path");
  const { mkdir } = await import("node:fs/promises");

  await mkdir(outputDir, { recursive: true });

  const videoDir = join(outputDir, `${flowId}-raw`);
  await mkdir(videoDir, { recursive: true });

  onProgress?.("Launching browser", 0);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();
  let totalDuration = 0;

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepProgress = ((i + 1) / steps.length) * 100;
      onProgress?.(`Step ${i + 1}/${steps.length}: ${step.action}`, stepProgress);

      // Navigate if URL changed
      const fullUrl = `${serverUrl}${step.url}`;
      if (page.url() !== fullUrl) {
        await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {
          // Fallback: just wait for load
          return page.goto(fullUrl, { waitUntil: "load", timeout: 15000 });
        });
      }

      // Execute the step action
      await executeStep(page, step);

      // Wait for the specified duration
      const durationMs = parseDuration(step.duration);
      totalDuration += durationMs / 1000;
      await page.waitForTimeout(durationMs);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // Find the recorded video file
  const fs = await import("node:fs");
  const files = fs.readdirSync(videoDir).filter((f: string) => f.endsWith(".webm"));
  if (files.length === 0) throw new Error("No video file produced");

  const srcVideo = join(videoDir, files[0]);
  const destVideo = join(outputDir, `${flowId}.webm`);
  fs.renameSync(srcVideo, destVideo);

  // Cleanup raw dir
  fs.rmSync(videoDir, { recursive: true, force: true });

  return { videoPath: destVideo, durationSeconds: totalDuration };
}

async function executeStep(page: import("playwright").Page, step: ScriptStep): Promise<void> {
  const action = step.action.toLowerCase();

  // Try to interpret the action string
  if (action.includes("click")) {
    // Extract what to click from the action description
    const buttonMatch = step.action.match(/[Cc]lick (?:the |on )?['"]?([^'"]+?)['"]?(?:\s+button|\s+link|\s+tab)?$/);
    const target = buttonMatch?.[1] || step.action.replace(/click\s+/i, "");

    try {
      // Try by text content first
      await page
        .getByRole("button", { name: new RegExp(target, "i") })
        .first()
        .click({ timeout: 5000 });
    } catch {
      try {
        await page.getByText(target, { exact: false }).first().click({ timeout: 5000 });
      } catch {
        // Fallback: just wait
        await page.waitForTimeout(1000);
      }
    }
  } else if (action.includes("type") || action.includes("enter") || action.includes("fill")) {
    // Extract field and value
    const match = step.action.match(/(?:type|enter|fill)\s+['"]([^'"]+)['"].*?(?:in|into)\s+.*?['"]?([^'"]+)['"]?/i);
    if (match) {
      try {
        await page.getByLabel(match[2], { exact: false }).first().fill(match[1], { timeout: 5000 });
      } catch {
        try {
          await page.getByPlaceholder(match[2], { exact: false }).first().fill(match[1], { timeout: 5000 });
        } catch {
          await page.waitForTimeout(1000);
        }
      }
    }
  } else if (action.includes("scroll")) {
    await page.mouse.wheel(0, 300);
  } else if (action.includes("hover")) {
    const target = step.action.replace(/hover\s+(?:over\s+)?/i, "");
    try {
      await page.getByText(target, { exact: false }).first().hover({ timeout: 5000 });
    } catch {
      await page.waitForTimeout(500);
    }
  } else if (action.includes("wait") || action.includes("view") || action.includes("review")) {
    // Just observe - wait a bit
    await page.waitForTimeout(1500);
  } else if (action.includes("navigate") || action.includes("go to")) {
    // Navigation is handled by the URL in the step
    await page.waitForTimeout(1000);
  } else if (action.includes("drag")) {
    // Drag actions are complex - just wait
    await page.waitForTimeout(2000);
  } else {
    // Unknown action - try clicking any matching text
    try {
      const keywords = step.action
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 3);
      for (const keyword of keywords) {
        const el = page.getByText(keyword, { exact: false }).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          break;
        }
      }
    } catch {
      await page.waitForTimeout(1000);
    }
  }
}

function parseDuration(duration: string): number {
  const match = duration.match(/(\d+(?:\.\d+)?)\s*s/);
  return match ? parseFloat(match[1]) * 1000 : 3000;
}
