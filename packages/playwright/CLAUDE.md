# @claudekit/playwright

Browser automation helpers and E2E testing infrastructure for ClaudeKit apps.

## Structure

```
src/
├── index.ts           # Main exports (browser, navigation, screenshot, video)
├── browser.ts         # Browser/video session factories
├── navigation.ts      # URL navigation with fallback strategies
├── screenshot.ts      # Full-lifecycle screenshot capture
├── video.ts           # Video file finalization
├── types.ts           # Shared types
├── testing.ts         # Testing module exports
└── testing/
    ├── base-config.ts # Playwright config factory for ClaudeKit apps
    ├── fixtures.ts    # appTest fixture (auto-navigate to baseURL)
    ├── assertions.ts  # expectPageTitle, expectVisible, expectUrl
    └── page-objects.ts # BasePage abstract class
```

## Browser Automation

### Sessions

- `createBrowserSession(options?)` → `{ browser, context, page, close() }` — headless Chromium, default 1280x800
- `createVideoSession(options)` → adds `videoDir` for .webm recording, default 1920x1080

### Navigation

- `navigateTo(page, url, options?)` — default: `networkidle` wait, 30s timeout, supports fallback wait strategy
- `waitForSettle(page, ms?)` — waits for animations (default 2000ms)

### Screenshots

- `captureScreenshot(url, options?)` → `{ buffer, path?, width, height }` — full lifecycle: launch → navigate → settle → capture → cleanup

### Video

- `finalizeVideo(rawDir, destPath)` → moves .webm from Playwright's recording dir to destination, cleans up raw dir

## Testing Infrastructure (`./testing`)

Import from `@claudekit/playwright/testing`.

### Config Factory

`createBaseConfig({ appName, port, devCommand?, overrides? })` → full Playwright config with:
- Chromium-only, headless, `testDir: ./e2e`, `outputDir: ./e2e-results`
- CI-aware: retries 2, workers 1, reporter "dot", forbidOnly
- Auto-starts dev server when `devCommand` provided

### Fixtures

- `appTest` — extended Playwright `test` with `appPage` fixture that auto-navigates to `baseURL`

### Assertions

- `expectPageTitle(page, title)` — asserts h1 content
- `expectVisible(page, selector)` — asserts element visibility
- `expectUrl(page, pattern)` — asserts URL matches

### Page Objects

- `BasePage` — abstract class with `navigate()`, `title` (h1 locator), `sidebar` (`[data-sidebar]` locator)

## Dependencies

- `playwright` ^1.58.2
- `@playwright/test` ^1.58.0 (peer, for testing module)
