import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const interaction = sqliteTable('interaction', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  sourceType: text('source_type').notNull(), // 'web' | 'cctv' | 'social'
  sessionId: text('session_id'),
  data: text('data').notNull(),
  summary: text('summary'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
