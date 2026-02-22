-- Inside Initial Schema
-- 9 app tables + 2 session tables = 11 total
-- Standards: TIMESTAMPTZ DEFAULT now(), TEXT IDs, native JSON type

-- 1. templates
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  description TEXT,
  recommended_pm TEXT DEFAULT 'pnpm',
  includes JSON DEFAULT '[]',
  base_files JSON DEFAULT '{}',
  is_builtin BOOLEAN DEFAULT true
);

-- 2. generator_projects (no policy_id, no repo_id)
CREATE TABLE IF NOT EXISTS generator_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  idea_description TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'nextjs',
  services JSON DEFAULT '[]',
  constraints JSON DEFAULT '[]',
  project_name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  package_manager TEXT DEFAULT 'pnpm',
  status TEXT DEFAULT 'drafting',
  active_spec_version INTEGER DEFAULT 0,
  ai_provider TEXT DEFAULT 'anthropic',
  ai_model TEXT,
  template_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  exported_at TIMESTAMPTZ,
  implementation_prompt TEXT,
  design_vibes JSON DEFAULT '[]',
  inspiration_urls JSON DEFAULT '[]',
  color_scheme JSON DEFAULT '{}',
  custom_features JSON DEFAULT '[]',
  scaffold_logs JSON
);

-- 3. project_specs
CREATE TABLE IF NOT EXISTS project_specs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  spec_json JSON NOT NULL DEFAULT '{}',
  mock_data_json JSON NOT NULL DEFAULT '[]',
  message_id TEXT,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_project_specs_project ON project_specs(project_id);

-- 4. design_messages
CREATE TABLE IF NOT EXISTS design_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  spec_diff_json JSON,
  progress_logs_json JSON,
  model_used TEXT,
  suggestions_json JSON,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_messages_project ON design_messages(project_id);

-- 5. upgrade_tasks
CREATE TABLE IF NOT EXISTS upgrade_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  order_index INTEGER NOT NULL,
  step_type TEXT DEFAULT 'implement',
  claude_output TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upgrade_tasks_project ON upgrade_tasks(project_id);

-- 6. auto_fix_runs
CREATE TABLE IF NOT EXISTS auto_fix_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  error_signature TEXT NOT NULL,
  error_message TEXT NOT NULL,
  claude_output TEXT,
  attempt_number INTEGER DEFAULT 1,
  logs_json JSON DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auto_fix_runs_project ON auto_fix_runs(project_id);

-- 7. project_screenshots
CREATE TABLE IF NOT EXISTS project_screenshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  label TEXT,
  width INTEGER DEFAULT 1280,
  height INTEGER DEFAULT 800,
  file_size INTEGER DEFAULT 0,
  message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. generator_runs (legacy, used by export)
CREATE TABLE IF NOT EXISTS generator_runs (
  id TEXT PRIMARY KEY,
  template_id TEXT,
  intent TEXT,
  project_name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  package_manager TEXT DEFAULT 'pnpm',
  features JSON DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  handoff_brief TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 9. settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
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
