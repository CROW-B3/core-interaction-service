CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  session_start INTEGER NOT NULL,
  session_end INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interactions_store_session
  ON interactions(store_id, session_start);

CREATE TABLE IF NOT EXISTS time_period_analyses (
  id TEXT PRIMARY KEY,
  interaction_id TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  analysis TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (interaction_id) REFERENCES interactions(id)
);

CREATE INDEX IF NOT EXISTS idx_tpa_interaction
  ON time_period_analyses(interaction_id, period_start);
