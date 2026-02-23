-- Gadget Initial Schema (consolidated)
-- 24 app tables + 2 session tables = 26 total
-- Standards: TIMESTAMPTZ DEFAULT now(), TEXT IDs, native JSON type

-- 1. scan_roots
CREATE TABLE IF NOT EXISTS scan_roots (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_scanned_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_roots_path ON scan_roots(path);

-- 2. scans (scan_root_ids JSON replaces scan_root_entries junction table)
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  policy_id TEXT,
  scan_root_ids JSON DEFAULT '[]',
  progress INTEGER DEFAULT 0,
  phase TEXT DEFAULT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. repos
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  local_path TEXT NOT NULL UNIQUE,
  git_remote TEXT,
  default_branch TEXT DEFAULT 'main',
  package_manager TEXT,
  repo_type TEXT,
  is_monorepo BOOLEAN DEFAULT false,
  github_url TEXT,
  github_account_id TEXT,
  source TEXT DEFAULT 'local',
  last_scanned_at TIMESTAMPTZ,
  last_modified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. policies
CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  expected_versions JSON DEFAULT '{}',
  banned_dependencies JSON DEFAULT '[]',
  allowed_package_managers JSON DEFAULT '[]',
  preferred_package_manager TEXT DEFAULT 'pnpm',
  ignore_patterns JSON DEFAULT '[]',
  repo_types JSON DEFAULT '[]',
  is_builtin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. findings
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  scan_id TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  evidence TEXT,
  suggested_actions JSON DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_findings_repo_scan ON findings(repo_id, scan_id);

-- 6. fix_actions
CREATE TABLE IF NOT EXISTS fix_actions (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  finding_id TEXT,
  scan_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  impact TEXT,
  risk TEXT,
  requires_approval BOOLEAN DEFAULT false,
  diff_file TEXT,
  diff_before TEXT,
  diff_after TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fix_actions_repo_scan ON fix_actions(repo_id, scan_id);

-- 7. snapshots
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  scan_id TEXT,
  files TEXT NOT NULL,
  snapshot_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. apply_runs
CREATE TABLE IF NOT EXISTS apply_runs (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  scan_id TEXT,
  snapshot_id TEXT,
  status TEXT DEFAULT 'pending',
  actions_applied JSON DEFAULT '[]',
  log JSON DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 9. settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. github_accounts
CREATE TABLE IF NOT EXISTS github_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  avatar_url TEXT,
  pat_encrypted TEXT NOT NULL,
  scopes JSON DEFAULT '[]',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

-- 13. concept_sources
CREATE TABLE IF NOT EXISTS concept_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  repo_id TEXT,
  github_owner TEXT,
  github_repo TEXT,
  github_default_branch TEXT,
  github_url TEXT,
  list_url TEXT,
  is_builtin BOOLEAN DEFAULT false,
  last_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 14. concepts
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  scan_id TEXT,
  source_id TEXT,
  concept_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  relative_path TEXT NOT NULL,
  content TEXT,
  metadata JSON DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concepts_repo ON concepts(repo_id);
CREATE INDEX IF NOT EXISTS idx_concepts_type ON concepts(concept_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_concepts_repo_path ON concepts(repo_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_concepts_source ON concepts(source_id);

-- 15. concept_links
CREATE TABLE IF NOT EXISTS concept_links (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  sync_status TEXT DEFAULT 'pending',
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(concept_id, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_links_concept ON concept_links(concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_links_repo ON concept_links(repo_id);

-- 16. custom_rules
CREATE TABLE IF NOT EXISTS custom_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  severity TEXT NOT NULL DEFAULT 'warning',
  rule_type TEXT NOT NULL,
  config JSON DEFAULT '{}',
  suggested_actions JSON DEFAULT '[]',
  policy_id TEXT,
  is_enabled BOOLEAN DEFAULT true,
  is_builtin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_rules_policy ON custom_rules(policy_id);

-- 17. manual_findings
CREATE TABLE IF NOT EXISTS manual_findings (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  details TEXT,
  evidence TEXT,
  suggested_actions JSON DEFAULT '[]',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_findings_repo ON manual_findings(repo_id);

-- 18. policy_templates
CREATE TABLE IF NOT EXISTS policy_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  defaults JSON DEFAULT '{}',
  category TEXT,
  is_builtin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Session tables (@claudekit/session integration)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  label TEXT NOT NULL,
  context_type TEXT,
  context_id TEXT,
  context_name TEXT,
  metadata_json JSON DEFAULT '{}',
  progress INTEGER DEFAULT 0,
  phase TEXT,
  pid INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  error_message TEXT,
  result_json JSON DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_context ON sessions(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);

CREATE TABLE IF NOT EXISTS session_logs (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  log TEXT NOT NULL,
  log_type TEXT DEFAULT 'status',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_logs(session_id);
