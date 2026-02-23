# Database

Gadget uses **DuckDB** as an embedded database via `@duckdb/node-api`. The database file lives at `~/.gadget/data.duckdb` (configurable via the `DB_PATH` environment variable).

## Connection Management

```typescript
import { getDb } from "@/lib/db";

const db = await getDb(); // always async
```

- Singleton `DuckDBInstance` + `DuckDBConnection` cached on `globalThis` to survive Next.js HMR
- Lazy async init with promise deduplication (concurrent callers share one init)
- On startup: runs schema init, migrations, auto-seeds if first launch
- Auto-recovers orphaned scans (stuck `running` → marked `error`)
- WAL corruption auto-recovery (removes `.wal` file and retries)

## Query Helpers

All queries go through `src/lib/db/helpers.ts`:

```typescript
import { queryAll, queryOne, execute, checkpoint } from "@/lib/db/helpers";

// Query multiple rows
const repos = await queryAll<Repo>(db, "SELECT * FROM repos WHERE repo_type = ?", ["nextjs"]);

// Query single row (returns T | null)
const repo = await queryOne<Repo>(db, "SELECT * FROM repos WHERE id = ?", [repoId]);

// Execute (INSERT, UPDATE, DELETE)
await execute(db, "INSERT INTO repos (id, name, local_path) VALUES (?, ?, ?)", [id, name, path]);

// Force WAL checkpoint
await checkpoint(db);
```

The `?` placeholders are auto-converted to DuckDB's `$1, $2, ...` positional params.

## Schema

28 tables organized by domain. Current schema version: **1** (tracked in `schema_version` table).

### Core Tables

**scan_roots** — Filesystem paths to scan for repositories.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `path` | TEXT NOT NULL | Absolute path, unique index |
| `created_at` | TEXT | Auto-set via `CAST(current_timestamp AS VARCHAR)` |
| `last_scanned_at` | TEXT | Nullable |

**scans** — Scan execution records.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `status` | TEXT | `pending`, `running`, `done`, `error` |
| `policy_id` | TEXT | FK to policies, nullable |
| `dry_run` | BOOLEAN | Default `true` |
| `allow_apply` | BOOLEAN | Default `false` |
| `docs_only` | BOOLEAN | Default `false` |
| `require_approval` | BOOLEAN | Default `true` |
| `progress` | INTEGER | 0–100 |
| `phase` | TEXT | Current scan phase |
| `started_at` | TEXT | Nullable |
| `completed_at` | TEXT | Nullable |
| `created_at` | TEXT | Auto-set |

**scan_root_entries** — Junction table (scan ↔ scan_roots).

| Column | Type | Notes |
|--------|------|-------|
| `scan_id` | TEXT | Composite PK |
| `scan_root_id` | TEXT | Composite PK |

**repos** — Discovered repositories.

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
| `last_scanned_at` | TEXT | Nullable |
| `last_modified_at` | TEXT | Nullable |
| `created_at` | TEXT | Auto-set |

**policies** — Audit policies.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | Nullable |
| `expected_versions` | TEXT | JSON object (`Record<string, string>`) |
| `banned_dependencies` | TEXT | JSON array of `{name, replacement?, reason}` |
| `allowed_package_managers` | TEXT | JSON array of PM strings |
| `preferred_package_manager` | TEXT | Default `pnpm` |
| `ignore_patterns` | TEXT | JSON array of glob patterns |
| `repo_types` | TEXT | JSON array of repo type strings |
| `is_builtin` | BOOLEAN | Default `false` |
| `created_at` | TEXT | Auto-set |
| `updated_at` | TEXT | Auto-set |

**findings** — Audit findings.

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
| `suggested_actions` | TEXT | JSON array of strings |
| `created_at` | TEXT | Auto-set |

**fix_actions** — Proposed fixes with file diffs.

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
| `created_at` | TEXT | Auto-set |

### Supporting Tables

**fix_packs** — Bundled fix action groups.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `name` | TEXT NOT NULL |
| `description` | TEXT |
| `icon` | TEXT |
| `action_filter` | TEXT (JSON) |
| `guardrails` | TEXT (JSON array) |
| `is_builtin` | BOOLEAN |

**snapshots** — Pre-apply file backups.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `repo_id` | TEXT NOT NULL |
| `scan_id` | TEXT |
| `files` | TEXT NOT NULL (JSON) |
| `snapshot_path` | TEXT NOT NULL |
| `created_at` | TEXT |

**apply_runs** — Fix application execution logs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `repo_id` | TEXT NOT NULL | |
| `scan_id` | TEXT | |
| `snapshot_id` | TEXT | FK to snapshots |
| `status` | TEXT | `pending`, `running`, `done`, `partial`, `error`, `rolled_back` |
| `actions_applied` | TEXT | JSON array of action IDs |
| `log` | TEXT | JSON array of `{level, message, timestamp}` |
| `created_at` | TEXT | |
| `completed_at` | TEXT | |

**templates** — Project scaffolding templates.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `name` | TEXT NOT NULL |
| `type` | TEXT |
| `description` | TEXT |
| `recommended_pm` | TEXT |
| `includes` | TEXT (JSON array) |
| `base_files` | TEXT (JSON object) |
| `is_builtin` | BOOLEAN |

**generator_runs** — Project generation history.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `template_id` | TEXT |
| `policy_id` | TEXT |
| `intent` | TEXT |
| `project_name` | TEXT NOT NULL |
| `project_path` | TEXT NOT NULL |
| `package_manager` | TEXT |
| `features` | TEXT (JSON array) |
| `status` | TEXT |
| `handoff_brief` | TEXT |
| `created_at` | TEXT |
| `completed_at` | TEXT |

**reports** — Exported audit reports.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `scan_id` | TEXT |
| `format` | TEXT (`json`, `markdown`, `pr`) |
| `content` | TEXT |
| `created_at` | TEXT |

**settings** — Key-value configuration store.

| Column | Type |
|--------|------|
| `key` | TEXT PK |
| `value` | TEXT NOT NULL |
| `updated_at` | TEXT |

### GitHub Integration

**github_accounts** — GitHub PATs (encrypted).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `name` | TEXT NOT NULL | Display name |
| `username` | TEXT | GitHub username |
| `avatar_url` | TEXT | |
| `pat_encrypted` | TEXT NOT NULL | AES-256-GCM encrypted |
| `scopes` | TEXT | JSON array of OAuth scopes |
| `is_default` | BOOLEAN | |
| `created_at` | TEXT | |
| `last_synced_at` | TEXT | |

**github_metadata** — Cached repo metadata from GitHub API.

| Column | Type |
|--------|------|
| `repo_id` | TEXT PK |
| `stars` | INTEGER |
| `open_issues` | INTEGER |
| `open_prs` | INTEGER |
| `visibility` | TEXT |
| `default_branch` | TEXT |
| `last_push_at` | TEXT |
| `topics` | TEXT (JSON array) |
| `updated_at` | TEXT |

### AI Integrations

**concept_sources** — Discovery sources for AI concepts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `source_type` | TEXT NOT NULL | `local_repo`, `github_repo`, `mcp_list`, `curated`, `claude_config` |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | |
| `repo_id` | TEXT | FK to repos (for local sources) |
| `github_owner` | TEXT | |
| `github_repo` | TEXT | |
| `github_default_branch` | TEXT | |
| `github_url` | TEXT | |
| `list_url` | TEXT | |
| `is_builtin` | BOOLEAN | |
| `last_scanned_at` | TEXT | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

**concepts** — Skills, hooks, commands, agents, MCP servers, plugins.

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
| `metadata` | TEXT | JSON object |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

**concept_links** — Installed concepts in target repos.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `concept_id` | TEXT NOT NULL | FK to concepts |
| `repo_id` | TEXT NOT NULL | FK to repos (target), unique with concept_id |
| `sync_status` | TEXT | `pending`, `synced`, `stale` |
| `synced_at` | TEXT | |
| `created_at` | TEXT | |

### Projects & Rules

**custom_rules** — User-defined audit rules.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Rule name |
| `description` | TEXT | Nullable |
| `category` | TEXT NOT NULL | Default `custom` |
| `severity` | TEXT NOT NULL | Default `warning` |
| `rule_type` | TEXT NOT NULL | `file_exists`, `file_missing`, `file_contains`, `json_field` |
| `config` | TEXT | JSON object, default `{}` |
| `suggested_actions` | TEXT | JSON array, default `[]` |
| `policy_id` | TEXT | FK to policies, nullable |
| `is_enabled` | BOOLEAN | Default `true` |
| `is_builtin` | BOOLEAN | Default `false` |
| `created_at` | TEXT | Auto-set |
| `updated_at` | TEXT | Auto-set |

**manual_findings** — Manually created findings.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `repo_id` | TEXT NOT NULL | FK to repos |
| `category` | TEXT NOT NULL | Default `custom` |
| `severity` | TEXT NOT NULL | Default `warning` |
| `title` | TEXT NOT NULL | |
| `details` | TEXT | Nullable |
| `evidence` | TEXT | Nullable |
| `suggested_actions` | TEXT | JSON array, default `[]` |
| `is_resolved` | BOOLEAN | Default `false` |
| `resolved_at` | TEXT | Nullable |
| `created_by` | TEXT | Nullable |
| `created_at` | TEXT | Auto-set |
| `updated_at` | TEXT | Auto-set |

**policy_templates** — Reusable policy templates.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | Nullable |
| `icon` | TEXT | Nullable |
| `defaults` | TEXT | JSON object, default `{}` |
| `category` | TEXT | Nullable |
| `is_builtin` | BOOLEAN | Default `false` |
| `created_at` | TEXT | Auto-set |
| `updated_at` | TEXT | Auto-set |

**generator_projects** — Chat-based project creation records.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `title` | TEXT NOT NULL | Project title |
| `idea_description` | TEXT NOT NULL | User's project idea |
| `platform` | TEXT NOT NULL | Default `nextjs` |
| `services` | TEXT | JSON array, default `[]` |
| `constraints` | TEXT | JSON array, default `[]` |
| `project_name` | TEXT NOT NULL | Directory name |
| `project_path` | TEXT NOT NULL | Absolute path |
| `package_manager` | TEXT | Default `pnpm` |
| `status` | TEXT | `drafting`, `scaffolding`, `designing`, `locked`, `exported`, `error` |
| `active_spec_version` | INTEGER | Default `0` |
| `ai_provider` | TEXT | Default `anthropic` |
| `ai_model` | TEXT | Nullable |
| `template_id` | TEXT | FK to templates, nullable |
| `policy_id` | TEXT | FK to policies, nullable |
| `created_at` | TEXT | Auto-set |
| `updated_at` | TEXT | Auto-set |
| `exported_at` | TEXT | Nullable |

**ui_specs** — Versioned UI specifications for projects.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT NOT NULL | FK to generator_projects |
| `version` | INTEGER NOT NULL | Default `1`, unique with project_id |
| `spec_json` | TEXT NOT NULL | JSON object, default `{}` |
| `created_at` | TEXT | Auto-set |

**mock_data_sets** — Mock data for project prototyping.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT NOT NULL | FK to generator_projects |
| `spec_version` | INTEGER NOT NULL | |
| `entities_json` | TEXT NOT NULL | JSON array, default `[]` |
| `created_at` | TEXT | Auto-set |

**design_messages** — Chat messages in the project design flow.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT NOT NULL | FK to generator_projects |
| `role` | TEXT NOT NULL | `user`, `assistant`, `system` |
| `content` | TEXT NOT NULL | |
| `spec_diff_json` | TEXT | JSON object, nullable |
| `progress_logs_json` | TEXT | JSON array, nullable |
| `model_used` | TEXT | Nullable |
| `created_at` | TEXT | Auto-set |

**spec_snapshots** — Point-in-time snapshots of project specs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT NOT NULL | FK to generator_projects |
| `version` | INTEGER NOT NULL | |
| `spec_json` | TEXT NOT NULL | |
| `mock_data_json` | TEXT NOT NULL | Default `[]` |
| `message_id` | TEXT | FK to design_messages, nullable |
| `label` | TEXT | Nullable |
| `created_at` | TEXT | Auto-set |

**auto_fix_runs** — Automated error fix attempts for projects.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT NOT NULL | FK to generator_projects |
| `status` | TEXT NOT NULL | `running`, `success`, `failed`, `cancelled` |
| `error_signature` | TEXT NOT NULL | Error fingerprint |
| `error_message` | TEXT NOT NULL | Full error text |
| `claude_output` | TEXT | Claude's fix output, nullable |
| `attempt_number` | INTEGER | Default `1` |
| `logs_json` | TEXT | JSON array, default `[]` |
| `started_at` | TEXT | Auto-set |
| `completed_at` | TEXT | Nullable |

## Indexes

```sql
CREATE UNIQUE INDEX idx_scan_roots_path ON scan_roots(path);
CREATE INDEX idx_findings_repo_scan ON findings(repo_id, scan_id);
CREATE INDEX idx_fix_actions_repo ON fix_actions(repo_id);
CREATE INDEX idx_fix_actions_repo_scan ON fix_actions(repo_id, scan_id);
CREATE INDEX idx_concepts_repo ON concepts(repo_id);
CREATE INDEX idx_concepts_type ON concepts(concept_type);
CREATE UNIQUE INDEX idx_concepts_repo_path ON concepts(repo_id, relative_path);
CREATE INDEX idx_concept_links_concept ON concept_links(concept_id);
CREATE INDEX idx_concept_links_repo ON concept_links(repo_id);
CREATE INDEX idx_concept_sources_type ON concept_sources(source_type);
CREATE INDEX idx_concepts_source ON concepts(source_id);
CREATE INDEX idx_custom_rules_policy ON custom_rules(policy_id);
CREATE INDEX idx_custom_rules_enabled ON custom_rules(is_enabled);
CREATE INDEX idx_manual_findings_repo ON manual_findings(repo_id);
CREATE INDEX idx_policy_templates_category ON policy_templates(category);
CREATE INDEX idx_generator_projects_status ON generator_projects(status);
CREATE INDEX idx_ui_specs_project ON ui_specs(project_id);
CREATE INDEX idx_mock_data_sets_project ON mock_data_sets(project_id);
CREATE INDEX idx_design_messages_project ON design_messages(project_id);
CREATE INDEX idx_spec_snapshots_project ON spec_snapshots(project_id);
CREATE INDEX idx_auto_fix_runs_project ON auto_fix_runs(project_id);
```

## DuckDB Gotchas

These are the key differences from SQLite that trip people up:

| SQLite | DuckDB |
|--------|--------|
| `INSERT OR IGNORE INTO ...` | `INSERT INTO ... ON CONFLICT DO NOTHING` |
| `INSERT OR REPLACE INTO ...` | `INSERT INTO ... ON CONFLICT (key) DO UPDATE SET ...` |
| `datetime('now')` | `CAST(current_timestamp AS VARCHAR)` |
| `GROUP BY` allows partial columns | `GROUP BY` must list ALL non-aggregated columns |
| `BOOLEAN` returns 0/1 | `BOOLEAN` returns native `true`/`false` |
| `?` params | `$1, $2, ...` (auto-bridged by helpers.ts) |

## Migrations

Schema versioning is tracked via the `schema_version` table. Migrations live in `src/lib/db/migrations.ts`.

To add a migration:

1. Add a new block in `migrations.ts` guarded by `if (currentVersion < N)`
2. Wrap `ALTER TABLE` in try/catch for idempotency
3. Bump `SCHEMA_VERSION` constant
4. Update the table definition in `schema.ts` to match
5. Update `GROUP BY` clauses in any affected queries

## Reset

```bash
pnpm db:reset   # Deletes data.duckdb and .wal file
pnpm seed       # Re-seeds built-in data
```
