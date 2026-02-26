-- Per-phase conversation threads with revision history
CREATE TABLE IF NOT EXISTS phase_threads (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  phase INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  messages_json JSON NOT NULL DEFAULT '[]',
  decisions_json JSON NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phase_threads_run ON phase_threads(run_id);
CREATE INDEX IF NOT EXISTS idx_phase_threads_run_phase ON phase_threads(run_id, phase);

-- Add threads_json column to run_state for quick restore of activeThreadIds
ALTER TABLE run_state ADD COLUMN IF NOT EXISTS threads_json JSON DEFAULT '{}';
