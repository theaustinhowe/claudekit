import { expect, type Page } from "@playwright/test";

/** Assert the page has a visible heading with the given text. */
export async function expectPageTitle(page: Page, title: string | RegExp): Promise<void> {
  await expect(page.locator("h1").first()).toContainText(title);
}

/** Assert a locator is visible on the page. */
export async function expectVisible(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector).first()).toBeVisible();
}

/** Assert the page URL matches a pattern. */
export async function expectUrl(page: Page, pattern: string | RegExp): Promise<void> {
  if (typeof pattern === "string") {
    await expect(page).toHaveURL(new RegExp(pattern));
  } else {
    await expect(page).toHaveURL(pattern);
  }
}
