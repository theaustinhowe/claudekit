# Database

Gadget uses **DuckDB** as an embedded database via `@claudekit/duckdb`. The database file lives at `~/.gadget/data.duckdb` (configurable via the `DATABASE_PATH` environment variable).

## Connection Management

```typescript
import { getDb } from "@/lib/db";

const db = await getDb(); // always async
```

- Uses `createDatabase()` from `@claudekit/duckdb` with `useGlobalCache: true` to survive Next.js HMR
- Lazy async init with promise deduplication (concurrent callers share one init)
- On startup: runs numbered SQL migrations, reconciles orphaned scans/sessions, auto-seeds if first launch
- Session reconciliation via `reconcileSessionsOnInit()` from `@claudekit/session`

## Query Helpers

All queries go through helpers re-exported from `@claudekit/duckdb` via `src/lib/db/index.ts`:

```typescript
import { queryAll, queryOne, execute, parseJsonField } from "@/lib/db";

// Query multiple rows
const repos = await queryAll<Repo>(db, "SELECT * FROM repos WHERE repo_type = ?", ["nextjs"]);

// Query single row (returns T | undefined)
const repo = await queryOne<Repo>(db, "SELECT * FROM repos WHERE id = ?", [repoId]);

// Execute (INSERT, UPDATE, DELETE)
await execute(db, "INSERT INTO repos (id, name, local_path) VALUES (?, ?, ?)", [id, name, path]);

// Parse JSON fields
const versions = parseJsonField(policy.expected_versions, {});
```

The `?` placeholders are auto-converted to DuckDB's `$1, $2, ...` positional params.

Additional helpers: `buildUpdate()`, `withTransaction()`, `checkpoint()`.

## Schema

17 tables defined in `src/lib/db/migrations/001_initial.sql`. Migrations are numbered `.sql` files run via `runMigrations()` from `@claudekit/duckdb`.

### Tables

**scan_roots** -- Filesystem paths to scan for repositories.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `path` | TEXT NOT NULL | Absolute path, unique index |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `last_scanned_at` | TIMESTAMPTZ | Nullable |

**scans** -- Scan execution records.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `status` | TEXT NOT NULL | `pending`, `running`, `done`, `error` |
| `policy_id` | TEXT | FK to policies, nullable |
| `scan_root_ids` | JSON | Array of scan root IDs |
| `progress` | INTEGER | 0-100 |
| `phase` | TEXT | Current scan phase |
| `started_at` | TIMESTAMPTZ | Nullable |
| `completed_at` | TIMESTAMPTZ | Nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**repos** -- Discovered repositories.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Repo name |
| `local_path` | TEXT NOT NULL | Unique |
| `git_remote` | TEXT | Nullable |
| `default_branch` | TEXT | Default `main` |
| `package_manager` | TEXT | `npm`, `pnpm`, `yarn`, `bun` |
| `repo_type` | TEXT | `nextjs`, `node`, `react`, `library`, `monorepo`, `tanstack` |
| `is_monorepo` | BOOLEAN | Default `false` |
| `github_url` | TEXT | Nullable |
| `github_account_id` | TEXT | FK to github_accounts |
| `source` | TEXT | `local`, `github`, `both`, `library` |
| `last_scanned_at` | TIMESTAMPTZ | Nullable |
| `last_modified_at` | TIMESTAMPTZ | Nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**policies** -- Audit policies.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | Nullable |
| `expected_versions` | JSON | Object (`Record<string, string>`) |
| `banned_dependencies` | JSON | Array of `{name, replacement?, reason}` |
| `allowed_package_managers` | JSON | Array of PM strings |
| `preferred_package_manager` | TEXT | Default `pnpm` |
| `ignore_patterns` | JSON | Array of glob patterns |
| `repo_types` | JSON | Array of repo type strings |
| `is_builtin` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**findings** -- Audit findings.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `repo_id` | TEXT NOT NULL | FK to repos |
| `scan_id` | TEXT | FK to scans, nullable |
| `category` | TEXT NOT NULL | `dependencies`, `ai-files`, `structure`, `config` |
| `severity` | TEXT NOT NULL | `critical`, `warning`, `info` |
| `title` | TEXT NOT NULL | |
| `details` | TEXT | Nullable |
| `evidence` | TEXT | Nullable |
| `suggested_actions` | JSON | Array of strings |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**fix_actions** -- Proposed fixes with file diffs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `repo_id` | TEXT NOT NULL | FK to repos |
| `finding_id` | TEXT | FK to findings, nullable |
| `scan_id` | TEXT | FK to scans, nullable |
| `title` | TEXT NOT NULL | |
| `description` | TEXT | Nullable |
| `impact` | TEXT | `docs`, `config`, `dependencies`, `structure` |
| `risk` | TEXT | `low`, `medium`, `high` |
| `requires_approval` | BOOLEAN | Default `false` |
| `diff_file` | TEXT | Target file path |
| `diff_before` | TEXT | Original content |
| `diff_after` | TEXT | Fixed content |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

**snapshots** -- Pre-apply file backups.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `repo_id` | TEXT NOT NULL |
| `scan_id` | TEXT |
| `files` | TEXT NOT NULL |
| `snapshot_path` | TEXT NOT NULL |
| `created_at` | TIMESTAMPTZ |

**apply_runs** -- Fix application execution logs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `repo_id` | TEXT NOT NULL | |
| `scan_id` | TEXT | |
| `snapshot_id` | TEXT | FK to snapshots |
| `status` | TEXT | `pending`, `running`, `done`, `partial`, `error`, `rolled_back` |
| `actions_applied` | JSON | Array of action IDs |
| `log` | JSON | Array of `{level, message, timestamp}` |
| `created_at` | TIMESTAMPTZ | |
| `completed_at` | TIMESTAMPTZ | |

**settings** -- Key-value configuration store.

| Column | Type |
|--------|------|
| `key` | TEXT PK |
| `value` | TEXT NOT NULL |
| `updated_at` | TIMESTAMPTZ |

**github_accounts** -- GitHub PATs (encrypted).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `name` | TEXT NOT NULL | Display name |
| `username` | TEXT | GitHub username |
| `avatar_url` | TEXT | |
| `pat_encrypted` | TEXT NOT NULL | AES-256-GCM encrypted |
| `scopes` | JSON | Array of OAuth scopes |
| `is_default` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |
| `last_synced_at` | TIMESTAMPTZ | |

**concept_sources** -- Discovery sources for AI concepts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `source_type` | TEXT NOT NULL | `local_repo`, `github_repo`, `mcp_list`, `curated`, `claude_config` |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | |
| `repo_id` | TEXT | FK to repos |
| `github_owner` | TEXT | |
| `github_repo` | TEXT | |
| `github_default_branch` | TEXT | |
| `github_url` | TEXT | |
| `list_url` | TEXT | |
| `is_builtin` | BOOLEAN | |
| `last_scanned_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**concepts** -- Skills, hooks, commands, agents, MCP servers, plugins.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `repo_id` | TEXT NOT NULL | FK to repos (origin) |
| `scan_id` | TEXT | |
| `source_id` | TEXT | FK to concept_sources |
| `concept_type` | TEXT NOT NULL | `skill`, `hook`, `command`, `agent`, `mcp_server`, `plugin` |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | |
| `relative_path` | TEXT NOT NULL | Path within repo, unique with repo_id |
| `content` | TEXT | File contents |
| `metadata` | JSON | Object |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**concept_links** -- Installed concepts in target repos.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `concept_id` | TEXT NOT NULL | FK to concepts |
| `repo_id` | TEXT NOT NULL | FK to repos (target), unique with concept_id |
| `sync_status` | TEXT | `pending`, `synced`, `stale` |
| `synced_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

**custom_rules** -- User-defined audit rules.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | Nullable |
| `category` | TEXT NOT NULL | Default `custom` |
| `severity` | TEXT NOT NULL | Default `warning` |
| `rule_type` | TEXT NOT NULL | `file_exists`, `file_missing`, `file_contains`, `json_field` |
| `config` | JSON | Default `{}` |
| `suggested_actions` | JSON | Default `[]` |
| `policy_id` | TEXT | FK to policies, nullable |
| `is_enabled` | BOOLEAN | Default `true` |
| `is_builtin` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**manual_findings** -- Manually created findings.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `repo_id` | TEXT NOT NULL | FK to repos |
| `category` | TEXT NOT NULL | Default `custom` |
| `severity` | TEXT NOT NULL | Default `warning` |
| `title` | TEXT NOT NULL | |
| `details` | TEXT | Nullable |
| `evidence` | TEXT | Nullable |
| `suggested_actions` | JSON | Default `[]` |
| `is_resolved` | BOOLEAN | Default `false` |
| `resolved_at` | TIMESTAMPTZ | Nullable |
| `created_by` | TEXT | Nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

**sessions** -- Session records for long-running operations.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `session_type` | TEXT NOT NULL | `scan`, `quick_improve`, `finding_fix`, `fix_apply`, `ai_file_gen`, `cleanup` |
| `status` | TEXT NOT NULL | Default `pending` |
| `label` | TEXT NOT NULL | |
| `context_type` | TEXT | Nullable |
| `context_id` | TEXT | Nullable |
| `context_name` | TEXT | Nullable |
| `metadata_json` | JSON | Default `{}` |
| `progress` | INTEGER | Default 0 |
| `phase` | TEXT | Nullable |
| `pid` | INTEGER | Nullable |
| `started_at` | TIMESTAMPTZ | Nullable |
| `completed_at` | TIMESTAMPTZ | Nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `error_message` | TEXT | Nullable |
| `result_json` | JSON | Default `{}` |

**session_logs** -- Log entries for session execution.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-incrementing |
| `session_id` | TEXT NOT NULL | FK to sessions |
| `log` | TEXT NOT NULL | |
| `log_type` | TEXT | Default `status` |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

## Indexes

```sql
CREATE UNIQUE INDEX idx_scan_roots_path ON scan_roots(path);
CREATE INDEX idx_findings_repo_scan ON findings(repo_id, scan_id);
CREATE INDEX idx_fix_actions_repo_scan ON fix_actions(repo_id, scan_id);
CREATE INDEX idx_concepts_repo ON concepts(repo_id);
CREATE INDEX idx_concepts_type ON concepts(concept_type);
CREATE UNIQUE INDEX idx_concepts_repo_path ON concepts(repo_id, relative_path);
CREATE INDEX idx_concepts_source ON concepts(source_id);
CREATE INDEX idx_concept_links_concept ON concept_links(concept_id);
CREATE INDEX idx_concept_links_repo ON concept_links(repo_id);
CREATE INDEX idx_custom_rules_policy ON custom_rules(policy_id);
CREATE INDEX idx_manual_findings_repo ON manual_findings(repo_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_context ON sessions(context_type, context_id);
CREATE INDEX idx_sessions_created ON sessions(created_at);
CREATE INDEX idx_session_logs_session ON session_logs(session_id);
```

## DuckDB Conventions

These are the key differences from SQLite that trip people up:

| SQLite | DuckDB |
|--------|--------|
| `INSERT OR IGNORE INTO ...` | `INSERT INTO ... ON CONFLICT DO NOTHING` |
| `INSERT OR REPLACE INTO ...` | `INSERT INTO ... ON CONFLICT (key) DO UPDATE SET ...` |
| `datetime('now')` | `TIMESTAMPTZ DEFAULT now()` |
| `GROUP BY` allows partial columns | `GROUP BY` must list ALL non-aggregated columns |
| `BOOLEAN` returns 0/1 | `BOOLEAN` returns native `true`/`false` |
| `?` params | `$1, $2, ...` (auto-bridged by @claudekit/duckdb helpers) |
| `TEXT` for JSON | Native `JSON` type |

## Migrations

Migrations are numbered `.sql` files in `src/lib/db/migrations/`. They are run in order via `runMigrations()` from `@claudekit/duckdb` on startup.

To add a migration:

1. Create a new numbered file (e.g., `002_add_feature.sql`)
2. Write your SQL DDL statements
3. The migration will run automatically on next startup

## Reset

```bash
pnpm db:reset   # Deletes data.duckdb and .wal file
pnpm dev        # Migrations run automatically, seed data inserted
```
