# CLAUDE.md — DuckTails

## Overview

**DuckTails** is a DuckDB admin UI for ClaudeKit. It connects to all app databases for browsing, querying, and editing data — like DBeaver/phpMyAdmin but local-first.

## Port

**2050** — `pnpm dev:ducktails` or `pnpm --filter ducktails dev`

## Commands

```bash
pnpm --filter ducktails dev        # Start dev server on port 2050
pnpm --filter ducktails build      # Production build
pnpm --filter ducktails typecheck  # TypeScript check
pnpm --filter ducktails lint       # Lint check
```

## Architecture

```
src/
├── app/                      # Next.js App Router pages
│   ├── page.tsx              # Dashboard — database cards
│   ├── dashboard-client.tsx
│   ├── [database]/
│   │   ├── layout.tsx        # Validates database ID
│   │   ├── tables/
│   │   │   ├── page.tsx      # Table list
│   │   │   └── [table]/
│   │   │       └── page.tsx  # Table detail (data + schema tabs)
│   │   └── query/
│   │       └── page.tsx      # SQL editor
├── components/
│   ├── layout/               # App shell (sidebar, nav)
│   ├── database/             # Database cards, status badges
│   ├── data/                 # Data grid, pagination, edit/delete dialogs
│   ├── tables/               # Column schema table
│   └── query/                # SQL editor, query results
├── lib/
│   ├── db/                   # Registry + connection manager
│   │   ├── registry.ts       # Static database entries
│   │   └── connection-manager.ts  # Per-path DuckDBInstance cache
│   ├── actions/              # Server Actions
│   │   ├── databases.ts      # listDatabases, getDatabaseEntry
│   │   ├── tables.ts         # listTables, getTableSchema, getTablePrimaryKey
│   │   ├── data.ts           # getTableData, insertRow, updateRow, deleteRow
│   │   └── query.ts          # executeQuery
│   ├── types.ts              # Domain types
│   ├── utils.ts              # Identifier validation, formatting
│   └── constants.ts          # APP_NAME
└── hooks/
    └── use-query-history.ts  # localStorage-backed query history
```

## Database Registry

DuckTails does NOT own a database. It connects to external databases:

| ID | App | Path |
|----|-----|------|
| gadget | Gadget | `~/.gadget/data.duckdb` |
| inspector | Inspector | `~/.inspector/data.duckdb` |
| inside | Inside | `~/.inside/data.duckdb` |
| b4u | B4U | `apps/b4u/data/b4u.duckdb` |
| gogo | GoGo | `apps/gogo-orchestrator/data/gogo.duckdb` |

## Key Patterns

- **Connection manager**: Opens `DuckDBInstance` per path, caches on `globalThis` for HMR survival
- **Reuses `@claudekit/duckdb` helpers**: `queryAll`, `queryOne`, `execute` accept any `DuckDBConnection`
- **Identifier validation**: Table/column names validated via regex before SQL interpolation (DuckDB doesn't support parameterized identifiers)
- **Server/Client split**: Standard Next.js pattern — server fetches, client renders

## Known Limitations

- **Concurrent access**: DuckDB allows one writer at a time. Writes may fail if the owning app is running.
- **Missing databases**: Shows "Not Found" status if an app hasn't been run yet.
- **Complex types**: LIST, MAP, STRUCT display as JSON-stringified. BLOB as `[BLOB: N bytes]`.
