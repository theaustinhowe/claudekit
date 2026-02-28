import { beforeEach, describe, expect, it, vi } from "vitest";

// Use globalThis to share data between the hoisted mock factory and tests
vi.mock("@playwright/test", () => ({
  test: {
    extend: (fixtures: Record<string, unknown>) => {
      // biome-ignore lint/suspicious/noExplicitAny: storing captured fixtures for test assertions
      (globalThis as any).__capturedFixtures = fixtures;
      return { _fixtures: fixtures };
    },
  },
}));

import { appTest } from "./fixtures";

beforeEach(() => {
  vi.resetAllMocks();
});

// biome-ignore lint/suspicious/noExplicitAny: reading captured fixtures from hoisted mock
function getCapturedFixtures(): Record<string, any> {
  // biome-ignore lint/suspicious/noExplicitAny: reading captured fixtures from hoisted mock
  return (globalThis as any).__capturedFixtures;
}

describe("appTest fixture", () => {
  it("creates an extended test with an appPage fixture", () => {
    const fixtures = getCapturedFixtures();
    expect(fixtures).toHaveProperty("appPage");
    expect(appTest).toHaveProperty("_fixtures");
  });

  it("appPage fixture navigates to baseURL when provided", async () => {
    const fixtures = getCapturedFixtures();
    const appPageFn = fixtures.appPage;

    const mockGoto = vi.fn().mockResolvedValue(undefined);
    const mockUse = vi.fn();
    const page = { goto: mockGoto };

    await appPageFn({ page, baseURL: "http://localhost:3000" }, mockUse);

    expect(mockGoto).toHaveBeenCalledWith("http://localhost:3000");
    expect(mockUse).toHaveBeenCalledWith(page);
  });

  it("appPage fixture skips navigation when baseURL is undefined", async () => {
    const fixtures = getCapturedFixtures();
    const appPageFn = fixtures.appPage;

    const mockGoto = vi.fn();
    const mockUse = vi.fn();
    const page = { goto: mockGoto };

    await appPageFn({ page, baseURL: undefined }, mockUse);

    expect(mockGoto).not.toHaveBeenCalled();
    expect(mockUse).toHaveBeenCalledWith(page);
  });

  it("appPage fixture skips navigation when baseURL is empty string", async () => {
    const fixtures = getCapturedFixtures();
    const appPageFn = fixtures.appPage;

    const mockGoto = vi.fn();
    const mockUse = vi.fn();
    const page = { goto: mockGoto };

    await appPageFn({ page, baseURL: "" }, mockUse);

    expect(mockGoto).not.toHaveBeenCalled();
    expect(mockUse).toHaveBeenCalledWith(page);
  });
});
