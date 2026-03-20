import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const interaction = sqliteTable('interaction', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  sourceType: text('source_type').notNull(),
  sessionId: text('session_id'),
  data: text('data').notNull(),
  summary: text('summary'),
  confidence: real('confidence'),
  tags: text('tags'),
  productIds: text('product_ids'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
