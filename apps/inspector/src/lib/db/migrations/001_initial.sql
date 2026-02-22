-- Connected repositories
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cached pull requests
CREATE TABLE IF NOT EXISTS prs (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  author_avatar TEXT,
  branch TEXT,
  size TEXT CHECK (size IN ('S', 'M', 'L', 'XL')),
  lines_added INTEGER DEFAULT 0,
  lines_deleted INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  review_status TEXT,
  state TEXT DEFAULT 'open',
  complexity INTEGER,
  github_created_at TIMESTAMPTZ,
  github_updated_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (repo_id, number)
);

CREATE INDEX IF NOT EXISTS idx_prs_repo_id ON prs(repo_id);
CREATE INDEX IF NOT EXISTS idx_prs_repo_updated ON prs(repo_id, github_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prs_repo_size_state ON prs(repo_id, size, state);

-- Cached review comments
CREATE TABLE IF NOT EXISTS pr_comments (
  id TEXT PRIMARY KEY,
  pr_id TEXT NOT NULL,
  github_id BIGINT,
  reviewer TEXT NOT NULL,
  reviewer_avatar TEXT,
  body TEXT NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  severity TEXT,
  category TEXT,
  created_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_comments_pr_id ON pr_comments(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_comments_reviewer ON pr_comments(reviewer);

-- Skill analysis results
CREATE TABLE IF NOT EXISTS skill_analyses (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  pr_numbers TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_analyses_repo_id ON skill_analyses(repo_id);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  name TEXT NOT NULL,
  frequency INTEGER DEFAULT 0,
  total_prs INTEGER DEFAULT 0,
  trend TEXT,
  severity TEXT,
  top_example TEXT,
  description TEXT,
  resources JSON DEFAULT '[]',
  action_item TEXT,
  addressed BOOLEAN DEFAULT false,
  comment_ids JSON DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_skills_analysis_id ON skills(analysis_id);

-- Split plan results
CREATE TABLE IF NOT EXISTS split_plans (
  id TEXT PRIMARY KEY,
  pr_id TEXT NOT NULL,
  total_lines INTEGER,
  sub_prs JSON NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_split_plans_pr_id ON split_plans(pr_id);

-- Comment fix results
CREATE TABLE IF NOT EXISTS comment_fixes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  suggested_fix TEXT,
  fix_diff TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comment_fixes_comment_id ON comment_fixes(comment_id);

-- User settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
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
