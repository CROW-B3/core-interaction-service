-- Migration number: 0001 	 2026-02-02T07:02:00.480Z
-- Create interactions table for storing AI-generated insights

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  eventCount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('user_behavior', 'engagement_pattern', 'anomaly', 'custom')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  tags TEXT NOT NULL,
  metadata TEXT,
  createdAt INTEGER NOT NULL,
  processedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interactions_sessionId ON interactions(sessionId);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);
CREATE INDEX IF NOT EXISTS idx_interactions_createdAt ON interactions(createdAt);
