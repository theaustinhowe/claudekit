-- DuckDB Schema for GoGo Orchestrator
-- Complete schema — all tables, indexes, and defaults
-- IDs are app-generated (TEXT), not DB-generated
-- Foreign keys not supported in DuckDB — integrity maintained at app level

-- Repositories table - multi-repo configuration
CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT,
    github_token TEXT NOT NULL,
    base_branch TEXT NOT NULL DEFAULT 'main',
    trigger_label TEXT NOT NULL DEFAULT 'agent',
    workdir_path TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    auto_create_jobs BOOLEAN DEFAULT true,
    remove_label_after_create BOOLEAN DEFAULT false,
    auto_start_jobs BOOLEAN DEFAULT true,
    auto_create_pr BOOLEAN DEFAULT true,
    poll_interval_ms INTEGER DEFAULT 30000,
    test_command TEXT,
    agent_provider TEXT DEFAULT 'claude-code',
    branch_pattern TEXT DEFAULT 'agent/issue-{number}-{slug}',
    auto_cleanup BOOLEAN DEFAULT true,
    last_issue_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repositories_owner_name ON repositories(owner, name);

-- Jobs table - GitHub issue tracking with full lifecycle
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    repository_id TEXT,
    issue_number INTEGER NOT NULL,
    issue_url TEXT NOT NULL,
    issue_title TEXT NOT NULL,
    issue_body TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    branch TEXT,
    worktree_path TEXT,
    pr_number INTEGER,
    pr_url TEXT,
    test_retry_count INTEGER NOT NULL DEFAULT 0,
    last_test_output TEXT,
    change_summary TEXT,
    pause_reason TEXT,
    failure_reason TEXT,
    needs_info_question TEXT,
    needs_info_comment_id INTEGER,
    last_checked_comment_id INTEGER,
    last_checked_pr_review_comment_id INTEGER,
    claude_session_id TEXT,
    inject_mode TEXT DEFAULT 'immediate',
    pending_injection TEXT,
    process_pid INTEGER,
    process_started_at TIMESTAMPTZ,
    agent_type TEXT DEFAULT 'claude-code',
    agent_session_data JSON,
    plan_content TEXT,
    plan_comment_id INTEGER,
    last_checked_plan_comment_id INTEGER,
    source TEXT NOT NULL DEFAULT 'github_issue',
    phase TEXT,
    progress INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_repo_issue ON jobs(repository_id, issue_number);

-- Job events table - audit trail for state transitions
CREATE TABLE IF NOT EXISTS job_events (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    message TEXT,
    metadata JSON,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_created_at ON job_events(created_at);

-- Job logs table - streaming log chunks
CREATE TABLE IF NOT EXISTS job_logs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    stream TEXT NOT NULL DEFAULT 'stdout',
    content TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_logs_job_seq ON job_logs(job_id, sequence);

-- Settings table - key-value config store
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSON NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Issues table - local cache of GitHub issues
CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    state TEXT NOT NULL DEFAULT 'open',
    html_url TEXT NOT NULL,
    author_login TEXT,
    author_avatar_url TEXT,
    author_html_url TEXT,
    labels JSON,
    github_created_at TIMESTAMPTZ,
    github_updated_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_repo_number ON issues(repository_id, number);
CREATE INDEX IF NOT EXISTS idx_issues_state ON issues(state);

-- Issue comments table - local cache of GitHub issue comments
CREATE TABLE IF NOT EXISTS issue_comments (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    issue_number INTEGER NOT NULL,
    github_comment_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    html_url TEXT NOT NULL,
    author_login TEXT,
    author_type TEXT,
    author_avatar_url TEXT,
    github_created_at TIMESTAMPTZ,
    github_updated_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_comments_github_id ON issue_comments(repository_id, github_comment_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments(repository_id, issue_number);

-- Health events table - persistent structured health events
CREATE TABLE IF NOT EXISTS health_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSON,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_events_created_at ON health_events(created_at);
CREATE INDEX IF NOT EXISTS idx_health_events_type ON health_events(type);

-- Research sessions table
CREATE TABLE IF NOT EXISTS research_sessions (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    focus_areas TEXT NOT NULL,
    claude_session_id TEXT,
    process_pid INTEGER,
    output TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_sessions_repository ON research_sessions(repository_id);
CREATE INDEX IF NOT EXISTS idx_research_sessions_status ON research_sessions(status);

-- Research suggestions table
CREATE TABLE IF NOT EXISTS research_suggestions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    file_paths TEXT,
    converted_to TEXT,
    converted_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_suggestions_session ON research_suggestions(session_id);

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
