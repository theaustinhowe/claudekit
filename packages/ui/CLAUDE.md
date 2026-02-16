# @devkit/ui

Shared shadcn/ui components and utilities for all devkit apps.

## Usage

Import components directly from the components path:

```typescript
import { Button } from "@devkit/ui/components/button";
import { cn } from "@devkit/ui";
```

## Components (25)

accordion, alert-dialog, badge, button, card, checkbox, collapsible, dialog, dropdown-menu, input, label, popover, progress, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, tooltip

## Utilities

- `cn(...inputs)` — `clsx` + `tailwind-merge` class name utility

## Dependencies

Components use Radix UI primitives, lucide-react icons, and class-variance-authority for variants. Apps must provide `react`, `react-dom` as peer deps. `sonner` and `next-themes` are optional peers (for the Toaster component).
