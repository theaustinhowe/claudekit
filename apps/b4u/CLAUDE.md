# CLAUDE.md — B4U

## Project

B4U is a prototype UI for an automated repo walkthrough video generator. It uses a chat-driven interface with a contextual right panel, progressing through 7 phases.

## Commands

```bash
pnpm dev          # Start dev server (Turbopack, port 2300)
pnpm build        # Production build
pnpm lint         # Biome check
pnpm lint:fix     # Biome check with auto-fix
pnpm format       # Biome format
```

## Architecture

- Single-page app at `src/app/page.tsx` (client component)
- Layout: `LayoutShell` > `AppSidebar` (collapsible) + `AppHeader` (phase stepper) + main content
- State managed via React `useReducer` + Context (`src/lib/store.ts`)
- Phase orchestration in `src/lib/phase-controller.ts`
- Components organized by role: `chat/`, `layout/`, `phases/`, `ui/`

## Theme System

- HSL-based CSS custom properties in `src/app/globals.css`
- 9 color themes: amethyst (default), sapphire, emerald, ruby, amber, slate, midnight, sunset, forest
- Each theme has light (`:root`) and dark (`.dark`) variants
- Tailwind v3 maps tokens via `hsl(var(--token))` pattern in `tailwind.config.ts`
- Use semantic Tailwind classes: `bg-background`, `text-foreground`, `bg-card`, `text-primary`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-sidebar`, etc.
- For inline dynamic styles, use `hsl(var(--token))` — never hardcoded hex colors
- Theme hook: `src/lib/hooks/use-app-theme.ts` — localStorage key `"b4u-theme"`
- Mode switching via `next-themes` (light/dark/system)

## Design System

- Tailwind semantic token colors (not raw color values)
- Sans-serif-first typography (Geist), monospace for code only
- Base UI primitives via @claudekit/ui
- Icons: `lucide-react`
- Animations: `motion` (framer-motion)

## Biome Lint Notes

- Buttons must have `type="button"` (or submit/reset)
- Interactive non-button elements need `role`, `tabIndex`, `onKeyDown`
- Decorative SVGs need `aria-hidden="true"`
- No unused imports, variables, or parameters (prefix with `_` if intentionally unused)
- Use template literals over string concatenation
- `parseInt()` needs radix parameter

## Conventions

- All components use `"use client"` directive (interactive SPA)
- Prefer Tailwind classes over inline styles
- Use `cn()` from `@/lib/utils` for conditional class merging
- TypeScript strict mode enabled
- DuckDB singleton via `globalThis` caching (see `src/lib/db.ts`)
- Database path env var: `DATABASE_PATH` (default: `data/b4u.duckdb`)
