# @claudekit/ui

Shared UI components, layout system, and utilities for all claudekit apps.

## Usage

```typescript
// Components (direct path imports)
import { Button } from "@claudekit/ui/components/button";
import { Card } from "@claudekit/ui/components/card";

// Shared layout system
import { AppLayout, SharedHeader, SharedFooter } from "@claudekit/ui/components/shared-layout";

// Utilities and types from main entry
import { cn, formatBytes, timeAgo } from "@claudekit/ui";
import type { FileTreeEntry } from "@claudekit/ui";

// Next.js config helpers
import { createNextConfig, securityHeaders } from "@claudekit/ui/next-config";

// Shared styles
import "@claudekit/ui/styles/base.css";
```

## Directory Tree

```
src/
  index.ts                       # Main entry: cn, format helpers, types
  utils.ts                       # Utility functions
  types.ts                       # Shared types (FileTreeEntry, FileContent, etc.)
  slot.tsx                       # Internal Slot utility (used by button)
  next-config.ts                 # createNextConfig + securityHeaders
  components/
    *.tsx                        # 54 component files
    *.stories.tsx                # Co-located Storybook stories
    shared-layout/
      index.ts                   # Layout system barrel export
      types.ts                   # AppLayoutConfig, NavItem, NavGroup, etc.
      app-layout.tsx             # Full app shell with sidebar + header
      shared-header.tsx          # Top header bar
      shared-footer.tsx          # Cross-app footer with port links
      shared-sidebar.tsx         # Collapsible sidebar navigation
      mobile-nav.tsx             # Mobile bottom nav + sidebar
      content-banner.tsx         # Optional content banner
  styles/
    base.css                     # Base style definitions
    themes.css                   # Theme CSS custom properties
```

## Components (54)

about-card, alert-dialog, app-shell, badge, button, calendar, card, checkbox, collapsible, collapsible-sidebar, color-scheme-picker, date-picker, dialog, diff-viewer, directory-picker, dropdown-menu, error-boundary, error-page, file-tree, file-viewer, global-error-page, input, json-editor, label, markdown-renderer, nav-link, not-found-page, page-tabs, popover, process-cleanup, progress, scroll-area, select, separator, session-badge, session-indicator, session-panel, session-provider, session-terminal, sheet, skeleton, slider, sonner, split-panel, streaming-display, switch, syntax-highlighter, table, tabs, textarea, theme-toggle, time-picker, timestamp-picker, tooltip

## Shared Layout System

Importable via `@claudekit/ui/components/shared-layout`:

- `AppLayout` — full app shell (sidebar + header + content area)
- `SharedHeader` — top header bar with logo, nav, and status
- `SharedFooter` — cross-app footer with port links
- `SharedSidebar` — collapsible sidebar navigation
- `ContentBanner` — optional banner above content
- `MobileBottomNav`, `MobileMenuButton`, `MobileSidebar` — mobile navigation

### Types

- `AppLayoutConfig` — per-app layout configuration (appId, logo, nav, port)
- `AppLayoutProps` — props for `<AppLayout>` (config, children, statusIndicator, etc.)
- `NavItem`, `NavGroup` — navigation item/group definitions
- `LogoConfig` — icon + wordmark for sidebar header
- `ClaudeKitAppLink` — cross-app footer link definition

## Utilities (from main entry `@claudekit/ui`)

- `cn(...inputs)` — `clsx` + `tailwind-merge` class name utility
- `formatElapsed(seconds)` — format seconds as `Xm Ys`
- `formatBytes(bytes)` — format bytes as `X KB`, `X MB`
- `formatNumber(n)` — locale-formatted number
- `timeAgo(date)` — relative time string (`5m ago`, `2h ago`)
- `generateId()` — `crypto.randomUUID()` wrapper
- `nowTimestamp()` — current ISO timestamp string
- `parseGitHubUrl(url)` — extract `{ owner, repo }` from GitHub URL
- `expandTilde(filepath)` — expand `~` to `$HOME`
- `removeDirectory(dirPath)` — move to Trash (macOS) with rm fallback
- `IMAGE_EXTENSIONS` — `Set` of common image file extensions

## Exported Types

- `FileTreeEntry` — tree node with name, path, type, children
- `FileContent` — file content with path, content, language, isBinary
- `DirectoryEntry` — directory listing entry with name, path, hasChildren
- `BrowseResult` — directory browse result with entries and navigation

## Next.js Config (`@claudekit/ui/next-config`)

- `createNextConfig(options?)` — returns a `NextConfig` with security headers and optional `serverExternalPackages`
- `securityHeaders()` — returns security header rules (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-XSS-Protection)

## Dependencies

Components use **Base UI** (`@base-ui/react`) primitives, `lucide-react` icons, and `class-variance-authority` for variants. Additional dependencies include `react-day-picker` (calendar), `react-markdown` + `remark-gfm` (markdown rendering), `shiki` (syntax highlighting), and `@dayflow/blossom-color-picker` (color picker).

Apps must provide `react`, `react-dom` as peer deps. Optional peers: `next`, `next-themes`, `sonner` (toaster), `motion` (animations), `@claudekit/hooks`, `@claudekit/session`.

### Data Attributes (Base UI)

Base UI uses simplified data attributes:
- `data-[open]` / `data-[closed]` for open/close state
- `data-[checked]` / `data-[unchecked]` for checked state
- `data-[active]` for active state — used by Tabs for the selected tab
- `data-[highlighted]` for highlighted menu items
- `data-[hidden]` for hidden tab panels

### CSS Variables

Keyframe animations reference Base UI CSS variables:
- `--collapsible-panel-height` for collapsible content height
- `--anchor-width` for trigger width (used by select, popover)
- `--available-height` for available dropdown height

## Storybook

Run Storybook for interactive component development:

```bash
pnpm storybook           # from packages/ui (port 6006)
pnpm --filter @claudekit/ui storybook  # from repo root
```

Stories are co-located with components at `src/components/*.stories.tsx`.

## Scripts

| Script | Command |
|--------|---------|
| `dev` | `storybook dev -p 6006 --no-open` |
| `build` | `tsc --noEmit` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `biome check .` |
| `format` | `biome format --write .` |
| `test` | `vitest run` |
| `storybook` | `storybook dev -p 6006 --no-open` |
| `build-storybook` | `storybook build` |
