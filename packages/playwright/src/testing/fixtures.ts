import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";

interface AppFixtures {
  /** A page that has already navigated to the app's baseURL. */
  appPage: Page;
}

/**
 * Extended test with an `appPage` fixture that auto-navigates to the baseURL.
 */
export const appTest = base.extend<AppFixtures>({
  appPage: async ({ page, baseURL }, use) => {
    if (baseURL) {
      await page.goto(baseURL);
    }
    await use(page);
  },
});
