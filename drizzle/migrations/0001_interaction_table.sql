CREATE TABLE IF NOT EXISTS `interaction` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `source_type` text NOT NULL,
  `session_id` text,
  `data` text NOT NULL,
  `summary` text,
  `timestamp` integer NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `interaction_org_idx` ON `interaction` (`organization_id`);
CREATE INDEX IF NOT EXISTS `interaction_source_idx` ON `interaction` (`source_type`);
