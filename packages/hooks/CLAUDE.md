# @claudekit/hooks

Shared React hooks and utilities for all claudekit apps.

## Hooks

### `useAppTheme(options?)`
Color theme switching with 9 themes (Amethyst, Sapphire, Emerald, Ruby, Amber, Slate, Midnight, Sunset, Forest). Persists to localStorage, applies CSS class to `<html>`.

Options: `storageKey`, `defaultTheme`

Returns: `{ theme, setTheme, currentTheme, themes, mounted }`

### `useAutoScroll(enabled?)`
Auto-scroll container when content changes. Uses MutationObserver, respects user scroll intent. Returns `{ containerRef, isAtBottom, scrollToBottom }`.

### `useIsMobile()`
Responsive breakpoint detection (768px). Returns `boolean`.

### `useSessionStream(options)`
SSE consumer for session events. Handles connecting, reconnecting (3 retries with exponential backoff), log accumulation, progress/phase tracking, and cancellation.

Options: `sessionId`, `autoConnect`, `onEvent`, `onComplete`, `maxLogs`, `baseUrl`

Returns: `{ status, logs, progress, phase, error, elapsed, events, disconnect, reconnect, cancel }`

### `useClaudeUsageRefresh(options)`
Fetches Claude usage stats and rate limits via dependency-injected server actions. Auto-refreshes when the soonest rate-limit window resets.

Options: `getUsageStats`, `getRateLimits` (async functions passed from each app's server actions)

Returns: `{ claudeUsage, rateLimits, usageDialogOpen, setUsageDialogOpen, refreshUsage }`

## Utilities

### `ThemeFOUCScript`
Server component that renders an inline `<script>` to apply the saved color theme class before React hydrates, preventing a flash of unstyled content. Place in root layout's `<body>` or `<head>`.

Props: `storageKey?` (default: `"claudekit-theme"`)

### `THEMES`
Array of `ThemeDefinition` objects (`{ id, label, description, hue }`) for all 9 themes. Also exports the `ThemeId` type.
