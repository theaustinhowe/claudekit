import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({
  defineConfig: vi.fn((config) => config),
}));

import { createBaseConfig } from "./base-config.js";

let savedCI: string | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  savedCI = process.env.CI;
  delete process.env.CI;
});

import { afterEach } from "vitest";

afterEach(() => {
  if (savedCI !== undefined) {
    process.env.CI = savedCI;
  } else {
    delete process.env.CI;
  }
});

describe("createBaseConfig", () => {
  it("constructs baseURL from port", () => {
    const config = createBaseConfig({ appName: "web", port: 3000 });

    expect(config.use?.baseURL).toBe("http://localhost:3000");
  });

  it("sets project name from appName with chromium", () => {
    const config = createBaseConfig({ appName: "gadget", port: 2100 });

    expect(config.projects).toEqual([{ name: "gadget", use: { browserName: "chromium" } }]);
  });

  it("uses non-CI defaults: retries 0, forbidOnly false, workers undefined, reporter list", () => {
    const config = createBaseConfig({ appName: "web", port: 3000 });

    expect(config.retries).toBe(0);
    expect(config.forbidOnly).toBe(false);
    expect(config.workers).toBeUndefined();
    expect(config.reporter).toBe("list");
  });

  it("uses CI overrides: retries 2, forbidOnly true, workers 1, reporter dot", () => {
    process.env.CI = "true";

    const config = createBaseConfig({ appName: "web", port: 3000 });

    expect(config.retries).toBe(2);
    expect(config.forbidOnly).toBe(true);
    expect(config.workers).toBe(1);
    expect(config.reporter).toBe("dot");
  });

  it("includes webServer config when devCommand is provided", () => {
    const config = createBaseConfig({
      appName: "web",
      port: 3000,
      devCommand: "pnpm dev:web",
    });

    expect(config.webServer).toEqual({
      command: "pnpm dev:web",
      port: 3000,
      reuseExistingServer: true,
      timeout: 60_000,
    });
  });

  it("omits webServer when no devCommand", () => {
    const config = createBaseConfig({ appName: "web", port: 3000 });

    expect(config.webServer).toBeUndefined();
  });

  it("spreads overrides on top of defaults", () => {
    const config = createBaseConfig({
      appName: "web",
      port: 3000,
      overrides: { retries: 5, testDir: "./custom-tests" },
    });

    expect(config.retries).toBe(5);
    expect(config.testDir).toBe("./custom-tests");
  });
});
