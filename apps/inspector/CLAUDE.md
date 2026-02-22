# CLAUDE.md — Inspector

## Overview

**Inspector** is a local-first GitHub PR analysis tool. It connects to GitHub repos via PAT, fetches PRs and review comments, and uses Claude AI to provide:

1. **Dashboard** — PR overview with stats, sizes, review statuses
2. **Skill Builder** — Categorize review comments into skill patterns for growth
3. **PR Splitter** — AI-generated split plans for large PRs
4. **Comment Resolver** — AI-generated code fixes for review comments
5. **Settings** — Repo connection, preferences, theme selection

## Port

**2400** — `pnpm dev:inspector` or `pnpm --filter inspector dev`

## Commands

```bash
pnpm --filter inspector dev        # Start dev server on port 2400
pnpm --filter inspector build      # Production build
pnpm --filter inspector typecheck  # TypeScript check
pnpm --filter inspector test       # Run tests
pnpm --filter inspector db:reset   # Delete ~/.inspector/data.duckdb
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `DATABASE_PATH` | No | Override DB path (default: `~/.inspector/data.duckdb`) |

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Dashboard (server component)
│   ├── dashboard-client.tsx
│   ├── skills/             # Skill Builder workflow
│   ├── splitter/           # PR Splitter workflow
│   ├── resolver/           # Comment Resolver workflow
│   └── settings/           # Settings page
├── components/
│   ├── layout/             # App shell (sidebar, topbar, drawer)
│   ├── skills/             # Skill cards, detail drawer
│   ├── splitter/           # Sub-PR cards, diff preview
│   └── resolver/           # Comment cards
├── lib/
│   ├── db/                 # DuckDB connection + migrations
│   ├── actions/            # Server Actions (github, prs, skills, splitter, resolver, settings)
│   ├── github.ts           # Octokit client factory
│   ├── types.ts            # Domain types
│   ├── constants.ts        # Size thresholds, color maps
│   └── prompts.ts          # Claude prompt templates
└── hooks/                  # App-specific hooks
```

## Database

DuckDB at `~/.inspector/data.duckdb` with tables:
- `repos` — Connected GitHub repositories
- `prs` — Cached pull requests with size classification
- `pr_comments` — Review comments with AI-classified severity/category
- `skill_analyses` / `skills` / `skill_comments` — Skill analysis results
- `split_plans` — PR split plans (sub-PRs stored as JSON)
- `comment_fixes` — AI-generated fix diffs
- `settings` — Key-value user preferences

## Key Patterns

- **Server/Client split**: Server components fetch from DB, pass props to `"use client"` components
- **GitHub sync**: `syncRepo()` → `syncPRs()` → `syncPRComments()` pipeline
- **AI analysis**: Uses `@claudekit/claude-runner` to call Claude CLI for skill analysis, split plans, and fix generation
- **Three-phase workflows**: Select → Analyzing (animated progress) → Results
- **Theme system**: Uses `useAppTheme()` from `@claudekit/hooks` with 9 color themes
