import { describe, expect, it, vi } from "vitest";

// We need to mock @playwright/test since page-objects imports types from it
vi.mock("@playwright/test", () => ({
  // Provide type stubs
}));

import { BasePage } from "./page-objects";

// Create a concrete implementation for testing the abstract class
class TestPage extends BasePage {
  constructor(page: ReturnType<typeof createMockPage>, path?: string) {
    super(page as never, path);
  }
}

function createMockPage() {
  const mockLocator = {
    first: vi.fn().mockReturnThis(),
  };
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue(mockLocator),
  };
}

describe("BasePage", () => {
  it("stores the page and default path", () => {
    const page = createMockPage();
    const testPage = new TestPage(page);

    expect(testPage.page).toBe(page);
    expect(testPage.path).toBe("/");
  });

  it("stores a custom path", () => {
    const page = createMockPage();
    const testPage = new TestPage(page, "/settings");

    expect(testPage.path).toBe("/settings");
  });

  it("navigate() calls page.goto with the path", async () => {
    const page = createMockPage();
    const testPage = new TestPage(page, "/dashboard");

    await testPage.navigate();

    expect(page.goto).toHaveBeenCalledWith("/dashboard");
  });

  it("navigate() uses default path '/'", async () => {
    const page = createMockPage();
    const testPage = new TestPage(page);

    await testPage.navigate();

    expect(page.goto).toHaveBeenCalledWith("/");
  });

  it("title getter returns h1 locator", () => {
    const page = createMockPage();
    const testPage = new TestPage(page);

    const result = testPage.title;

    expect(page.locator).toHaveBeenCalledWith("h1");
    expect(result).toBeDefined();
  });

  it("sidebar getter returns [data-sidebar] locator", () => {
    const page = createMockPage();
    const testPage = new TestPage(page);

    const result = testPage.sidebar;

    expect(page.locator).toHaveBeenCalledWith("[data-sidebar]");
    expect(result).toBeDefined();
  });

  it("title and sidebar call .first() on the locator", () => {
    const page = createMockPage();
    const mockLocator = {
      first: vi.fn().mockReturnThis(),
    };
    page.locator.mockReturnValue(mockLocator);

    const testPage = new TestPage(page);

    testPage.title;
    expect(mockLocator.first).toHaveBeenCalled();

    mockLocator.first.mockClear();
    testPage.sidebar;
    expect(mockLocator.first).toHaveBeenCalled();
  });
});
