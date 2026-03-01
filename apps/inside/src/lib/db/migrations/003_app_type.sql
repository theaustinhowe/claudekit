ALTER TABLE generator_projects ADD COLUMN app_type TEXT NOT NULL DEFAULT 'web';

-- Backfill existing projects
UPDATE generator_projects SET app_type = 'desktop' WHERE platform = 'desktop-app';
UPDATE generator_projects SET app_type = 'tool' WHERE platform = 'cli';
