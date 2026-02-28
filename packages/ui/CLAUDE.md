# @claudekit/ui

Shared UI components and utilities for all claudekit apps.

## Usage

Import components directly from the components path:

```typescript
import { Button } from "@claudekit/ui/components/button";
import { cn } from "@claudekit/ui";
```

## Components (37)

about-card, alert-dialog, badge, button, calendar, card, checkbox, collapsible, collapsible-sidebar, dialog, diff-viewer, directory-picker, dropdown-menu, error-boundary, file-tree, file-viewer, input, label, markdown-renderer, nav-link, popover, progress, scroll-area, select, separator, sheet, skeleton, slider, sonner, split-panel, switch, syntax-highlighter, table, tabs, textarea, theme-toggle, tooltip

## Utilities

- `cn(...inputs)` — `clsx` + `tailwind-merge` class name utility
- `Slot` — lightweight slot utility for `asChild` pattern

## Dependencies

Components use **Base UI** (`@base-ui/react`) primitives, lucide-react icons, and class-variance-authority for variants. Apps must provide `react`, `react-dom` as peer deps. `sonner` and `next-themes` are optional peers (for the Toaster component).

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
