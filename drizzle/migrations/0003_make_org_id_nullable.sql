-- SQLite does not support ALTER COLUMN, so we recreate the table
-- to make organization_id nullable.

CREATE TABLE `interaction_new` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text,
  `source_type` text NOT NULL,
  `session_id` text,
  `data` text NOT NULL,
  `summary` text,
  `confidence` real,
  `tags` text,
  `product_ids` text,
  `timestamp` integer NOT NULL,
  `created_at` integer NOT NULL
);

INSERT INTO `interaction_new`
  SELECT `id`, `organization_id`, `source_type`, `session_id`, `data`, `summary`, `confidence`, `tags`, `product_ids`, `timestamp`, `created_at`
  FROM `interaction`;

DROP TABLE `interaction`;

ALTER TABLE `interaction_new` RENAME TO `interaction`;

CREATE INDEX IF NOT EXISTS `interaction_org_idx` ON `interaction` (`organization_id`);
CREATE INDEX IF NOT EXISTS `interaction_source_idx` ON `interaction` (`source_type`);
