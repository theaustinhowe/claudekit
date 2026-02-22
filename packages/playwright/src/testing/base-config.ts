import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

interface BaseConfigOptions {
  appName: string;
  port: number;
  devCommand?: string;
  overrides?: Partial<PlaywrightTestConfig>;
}

/**
 * Create a Playwright test config for a ClaudeKit app.
 * Provides sensible defaults: Chromium-only, headless, webServer auto-start.
 */
export function createBaseConfig(options: BaseConfigOptions): PlaywrightTestConfig {
  const { appName, port, devCommand, overrides } = options;
  const baseURL = `http://localhost:${port}`;

  return defineConfig({
    testDir: "./e2e",
    outputDir: "./e2e-results",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? "dot" : "list",
    use: {
      baseURL,
      headless: true,
      screenshot: "only-on-failure",
      trace: "on-first-retry",
      actionTimeout: 10_000,
    },
    projects: [
      {
        name: appName,
        use: { browserName: "chromium" },
      },
    ],
    ...(devCommand
      ? {
          webServer: {
            command: devCommand,
            port,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
          },
        }
      : {}),
    ...overrides,
  });
}
