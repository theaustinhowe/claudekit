import type { Locator, Page } from "@playwright/test";

/**
 * Base page object with common navigation and locator helpers.
 * Extend this for app-specific page objects.
 */
export abstract class BasePage {
  constructor(
    readonly page: Page,
    readonly path: string = "/",
  ) {}

  async navigate(): Promise<void> {
    await this.page.goto(this.path);
  }

  get title(): Locator {
    return this.page.locator("h1").first();
  }

  get sidebar(): Locator {
    return this.page.locator("[data-sidebar]").first();
  }
}
