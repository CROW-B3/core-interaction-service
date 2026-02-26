-- Migration: Recreate session_analyses table with updated schema
-- Description: Drops old session_analyses table (incompatible schema) and recreates with new AI analysis columns

DROP TABLE IF EXISTS session_analyses;

CREATE TABLE IF NOT EXISTS session_analyses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  journey_analysis TEXT,
  page_analyses TEXT,
  exit_analysis TEXT,
  summary TEXT,
  confidence REAL,
  tags TEXT,
  event_count INTEGER,
  replay_chunk_count INTEGER,
  processing_duration_ms INTEGER,
  model_used TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  processed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_session_analyses_session ON session_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_session_analyses_status ON session_analyses(status);
CREATE INDEX IF NOT EXISTS idx_session_analyses_created ON session_analyses(created_at);
