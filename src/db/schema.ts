import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const interactions = sqliteTable(
  'interactions',
  {
    id: text('id').primaryKey(),
    store_id: text('store_id').notNull(),
    session_start: integer('session_start').notNull(),
    session_end: integer('session_end').notNull(),
    summary: text('summary').notNull(), // JSON: condensed session analysis
    referenced_interactions: text('referenced_interactions'), // JSON array of interaction_ids
    created_at: text('created_at').notNull(),
  },
  table => [
    index('idx_interactions_store_session').on(
      table.store_id,
      table.session_start
    ),
  ]
);

export const timePeriodAnalyses = sqliteTable(
  'time_period_analyses',
  {
    id: text('id').primaryKey(),
    interaction_id: text('interaction_id')
      .notNull()
      .references(() => interactions.id),
    period_start: integer('period_start').notNull(),
    analysis: text('analysis').notNull(), // JSON: per-period Gemini output
    created_at: text('created_at').notNull(),
  },
  table => [
    index('idx_tpa_interaction').on(table.interaction_id, table.period_start),
  ]
);

export const cameraRegistry = sqliteTable(
  'camera_registry',
  {
    id: text('id').primaryKey(),
    store_id: text('store_id').notNull(),
    camera_id: text('camera_id').notNull(),
    zone: text('zone'),
    grid_row: integer('grid_row').notNull(),
    grid_col: integer('grid_col').notNull(),
    adjacency: text('adjacency'), // JSON: { "left": "cam2", "right": "cam4" }
    updated_at: text('updated_at').notNull(),
  },
  table => [
    uniqueIndex('idx_registry_store_camera').on(
      table.store_id,
      table.camera_id
    ),
  ]
);

export const calibrations = sqliteTable(
  'calibrations',
  {
    id: text('id').primaryKey(),
    store_id: text('store_id').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    session_id: text('session_id'),
    reasoning: text('reasoning').notNull(), // JSON: analysis chain
    adjustments: text('adjustments').notNull(), // JSON: proposed changes
    applied: integer('applied').notNull().default(0),
    created_at: text('created_at').notNull(),
  },
  table => [
    uniqueIndex('idx_calibrations_store_date').on(table.store_id, table.date),
  ]
);
