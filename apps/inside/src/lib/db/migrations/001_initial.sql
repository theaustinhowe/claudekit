-- Connected repositories
CREATE TABLE IF NOT EXISTS repos (
  id VARCHAR PRIMARY KEY,
  owner VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  full_name VARCHAR NOT NULL,
  default_branch VARCHAR DEFAULT 'main',
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT current_timestamp
);

-- Cached pull requests
CREATE TABLE IF NOT EXISTS prs (
  id VARCHAR PRIMARY KEY,
  repo_id VARCHAR NOT NULL REFERENCES repos(id),
  number INTEGER NOT NULL,
  title VARCHAR NOT NULL,
  author VARCHAR NOT NULL,
  author_avatar VARCHAR,
  branch VARCHAR,
  size VARCHAR CHECK (size IN ('S', 'M', 'L', 'XL')),
  lines_added INTEGER DEFAULT 0,
  lines_deleted INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  review_status VARCHAR,
  state VARCHAR DEFAULT 'open',
  complexity INTEGER,
  github_created_at TIMESTAMP,
  github_updated_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT current_timestamp,
  UNIQUE (repo_id, number)
);

-- Cached review comments
CREATE TABLE IF NOT EXISTS pr_comments (
  id VARCHAR PRIMARY KEY,
  pr_id VARCHAR NOT NULL REFERENCES prs(id),
  github_id BIGINT,
  reviewer VARCHAR NOT NULL,
  reviewer_avatar VARCHAR,
  body TEXT NOT NULL,
  file_path VARCHAR,
  line_number INTEGER,
  severity VARCHAR,
  category VARCHAR,
  created_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT current_timestamp
);

-- Skill analysis results
CREATE TABLE IF NOT EXISTS skill_analyses (
  id VARCHAR PRIMARY KEY,
  repo_id VARCHAR NOT NULL REFERENCES repos(id),
  pr_numbers TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS skills (
  id VARCHAR PRIMARY KEY,
  analysis_id VARCHAR NOT NULL REFERENCES skill_analyses(id),
  name VARCHAR NOT NULL,
  frequency INTEGER DEFAULT 0,
  total_prs INTEGER DEFAULT 0,
  trend VARCHAR,
  severity VARCHAR,
  top_example TEXT,
  description TEXT,
  resources TEXT,
  action_item TEXT,
  addressed BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS skill_comments (
  id VARCHAR PRIMARY KEY,
  skill_id VARCHAR NOT NULL REFERENCES skills(id),
  comment_id VARCHAR NOT NULL REFERENCES pr_comments(id)
);

-- Split plan results
CREATE TABLE IF NOT EXISTS split_plans (
  id VARCHAR PRIMARY KEY,
  pr_id VARCHAR NOT NULL REFERENCES prs(id),
  total_lines INTEGER,
  sub_prs TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT current_timestamp
);

-- Comment fix results
CREATE TABLE IF NOT EXISTS comment_fixes (
  id VARCHAR PRIMARY KEY,
  comment_id VARCHAR NOT NULL REFERENCES pr_comments(id),
  suggested_fix TEXT,
  fix_diff TEXT,
  status VARCHAR DEFAULT 'open',
  created_at TIMESTAMP DEFAULT current_timestamp
);

-- User settings
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR PRIMARY KEY,
  value TEXT NOT NULL
);
