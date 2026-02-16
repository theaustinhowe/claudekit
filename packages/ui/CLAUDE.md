# @devkit/ui

Shared UI components and utilities for all devkit apps.

## Usage

Import components directly from the components path:

```typescript
import { Button } from "@devkit/ui/components/button";
import { cn } from "@devkit/ui";
```

## Components (32)

accordion, alert-dialog, badge, button, calendar, card, checkbox, collapsible, dialog, diff-viewer, directory-picker, dropdown-menu, file-tree, file-viewer, input, label, markdown-renderer, popover, progress, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, syntax-highlighter, table, tabs, textarea, tooltip

## Utilities

- `cn(...inputs)` — `clsx` + `tailwind-merge` class name utility
- `Slot` — lightweight slot utility for `asChild` pattern (replaces `@radix-ui/react-slot`)

## Dependencies

Components use **Base UI** (`@base-ui/react`) primitives, lucide-react icons, and class-variance-authority for variants. Apps must provide `react`, `react-dom` as peer deps. `sonner` and `next-themes` are optional peers (for the Toaster component).

### Data Attributes (Base UI)

Base UI uses simplified data attributes compared to Radix:
- `data-[open]` / `data-[closed]` (not `data-[state=open]`)
- `data-[checked]` / `data-[unchecked]` (not `data-[state=checked]`)
- `data-[active]` (not `data-[state=active]`) — used by Tabs for the selected tab
- `data-[highlighted]` (not `focus:` for menu items)
- `data-[hidden]` (for hidden tab panels)

### CSS Variables

Keyframe animations reference Base UI CSS variables:
- `--collapsible-panel-height` (not `--radix-collapsible-content-height`)
- `--accordion-panel-height` (not `--radix-accordion-content-height`)
- `--anchor-width` (not `--radix-select-trigger-width` or `--radix-popover-trigger-width`)
- `--available-height` (not `--radix-dropdown-menu-content-available-height`)

## Storybook

Run Storybook for interactive component development:

```bash
pnpm storybook           # from packages/ui (port 6006)
pnpm --filter @devkit/ui storybook  # from repo root
```

Stories are co-located with components at `src/components/*.stories.tsx`.
