Written to `DEVELOPMENT.md`. The guide covers:

- **Prerequisites** — Node.js >= 20, pnpm 9.15.0, Git, plus optional tools (Claude CLI, Playwright)
- **Installation** — Step-by-step clone, corepack, install, and env file setup
- **Environment variables** — Every variable across root and all 6 apps with `.env.example` files, organized by app with required/optional flags and links
- **All scripts** — 20+ scripts organized by category (development, quality, testing, maintenance) with descriptions
- **Database setup** — DuckDB locations for all 5 apps, migration system details, reset commands, DuckTails admin UI, and DuckDB-specific gotchas
- **Common workflows** — Adding features, modifying shared packages, writing migrations, running checks, cleaning up
- **Code style** — Biome configuration reference
- **Logging** — File format, rotation, retention, viewing
- **Troubleshooting** — Port conflicts, WAL corruption, stale daemon PIDs, build failures, test hangs
