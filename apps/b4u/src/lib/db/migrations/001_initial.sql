-- B4U Initial Schema
-- All tables and sequences

-- Sequences (defined before tables that use them)
CREATE SEQUENCE IF NOT EXISTS session_logs_seq START 1;

-- Project summary (per-run)
CREATE TABLE IF NOT EXISTS project_summary (
  id INTEGER DEFAULT 1,
  run_id VARCHAR,
  name VARCHAR NOT NULL,
  framework VARCHAR NOT NULL,
  directories VARCHAR[] NOT NULL,
  auth VARCHAR NOT NULL,
  database_info VARCHAR NOT NULL,
  project_path VARCHAR
);

-- File tree stored as JSON (per-run)
CREATE TABLE IF NOT EXISTS file_tree (
  id INTEGER DEFAULT 1,
  run_id VARCHAR,
  tree_json JSON NOT NULL
);

-- Routes (per-run, id is sequential within a run)
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER NOT NULL,
  run_id VARCHAR,
  path VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  auth_required BOOLEAN NOT NULL,
  description VARCHAR NOT NULL
);

-- User flows (per-run)
CREATE TABLE IF NOT EXISTS user_flows (
  id VARCHAR NOT NULL,
  run_id VARCHAR,
  name VARCHAR NOT NULL,
  steps VARCHAR[] NOT NULL
);

-- Mock data entities (per-run)
CREATE TABLE IF NOT EXISTS mock_data_entities (
  id INTEGER NOT NULL,
  run_id VARCHAR,
  name VARCHAR NOT NULL,
  count INTEGER NOT NULL,
  note VARCHAR NOT NULL
);

-- Auth overrides (per-run)
CREATE TABLE IF NOT EXISTS auth_overrides (
  id VARCHAR NOT NULL,
  run_id VARCHAR,
  label VARCHAR NOT NULL,
  enabled BOOLEAN NOT NULL
);

-- Environment items (per-run)
CREATE TABLE IF NOT EXISTS env_items (
  id VARCHAR NOT NULL,
  run_id VARCHAR,
  label VARCHAR NOT NULL,
  enabled BOOLEAN NOT NULL
);

-- Flow scripts (per-run)
CREATE TABLE IF NOT EXISTS flow_scripts (
  id INTEGER NOT NULL,
  run_id VARCHAR,
  flow_id VARCHAR NOT NULL,
  flow_name VARCHAR NOT NULL
);

-- Script steps (per-run)
CREATE TABLE IF NOT EXISTS script_steps (
  id VARCHAR NOT NULL,
  run_id VARCHAR,
  flow_id VARCHAR NOT NULL,
  step_number INTEGER NOT NULL,
  url VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  expected_outcome VARCHAR NOT NULL,
  duration VARCHAR NOT NULL
);

-- Voiceover scripts (per-run)
CREATE TABLE IF NOT EXISTS voiceover_scripts (
  flow_id VARCHAR NOT NULL,
  run_id VARCHAR,
  paragraph_index INTEGER NOT NULL,
  text VARCHAR NOT NULL
);

-- Voice options (reference/config data, NOT per-run)
CREATE TABLE IF NOT EXISTS voice_options (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  style VARCHAR NOT NULL
);

-- Timeline markers (per-run)
CREATE TABLE IF NOT EXISTS timeline_markers (
  id INTEGER NOT NULL,
  run_id VARCHAR,
  flow_id VARCHAR NOT NULL,
  timestamp VARCHAR NOT NULL,
  label VARCHAR NOT NULL,
  paragraph_index INTEGER NOT NULL
);

-- Chapter markers (per-run)
CREATE TABLE IF NOT EXISTS chapter_markers (
  id INTEGER NOT NULL,
  run_id VARCHAR,
  flow_name VARCHAR NOT NULL,
  start_time VARCHAR NOT NULL
);

-- Run state (persisted chat messages + phase state)
CREATE TABLE IF NOT EXISTS run_state (
  run_id VARCHAR PRIMARY KEY,
  messages_json TEXT NOT NULL,
  current_phase INTEGER NOT NULL DEFAULT 1,
  phase_statuses_json TEXT NOT NULL,
  project_path VARCHAR,
  project_name VARCHAR,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions (Claude CLI runs)
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR PRIMARY KEY,
  session_type VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  label VARCHAR,
  project_path VARCHAR,
  run_id VARCHAR,
  pid INTEGER,
  progress DECIMAL,
  phase VARCHAR,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message VARCHAR,
  result_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session logs
CREATE TABLE IF NOT EXISTS session_logs (
  id INTEGER PRIMARY KEY DEFAULT nextval('session_logs_seq'),
  session_id VARCHAR NOT NULL,
  log TEXT NOT NULL,
  log_type VARCHAR DEFAULT 'status',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recordings (per-run)
CREATE TABLE IF NOT EXISTS recordings (
  id VARCHAR NOT NULL,
  run_id VARCHAR,
  flow_id VARCHAR NOT NULL,
  flow_name VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  duration_seconds DECIMAL,
  width INTEGER,
  height INTEGER,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audio files (per-run)
CREATE TABLE IF NOT EXISTS audio_files (
  id VARCHAR NOT NULL,
  run_id VARCHAR,
  flow_id VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  duration_seconds DECIMAL,
  voice_id VARCHAR,
  speed DECIMAL DEFAULT 1.0,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Final merged videos (per-run)
CREATE TABLE IF NOT EXISTS final_videos (
  id VARCHAR NOT NULL,
  run_id VARCHAR,
  file_path VARCHAR NOT NULL,
  duration_seconds DECIMAL,
  width INTEGER,
  height INTEGER,
  file_size_bytes BIGINT,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
