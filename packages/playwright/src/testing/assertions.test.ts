import { describe, expect, it, vi } from "vitest";

const mockContainText = vi.fn().mockResolvedValue(undefined);
const mockBeVisible = vi.fn().mockResolvedValue(undefined);
const mockToHaveURL = vi.fn().mockResolvedValue(undefined);

const mockFirst = vi.fn().mockReturnValue({
  toContainText: mockContainText,
  toBeVisible: mockBeVisible,
});

const mockLocator = vi.fn().mockReturnValue({
  first: mockFirst,
});

vi.mock("@playwright/test", () => ({
  expect: vi.fn().mockImplementation((target) => {
    // If it's a locator result (has toContainText/toBeVisible), return it
    if (target && typeof target === "object" && "toContainText" in target) {
      return target;
    }
    // If it's a page object (for URL checks), return URL matcher
    return {
      toHaveURL: mockToHaveURL,
    };
  }),
}));

import { cast } from "@claudekit/test-utils";
import type { Page } from "@playwright/test";
import { expectPageTitle, expectUrl, expectVisible } from "./assertions";

describe("expectPageTitle", () => {
  it("asserts h1 contains the given text string", async () => {
    const page = cast<Page>({ locator: mockLocator });

    await expectPageTitle(page, "Dashboard");

    expect(mockLocator).toHaveBeenCalledWith("h1");
    expect(mockFirst).toHaveBeenCalled();
    expect(mockContainText).toHaveBeenCalledWith("Dashboard");
  });

  it("asserts h1 contains text matching a RegExp", async () => {
    const page = cast<Page>({ locator: mockLocator });
    const pattern = /Welcome/i;

    await expectPageTitle(page, pattern);

    expect(mockContainText).toHaveBeenCalledWith(pattern);
  });
});

describe("expectVisible", () => {
  it("asserts the first matching element is visible", async () => {
    const page = cast<Page>({ locator: mockLocator });

    await expectVisible(page, "[data-testid='submit']");

    expect(mockLocator).toHaveBeenCalledWith("[data-testid='submit']");
    expect(mockFirst).toHaveBeenCalled();
    expect(mockBeVisible).toHaveBeenCalled();
  });

  it("works with simple CSS selectors", async () => {
    const page = cast<Page>({ locator: mockLocator });

    await expectVisible(page, ".my-class");

    expect(mockLocator).toHaveBeenCalledWith(".my-class");
  });
});

describe("expectUrl", () => {
  it("converts string pattern to RegExp for URL matching", async () => {
    const page = cast<Page>({});

    await expectUrl(page, "/dashboard");

    expect(mockToHaveURL).toHaveBeenCalledWith(/\/dashboard/);
  });

  it("passes RegExp pattern directly for URL matching", async () => {
    const page = cast<Page>({});
    const pattern = /\/settings\/\d+/;

    await expectUrl(page, pattern);

    expect(mockToHaveURL).toHaveBeenCalledWith(pattern);
  });

  it("handles root path string pattern", async () => {
    const page = cast<Page>({});

    await expectUrl(page, "/");

    expect(mockToHaveURL).toHaveBeenCalledWith(/\//);
  });
});
