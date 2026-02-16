-- DuckDB Schema for Agent Foundry Orchestrator
-- Complete schema — all tables, indexes, and defaults
-- Note: uuid() is a built-in function in DuckDB 1.0+, no extension needed
-- Note: Foreign keys not supported in DuckDB — integrity maintained at app level

-- Repositories table - multi-repo configuration
CREATE TABLE IF NOT EXISTS repositories (
    id UUID PRIMARY KEY DEFAULT uuid(),
    owner VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    display_name VARCHAR,
    github_token VARCHAR NOT NULL,
    base_branch VARCHAR NOT NULL DEFAULT 'main',
    trigger_label VARCHAR NOT NULL DEFAULT 'agent',
    workdir_path VARCHAR NOT NULL,
    is_active BOOLEAN DEFAULT true,
    auto_create_jobs BOOLEAN DEFAULT true,
    remove_label_after_create BOOLEAN DEFAULT false,
    auto_start_jobs BOOLEAN DEFAULT true,
    auto_create_pr BOOLEAN DEFAULT true,
    poll_interval_ms INTEGER DEFAULT 30000,
    test_command VARCHAR,
    agent_provider VARCHAR DEFAULT 'claude-code',
    branch_pattern VARCHAR DEFAULT 'agent/issue-{number}-{slug}',
    auto_cleanup BOOLEAN DEFAULT true,
    last_issue_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repositories_owner_name ON repositories(owner, name);

-- Jobs table - GitHub issue tracking with full lifecycle
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid(),
    repository_id UUID,
    issue_number INTEGER NOT NULL,
    issue_url VARCHAR NOT NULL,
    issue_title VARCHAR NOT NULL,
    issue_body VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'queued',
    branch VARCHAR,
    worktree_path VARCHAR,
    pr_number INTEGER,
    pr_url VARCHAR,
    test_retry_count INTEGER NOT NULL DEFAULT 0,
    last_test_output VARCHAR,
    change_summary VARCHAR,
    pause_reason VARCHAR,
    failure_reason VARCHAR,
    needs_info_question VARCHAR,
    needs_info_comment_id INTEGER,
    last_checked_comment_id INTEGER,
    last_checked_pr_review_comment_id INTEGER,
    claude_session_id VARCHAR,
    inject_mode VARCHAR DEFAULT 'immediate',
    pending_injection VARCHAR,
    process_pid INTEGER,
    process_started_at TIMESTAMPTZ,
    agent_type VARCHAR DEFAULT 'claude-code',
    agent_session_data JSON,
    plan_content VARCHAR,
    plan_comment_id INTEGER,
    last_checked_plan_comment_id INTEGER,
    source VARCHAR NOT NULL DEFAULT 'github_issue',
    phase VARCHAR,
    progress INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_repo_issue ON jobs(repository_id, issue_number);

-- Job events table - audit trail for state transitions
CREATE TABLE IF NOT EXISTS job_events (
    id UUID PRIMARY KEY DEFAULT uuid(),
    job_id UUID NOT NULL,
    event_type VARCHAR NOT NULL,
    from_status VARCHAR,
    to_status VARCHAR,
    message VARCHAR,
    metadata JSON,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_created_at ON job_events(created_at);

-- Job logs table - streaming log chunks
CREATE TABLE IF NOT EXISTS job_logs (
    id UUID PRIMARY KEY DEFAULT uuid(),
    job_id UUID NOT NULL,
    stream VARCHAR NOT NULL DEFAULT 'stdout',
    content VARCHAR NOT NULL,
    sequence INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_logs_job_seq ON job_logs(job_id, sequence);

-- Settings table - key-value config store
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR PRIMARY KEY,
    value JSON NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Issues table - local cache of GitHub issues
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT uuid(),
    repository_id UUID NOT NULL,
    number INTEGER NOT NULL,
    title VARCHAR NOT NULL,
    body VARCHAR,
    state VARCHAR NOT NULL DEFAULT 'open',
    html_url VARCHAR NOT NULL,
    author_login VARCHAR,
    author_avatar_url VARCHAR,
    author_html_url VARCHAR,
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
    id UUID PRIMARY KEY DEFAULT uuid(),
    repository_id UUID NOT NULL,
    issue_number INTEGER NOT NULL,
    github_comment_id INTEGER NOT NULL,
    body VARCHAR NOT NULL,
    html_url VARCHAR NOT NULL,
    author_login VARCHAR,
    author_type VARCHAR,
    author_avatar_url VARCHAR,
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
    id UUID PRIMARY KEY DEFAULT uuid(),
    type VARCHAR NOT NULL,
    message VARCHAR NOT NULL,
    metadata JSON,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_events_created_at ON health_events(created_at);
CREATE INDEX IF NOT EXISTS idx_health_events_type ON health_events(type);

-- Research sessions table
CREATE TABLE IF NOT EXISTS research_sessions (
    id UUID PRIMARY KEY DEFAULT uuid(),
    repository_id UUID NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'running',
    focus_areas VARCHAR NOT NULL,
    claude_session_id VARCHAR,
    process_pid INTEGER,
    output VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_sessions_repository ON research_sessions(repository_id);
CREATE INDEX IF NOT EXISTS idx_research_sessions_status ON research_sessions(status);

-- Research suggestions table
CREATE TABLE IF NOT EXISTS research_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid(),
    session_id UUID NOT NULL,
    category VARCHAR NOT NULL,
    severity VARCHAR NOT NULL DEFAULT 'medium',
    title VARCHAR NOT NULL,
    description VARCHAR NOT NULL,
    file_paths VARCHAR,
    converted_to VARCHAR,
    converted_id VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_suggestions_session ON research_suggestions(session_id);
