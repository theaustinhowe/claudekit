# CLAUDE.md — B4U

## Overview

**B4U** is a **Next.js 16 App Router** local-first tool for automated repo walkthrough video generation. It uses a chat-driven interface with a contextual right panel, progressing through 7 phases: Project Selection, App Outline, Data & Env Plan, Demo Scripts, Recording, Voiceover, and Final Output. All imports use the `@/` alias for `src/`.

## Port

**2300** -- `pnpm dev:b4u` or `pnpm --filter b4u dev`

## Commands

```bash
pnpm --filter b4u dev        # Start dev server on port 2300 (Turbopack)
pnpm --filter b4u build      # Production build
pnpm --filter b4u typecheck  # TypeScript check
pnpm --filter b4u test       # Run tests
pnpm --filter b4u lint       # Biome check
pnpm --filter b4u lint:fix   # Biome check with auto-fix
pnpm --filter b4u format     # Biome format
pnpm --filter b4u db:reset   # Delete data/b4u.duckdb
pnpm --filter b4u db:seed    # Re-seed built-in data
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ELEVENLABS_API_KEY` | No | ElevenLabs TTS API key for voice narration |
| `DATABASE_PATH` | No | Override DB path (default: `data/b4u.duckdb`) |

## Architecture

### Directory Layout

```
src/
├── app/                         # Next.js App Router
│   ├── layout.tsx               # Root layout (fonts, ThemeProvider, NuqsAdapter)
│   ├── page.tsx                 # Main SPA page (client component)
│   └── api/                     # 39 REST endpoints
│       ├── analyze/             # AI analysis (project, outline, data-plan, scripts, edit)
│       ├── audio/               # Audio (generate, preview, serve, voices)
│       ├── chat/                # Chat responses
│       ├── recording/           # Recording (start, status)
│       ├── sessions/            # Session lifecycle (create, stream, cancel, history, logs)
│       ├── runs/                # Run state (CRUD, threads, validate-phase)
│       ├── video/               # Video (merge, info, serve)
│       ├── fs/                  # Filesystem (browse, tree)
│       ├── preflight/           # Preflight checks
│       ├── project-summary/     # Project summary
│       ├── chapter-markers/     # Chapter markers
│       ├── routes/              # Route listing
│       ├── file-tree/           # File tree
│       ├── user-flows/          # User flows
│       ├── flow-scripts/        # Flow scripts
│       ├── voiceover-scripts/   # Voiceover scripts
│       ├── voice-options/       # Voice options
│       ├── timeline-markers/    # Timeline markers
│       ├── mock-data-entities/  # Mock data entities
│       ├── auth-overrides/      # Auth overrides
│       └── env-config/          # Environment config
├── components/
│   ├── chat/                    # Chat panel, bubbles, typing indicator, action cards, decision summary, revision section, session progress card
│   ├── layout/                  # Layout shell, app sidebar, app header, layout config
│   ├── phases/                  # Right panel content for each of 7 phases + goal banner
│   └── ui/                      # Shared UI (directory-picker-wrapper, phase-skeletons, tooltip, api-state)
└── lib/
    ├── store.ts                 # React useReducer + Context state management
    ├── phase-controller.ts      # Phase orchestration logic (7-phase progression)
    ├── types.ts                 # All domain types (Phase, ChatMessage, ActionCard, etc.)
    ├── mock-data.ts             # Mock/reference data
    ├── utils.ts                 # Utilities (uid, delay, etc.)
    ├── validations.ts           # Zod validation schemas
    ├── session-config.tsx       # Session type labels (10 types)
    ├── db.ts                    # DuckDB connection (createDatabase + runMigrations)
    ├── db/migrations/           # 2 numbered SQL migration files
    ├── actions/                 # Server Actions (claude-usage)
    ├── hooks/                   # App-specific hooks (use-state-sync, use-thread-sync, use-sync-status, use-run-param)
    ├── claude/
    │   ├── types.ts             # Claude integration types
    │   ├── extract-json.ts      # JSON extraction from Claude output
    │   ├── session-manager.ts   # Session manager for Claude operations
    │   ├── prompts/             # 7 prompt builders (analyze-project, generate-outline, generate-data-plan, generate-scripts, generate-voiceover, edit-content, chat-response)
    │   └── runners/             # 8 session runners (analyze-project, generate-outline, generate-data-plan, generate-scripts, edit-content, voiceover-audio, recording, final-merge)
    ├── recording/               # Recording engine (app-launcher, playwright-runner, data-seeder, recording-orchestrator)
    ├── audio/                   # Audio engine (elevenlabs-client, voiceover-generator)
    ├── video/                   # Video engine (ffmpeg-merger, chapter-generator)
    └── fs/                      # Filesystem scanner
```

### Data Layer

- **DuckDB** via `@claudekit/duckdb` with `createDatabase()` + `runMigrations()`. DB file at `data/b4u.duckdb` (relative to app root).
- `src/lib/db.ts` -- singleton connection cached via `globalThis` to survive HMR.
- 2 migration files in `src/lib/db/migrations/`: `001_initial.sql` (12 tables), `002_phase_threads.sql` (phase threads + revision history).
- 13 tables total: `project_summary`, `run_content`, `flow_scripts`, `flow_voiceover`, `voice_options`, `chapter_markers`, `run_state`, `sessions`, `session_logs`, `recordings`, `audio_files`, `final_videos`, `phase_threads`.

### Session System

10 session types managed via `src/lib/claude/session-manager.ts`:
- `analyze-project` -- AI project analysis
- `generate-outline` -- Outline generation
- `generate-data-plan` -- Data plan generation
- `generate-scripts` -- Script generation
- `generate-voiceover` -- Voiceover script generation
- `voiceover-audio` -- TTS audio generation
- `recording` -- Playwright browser recording
- `final-merge` -- FFmpeg video merge
- `edit-content` -- AI content editing
- `chat` -- Chat responses

### State Management

- React `useReducer` + Context in `src/lib/store.ts`
- Phase orchestration via `src/lib/phase-controller.ts`
- State persistence to DuckDB via `use-state-sync` and `use-thread-sync` hooks
- URL param sync via `use-run-param` (nuqs)
- Run restore from `/api/runs/[runId]`

## Theme System

- HSL-based CSS custom properties in `src/app/globals.css`
- 9 color themes: amethyst (default), sapphire, emerald, ruby, amber, slate, midnight, sunset, forest
- Each theme has light (`:root`) and dark (`.dark`) variants
- **Tailwind CSS v4** -- CSS-based configuration (no `tailwind.config.*` file)
- Use semantic Tailwind classes: `bg-background`, `text-foreground`, `bg-card`, `text-primary`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-sidebar`, etc.
- For inline dynamic styles, use `hsl(var(--token))` -- never hardcoded hex colors
- Theme system via `@claudekit/hooks` (`ThemeFOUCScript`)
- Mode switching via `next-themes` (light/dark/system)

## Design System

- Tailwind semantic token colors (not raw color values)
- Sans-serif-first typography (Geist), monospace (Geist Mono) for code only
- Base UI primitives via `@claudekit/ui`
- Icons: `lucide-react`
- Animations: `motion` (framer-motion)
- Toast notifications: via `@claudekit/ui`

## Key Patterns

### Single-Page App

The main app is a single client component page (`src/app/page.tsx`) using `"use client"`. All components use the client directive. Layout uses `LayoutShell` > `AppSidebar` (collapsible, run history) + `AppHeader` (phase stepper) + `SplitPanel` (chat left, phase content right).

### Claude Integration

- 7 prompt builders in `src/lib/claude/prompts/` for each AI-driven phase
- 8 session runners in `src/lib/claude/runners/` for executing AI operations
- `extract-json.ts` for parsing structured JSON from Claude output

### Recording Pipeline

- `src/lib/recording/app-launcher.ts` -- Launch target app dev server
- `src/lib/recording/data-seeder.ts` -- Seed mock data into target app
- `src/lib/recording/playwright-runner.ts` -- Playwright browser automation for recordings
- `src/lib/recording/recording-orchestrator.ts` -- Orchestrate full recording flow

### Audio Pipeline

- `src/lib/audio/elevenlabs-client.ts` -- ElevenLabs TTS API client
- `src/lib/audio/voiceover-generator.ts` -- Generate narration audio from scripts

### Video Pipeline

- `src/lib/video/ffmpeg-merger.ts` -- Merge video + audio via FFmpeg
- `src/lib/video/chapter-generator.ts` -- Generate chapter markers

## Biome Lint Notes

- Buttons must have `type="button"` (or submit/reset)
- Interactive non-button elements need `role`, `tabIndex`, `onKeyDown`
- Decorative SVGs need `aria-hidden="true"`
- No unused imports, variables, or parameters (prefix with `_` if intentionally unused)
- Use template literals over string concatenation
- `parseInt()` needs radix parameter

## Dependencies on @claudekit Packages

- `@claudekit/ui` -- Base UI primitives, layout components, error boundary, split panel
- `@claudekit/hooks` -- `ThemeFOUCScript`, `useSessionStream`
- `@claudekit/duckdb` -- Database connection factory and migration runner
- `@claudekit/claude-runner` -- Claude CLI invocation
- `@claudekit/claude-usage` -- Claude API usage tracking
- `@claudekit/session` -- Session lifecycle management
- `@claudekit/playwright` -- Browser automation helpers
- `@claudekit/validation` -- Shared Zod validation schemas
