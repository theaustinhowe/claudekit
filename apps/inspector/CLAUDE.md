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
│   │   ├── page.tsx        # Skills list
│   │   ├── new/            # New analysis
│   │   └── [analysisId]/   # Analysis detail
│   ├── splitter/           # PR Splitter workflow
│   ├── resolver/           # Comment Resolver workflow
│   ├── settings/           # Settings page
│   └── api/sessions/       # Session management API
│       ├── route.ts        # Create session
│       ├── [sessionId]/
│       │   ├── stream/route.ts  # SSE session stream
│       │   └── cancel/route.ts  # Cancel session
│       └── cleanup/route.ts     # Cleanup stale sessions
├── components/
│   ├── layout/             # App shell (sidebar, topbar)
│   ├── providers.tsx       # Client providers wrapper
│   ├── repo/               # Repo selector
│   ├── sessions/           # Session context, indicator, panel
│   ├── settings/           # General, preferences, skill group tabs
│   ├── skills/             # Skill cards, detail drawer, trend chart, groups panel
│   └── splitter/           # Sub-PR cards, diff preview
├── lib/
│   ├── db/                 # DuckDB connection + migrations (2 migration files)
│   ├── actions/            # Server Actions (account, claude-usage, github, prs, resolver,
│   │                       #   reviewers, sessions, settings, skill-groups, skills, splitter)
│   ├── github.ts           # Octokit client factory
│   ├── git-operations.ts   # Local repo clone management (~/.inspector/repos/)
│   ├── comment-classifier.ts # Review comment classification
│   ├── export.ts           # Data export utilities
│   ├── logger.ts           # Pino logger instance
│   ├── types.ts            # Domain types
│   ├── constants.ts        # Size thresholds, color maps
│   └── prompts.ts          # Claude prompt templates
└── hooks/
    └── use-pr-filters.ts   # PR filtering hook
```

## Database

DuckDB at `~/.inspector/data.duckdb` with tables:
- `repos` — Connected GitHub repositories (with optional `local_path` for clones)
- `prs` — Cached pull requests with size classification, account-wide support (`user_relationship`, `repo_full_name`)
- `pr_comments` — Review comments with AI-classified severity/category
- `github_user` — Authenticated GitHub user cache
- `skill_analyses` / `skills` — Skill analysis results (comment IDs as JSON, optional `group_id` and `rule_content`)
- `skill_groups` — Skill categorization groups (e.g., react-components, css-styling)
- `split_plans` — PR split plans (sub-PRs stored as JSON)
- `split_executions` — Execution tracking per sub-PR (branch, PR URL, status)
- `comment_fixes` — AI-generated fix diffs
- `fix_executions` — Fix execution tracking (branch, commit SHA, status)
- `settings` — Key-value user preferences
- `sessions` / `session_logs` — Session lifecycle tracking (@claudekit/session integration)

## Key Patterns

- **Server/Client split**: Server components fetch from DB, pass props to `"use client"` components
- **GitHub sync**: `syncRepo()` → `syncPRs()` → `syncPRComments()` pipeline
- **AI analysis**: Uses `@claudekit/claude-runner` to call Claude CLI for skill analysis, split plans, and fix generation
- **Three-phase workflows**: Select → Analyzing (animated progress) → Results
- **Theme system**: Uses `useAppTheme()` from `@claudekit/hooks` with 9 color themes
