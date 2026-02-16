# @devkit/hooks

Shared React hooks for all devkit apps.

## Hooks

### `useAppTheme(options?)`
Color theme switching with 9 themes (Amethyst, Sapphire, Emerald, Ruby, Amber, Slate, Midnight, Sunset, Forest). Persists to localStorage, applies CSS class to `<html>`.

Options: `storageKey`, `defaultTheme`

### `useAutoScroll(enabled?)`
Auto-scroll container when content changes. Uses MutationObserver, respects user scroll intent. Returns `{ containerRef, isAtBottom, scrollToBottom }`.

### `useIsMobile()`
Responsive breakpoint detection (768px). Returns `boolean`.

### `useSessionStream(options)`
SSE consumer for session events. Handles connecting, reconnecting (3 retries with exponential backoff), log accumulation, progress/phase tracking, and cancellation.

Options: `sessionId`, `autoConnect`, `onEvent`, `onComplete`, `maxLogs`, `baseUrl`

Returns: `{ status, logs, progress, phase, error, elapsed, events, disconnect, reconnect, cancel }`
