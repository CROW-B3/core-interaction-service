-- Core Interaction Service Initial Schema

-- Sessions table (mirrored from web-ingest for processing)
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `project_id` TEXT NOT NULL,
  `user_id` TEXT,
  `anonymous_id` TEXT NOT NULL,
  `started_at` INTEGER NOT NULL,
  `ended_at` INTEGER,
  `event_count` INTEGER DEFAULT 0 NOT NULL,
  `processed_at` INTEGER,
  `processing_status` TEXT DEFAULT 'pending' NOT NULL,
  `metadata` TEXT,
  `created_at` INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_sessions_project` ON `sessions`(`project_id`);
CREATE INDEX IF NOT EXISTS `idx_sessions_status` ON `sessions`(`processing_status`);

-- Events table (mirrored from web-ingest for analysis)
CREATE TABLE IF NOT EXISTS `events` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `session_id` TEXT NOT NULL REFERENCES `sessions`(`id`),
  `project_id` TEXT NOT NULL,
  `type` TEXT NOT NULL,
  `timestamp` INTEGER NOT NULL,
  `url` TEXT NOT NULL,
  `data` TEXT,
  `user_agent` TEXT,
  `screen_size_json` TEXT,
  `created_at` INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_events_session` ON `events`(`session_id`);
CREATE INDEX IF NOT EXISTS `idx_events_timestamp` ON `events`(`timestamp`);

-- Interactions table (AI-generated analysis results)
CREATE TABLE IF NOT EXISTS `interactions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `session_id` TEXT NOT NULL REFERENCES `sessions`(`id`),
  `project_id` TEXT NOT NULL,
  `interaction_type` TEXT NOT NULL,
  `category` TEXT NOT NULL,
  `description` TEXT NOT NULL,
  `summary` TEXT NOT NULL,
  `confidence` REAL NOT NULL,
  `metrics` TEXT,
  `patterns` TEXT,
  `timestamp` INTEGER NOT NULL,
  `created_at` INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_interactions_session` ON `interactions`(`session_id`);
CREATE INDEX IF NOT EXISTS `idx_interactions_project` ON `interactions`(`project_id`);
CREATE INDEX IF NOT EXISTS `idx_interactions_type` ON `interactions`(`interaction_type`);
CREATE INDEX IF NOT EXISTS `idx_interactions_category` ON `interactions`(`category`);

-- AI Processing Logs table (track AI analysis runs)
CREATE TABLE IF NOT EXISTS `ai_processing_logs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `session_id` TEXT NOT NULL REFERENCES `sessions`(`id`),
  `success` INTEGER NOT NULL,
  `agents_used` INTEGER DEFAULT 0 NOT NULL,
  `tasks_completed` INTEGER DEFAULT 0 NOT NULL,
  `error_message` TEXT,
  `created_at` INTEGER DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_ai_logs_session` ON `ai_processing_logs`(`session_id`);
CREATE INDEX IF NOT EXISTS `idx_ai_logs_success` ON `ai_processing_logs`(`success`);
