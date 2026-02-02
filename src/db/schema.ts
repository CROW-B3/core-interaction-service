import { z } from '@hono/zod-openapi';

/**
 * Interaction schema for storage
 */
export const InteractionSchema = z.object({
  id: z.string().openapi({ description: 'Unique interaction ID' }),
  sessionId: z.string().openapi({ description: 'Session ID from web-ingest-service' }),
  eventCount: z.number().openapi({ description: 'Total events in the session' }),
  type: z
    .enum(['user_behavior', 'engagement_pattern', 'anomaly', 'custom'])
    .openapi({ description: 'Type of interaction' }),
  title: z.string().openapi({ description: 'Interaction title' }),
  description: z.string().openapi({ description: 'Interaction description' }),
  confidence: z.number().min(0).max(1).openapi({ description: 'Confidence score' }),
  tags: z.array(z.string()).openapi({ description: 'Interaction tags' }),
  metadata: z
    .record(z.any())
    .optional()
    .openapi({ description: 'Additional metadata' }),
  createdAt: z.number().openapi({ description: 'Timestamp when created' }),
  processedAt: z.number().openapi({ description: 'Timestamp when processed' }),
});

export type Interaction = z.infer<typeof InteractionSchema>;

/**
 * Session event for analysis
 */
export const SessionEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.number(),
  url: z.string(),
  data: z.record(z.any()).optional(),
  userAgent: z.string().optional(),
  screenSize: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

export type SessionEvent = z.infer<typeof SessionEventSchema>;

/**
 * Session export message schema
 */
export const SessionExportSchema = z.object({
  sessionId: z.string(),
  eventCount: z.number(),
  lastActivityAt: z.number(),
  createdAt: z.number(),
  events: z.array(SessionEventSchema),
});

export type SessionExport = z.infer<typeof SessionExportSchema>;

/**
 * Create interactions table SQL
 */
export const CREATE_INTERACTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    eventCount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('user_behavior', 'engagement_pattern', 'anomaly', 'custom')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    tags TEXT NOT NULL, -- JSON array of tags
    metadata TEXT, -- JSON object
    createdAt INTEGER NOT NULL,
    processedAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_interactions_sessionId ON interactions(sessionId);
  CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);
  CREATE INDEX IF NOT EXISTS idx_interactions_createdAt ON interactions(createdAt);
`;
