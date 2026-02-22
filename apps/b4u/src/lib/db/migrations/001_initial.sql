-- B4U Consolidated Schema (12 tables)
-- Standardized: TEXT ids, TIMESTAMPTZ timestamps, JSON columns, unified session DDL

-- Project summary (per-run)
CREATE TABLE IF NOT EXISTS project_summary (
  id INTEGER DEFAULT 1,
  run_id TEXT,
  name TEXT NOT NULL,
  framework TEXT NOT NULL,
  directories TEXT[] NOT NULL,
  auth TEXT NOT NULL,
  database_info TEXT NOT NULL,
  project_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unified run content (replaces routes, user_flows, file_tree, mock_data_entities, auth_overrides, env_items)
CREATE TABLE IF NOT EXISTS run_content (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data_json JSON NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_content_run_type ON run_content(run_id, content_type);

-- Flow scripts with embedded steps (per-run)
CREATE TABLE IF NOT EXISTS flow_scripts (
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  flow_name TEXT NOT NULL,
  steps_json JSON NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Flow voiceover with paragraphs and markers (per-run)
CREATE TABLE IF NOT EXISTS flow_voiceover (
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  paragraphs_json JSON NOT NULL DEFAULT '[]',
  markers_json JSON NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Voice options (reference/config data, NOT per-run)
CREATE TABLE IF NOT EXISTS voice_options (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  style TEXT NOT NULL
);

-- Chapter markers (per-run)
CREATE TABLE IF NOT EXISTS chapter_markers (
  id INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  flow_name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Run state (persisted chat messages + phase state)
CREATE TABLE IF NOT EXISTS run_state (
  run_id TEXT PRIMARY KEY,
  messages_json JSON NOT NULL,
  current_phase INTEGER NOT NULL DEFAULT 1,
  phase_statuses_json JSON NOT NULL,
  project_path TEXT,
  project_name TEXT,
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

-- Recordings (per-run)
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT NOT NULL,
  run_id TEXT,
  flow_id TEXT NOT NULL,
  flow_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration_seconds DECIMAL,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audio files (per-run)
CREATE TABLE IF NOT EXISTS audio_files (
  id TEXT NOT NULL,
  run_id TEXT,
  flow_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration_seconds DECIMAL,
  voice_id TEXT,
  speed DECIMAL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Final merged videos (per-run)
CREATE TABLE IF NOT EXISTS final_videos (
  id TEXT NOT NULL,
  run_id TEXT,
  file_path TEXT NOT NULL,
  duration_seconds DECIMAL,
  width INTEGER,
  height INTEGER,
  file_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
