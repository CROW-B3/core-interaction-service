import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const sessionAnalyses = sqliteTable(
  'session_analyses',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().unique(),
    status: text('status', {
      enum: ['pending', 'processing', 'completed', 'failed'],
    })
      .notNull()
      .default('pending'),
    journeyAnalysis: text('journey_analysis', { mode: 'json' }),
    pageAnalyses: text('page_analyses', { mode: 'json' }),
    exitAnalysis: text('exit_analysis', { mode: 'json' }),
    summary: text('summary'),
    confidence: real('confidence'),
    tags: text('tags', { mode: 'json' }),
    eventCount: integer('event_count'),
    replayChunkCount: integer('replay_chunk_count'),
    processingDurationMs: integer('processing_duration_ms'),
    modelUsed: text('model_used'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    processedAt: integer('processed_at', { mode: 'timestamp' }),
  },
  table => ({
    sessionIdx: index('idx_session_analyses_session').on(table.sessionId),
    statusIdx: index('idx_session_analyses_status').on(table.status),
    createdIdx: index('idx_session_analyses_created').on(table.createdAt),
  })
);

export type SessionAnalysis = typeof sessionAnalyses.$inferSelect;
export type NewSessionAnalysis = typeof sessionAnalyses.$inferInsert;
