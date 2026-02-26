Written `ARCHITECTURE.md` at the project root. The document covers:

- **Overview** — Local-first, session-oriented, Claude-integrated design principles
- **Technology Stack** — Full breakdown of frontend, backend, and tooling dependencies
- **Directory Structure** — Top-level layout and consistent per-app internal structure
- **System Architecture** — ASCII diagram showing all 8 apps, shared packages, and their relationships
- **Applications** — Each app's purpose, key features, database, and architecture
- **Shared Packages** — All 12 packages with dependency graph, APIs, and patterns
- **Data Flow** — 4 detailed flow diagrams: session operations, GoGo job lifecycle, health monitoring, and DuckTails cross-DB access
- **Key Architectural Patterns** — Server/client split, DI for persistence, HMR-safe caching, async mutex, ring buffers, stream-JSON parsing, crash recovery, theme system
- **Design Decisions and Trade-offs** — 8 key decisions with rationale (DuckDB over SQLite, local-first, Biome, Base UI, unified sessions, Fastify for orchestrator, migration strategies, REST+WebSocket hybrid)
- **Development Infrastructure** — Dev orchestration, CI pipeline, testing strategy, database management
