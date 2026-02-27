-- Authenticated GitHub user cache
CREATE TABLE IF NOT EXISTS github_user (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  avatar_url TEXT,
  name TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

-- Account-wide PR support
ALTER TABLE prs ADD COLUMN IF NOT EXISTS user_relationship TEXT;
ALTER TABLE prs ADD COLUMN IF NOT EXISTS html_url TEXT;
ALTER TABLE prs ADD COLUMN IF NOT EXISTS repo_full_name TEXT;

-- Skill groups (react-components, css-styling, migrations, etc.)
CREATE TABLE IF NOT EXISTS skill_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Link skills to groups + store generated SKILL.md rule content
ALTER TABLE skills ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS rule_content TEXT;
CREATE INDEX IF NOT EXISTS idx_skills_group_id ON skills(group_id);

-- Split execution tracking (per sub-PR)
CREATE TABLE IF NOT EXISTS split_executions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  sub_pr_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  branch_name TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_split_executions_plan ON split_executions(plan_id);

-- Comment fix execution tracking
CREATE TABLE IF NOT EXISTS fix_executions (
  id TEXT PRIMARY KEY,
  fix_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  branch_name TEXT,
  commit_sha TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_fix_executions_fix ON fix_executions(fix_id);

-- Local clone path for repos
ALTER TABLE repos ADD COLUMN IF NOT EXISTS local_path TEXT;
