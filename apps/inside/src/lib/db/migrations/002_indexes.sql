-- Indexes for foreign keys and common query patterns
CREATE INDEX IF NOT EXISTS idx_prs_repo_id ON prs(repo_id);
CREATE INDEX IF NOT EXISTS idx_prs_repo_updated ON prs(repo_id, github_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prs_repo_size_state ON prs(repo_id, size, state);

CREATE INDEX IF NOT EXISTS idx_pr_comments_pr_id ON pr_comments(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_comments_reviewer ON pr_comments(reviewer);

CREATE INDEX IF NOT EXISTS idx_skill_analyses_repo_id ON skill_analyses(repo_id);
CREATE INDEX IF NOT EXISTS idx_skills_analysis_id ON skills(analysis_id);
CREATE INDEX IF NOT EXISTS idx_skill_comments_skill_id ON skill_comments(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_comments_comment_id ON skill_comments(comment_id);

CREATE INDEX IF NOT EXISTS idx_split_plans_pr_id ON split_plans(pr_id);
CREATE INDEX IF NOT EXISTS idx_comment_fixes_comment_id ON comment_fixes(comment_id);
