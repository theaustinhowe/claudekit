Written `DEVELOPMENT.md` at the project root. It covers:

- **Prerequisites** — Node 22, pnpm, Git, optional Claude CLI, platform-specific notes
- **Installation** — step-by-step from clone to running dev server
- **Environment variables** — required vs optional, organized by category
- **Scripts reference** — every `package.json` script with descriptions
- **Database** — automatic init, schema change workflow, reset/re-seed, WAL recovery, connection model details
- **Code style** — Biome config, pre-commit hooks, common lint gotchas, TypeScript conventions
- **Architecture quick reference** — server/client split, data flow, session system, key directories
- **Common workflows** — adding pages, API endpoints, shadcn components, DB tables, session runners
- **Troubleshooting** — DuckDB errors, port conflicts, native module builds, HMR issues
