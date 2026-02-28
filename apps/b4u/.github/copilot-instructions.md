# B4U — Copilot Instructions

## Project Overview
B4U is a prototype UI for an automated repo walkthrough video generator. It uses a chat-driven interface with a contextual right panel, progressing through 7 phases.

## Tech Stack
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 with HSL-based semantic tokens (CSS-based config, no `tailwind.config.*`)
- **State**: React `useReducer` + Context (`src/lib/store.ts`)
- **Database**: DuckDB (singleton via `globalThis` pattern)
- **Linting/Formatting**: Biome.js (not ESLint)
- **Theme**: next-themes + custom color scheme system (9 themes, light/dark/system)

## Formatting Rules (Biome)
- 2-space indent, 120 character line width
- Double quotes, semicolons always, trailing commas
- Run `pnpm format` to format, `pnpm lint` to check

## Theme System
- HSL-based CSS custom properties defined in `src/app/globals.css`
- 9 color themes: amethyst (default), sapphire, emerald, ruby, amber, slate, midnight, sunset, forest
- Each theme has light and dark variants
- Use Tailwind semantic classes: `bg-background`, `text-foreground`, `bg-card`, `text-primary`, `border-border`, etc.
- Never use hardcoded colors — always use theme tokens
- For inline styles, use `hsl(var(--token))` pattern

## Component Patterns
- All components use `"use client"` directive
- No external UI libraries (except Base UI primitives via @claudekit/ui)
- Layout: `LayoutShell` > `AppSidebar` + `AppHeader` + main content
- Icons: `lucide-react`
- Animations: `motion` (framer-motion)

## Key Conventions
- Prefer Tailwind classes over inline styles
- Use `cn()` utility from `@/lib/utils` for conditional classes
- Buttons must have `type="button"` (Biome enforces this)
- Interactive non-button elements need `role`, `tabIndex`, `onKeyDown` handlers
- SVGs need `aria-hidden="true"` if decorative
- DuckDB instances must use `globalThis` caching pattern

## File Organization
- `src/app/` — Next.js pages and API routes (39 endpoints)
- `src/components/chat/` — Chat panel components
- `src/components/layout/` — Layout shell, sidebar, header
- `src/components/phases/` — Right panel phase content (7 phases)
- `src/components/ui/` — Shared UI primitives
- `src/lib/` — State, hooks, utilities, API clients
- `src/lib/db.ts` — DuckDB connection + migrations
- `src/lib/claude/` — Claude AI prompts (7) and session runners (8)
- `src/lib/recording/` — Playwright browser recording engine
- `src/lib/audio/` — ElevenLabs TTS audio generation
- `src/lib/video/` — FFmpeg video merging + chapter generation
- `src/lib/fs/` — Filesystem scanner
- `src/lib/hooks/` — App-specific hooks (state-sync, thread-sync, run-param)
