import { createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { getSessionInteractions, getInteractionsByType, getInteractionStats, initializeDatabase } from '../services/database';

// Get interactions for a session
const getSessionInteractionsParams = z.object({
  sessionId: z.string().openapi({ param: { name: 'sessionId', in: 'path' } }),
});

const InteractionResponseSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  eventCount: z.number(),
  type: z.enum(['user_behavior', 'engagement_pattern', 'anomaly', 'custom']),
  title: z.string(),
  description: z.string(),
  confidence: z.number(),
  tags: z.array(z.string()),
  metadata: z.record(z.any()).optional(),
  createdAt: z.number(),
  processedAt: z.number(),
});

export const GetSessionInteractionsRoute = createRoute({
  method: 'get',
  path: '/sessions/{sessionId}/interactions',
  request: {
    params: getSessionInteractionsParams,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(InteractionResponseSchema) } },
      description: 'Session interactions retrieved successfully',
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Session not found',
    },
    500: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Internal server error',
    },
  },
});

// Get interactions by type
const getByTypeParams = z.object({
  type: z
    .enum(['user_behavior', 'engagement_pattern', 'anomaly', 'custom'])
    .openapi({ param: { name: 'type', in: 'path' } }),
});

export const GetInteractionsByTypeRoute = createRoute({
  method: 'get',
  path: '/interactions/type/{type}',
  request: {
    params: getByTypeParams,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(InteractionResponseSchema) } },
      description: 'Interactions retrieved successfully',
    },
    400: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Invalid type',
    },
    500: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Internal server error',
    },
  },
});

// Get statistics
export const GetInteractionStatsRoute = createRoute({
  method: 'get',
  path: '/interactions/stats',
  request: {},
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            total_interactions: z.number(),
            unique_sessions: z.number(),
            avg_confidence: z.number(),
            last_processed: z.number().optional(),
          }),
        },
      },
      description: 'Interaction statistics',
    },
    500: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Internal server error',
    },
  },
});

// Handler implementations
export async function handleGetSessionInteractions(c: any) {
  try {
    // Ensure database is initialized
    try {
      await initializeDatabase(c.env.DB);
    } catch (dbError) {
      console.warn('Database initialization warning:', dbError);
    }

    const { sessionId } = c.req.valid('param');
    const interactions = await getSessionInteractions(c.env.DB, sessionId);

    return c.json(interactions);
  } catch (error) {
    console.error('Error getting session interactions:', error);
    return c.json(
      { error: 'Failed to retrieve interactions' },
      500
    );
  }
}

export async function handleGetInteractionsByType(c: any) {
  try {
    // Ensure database is initialized
    try {
      await initializeDatabase(c.env.DB);
    } catch (dbError) {
      console.warn('Database initialization warning:', dbError);
    }

    const { type } = c.req.valid('param');
    const interactions = await getInteractionsByType(c.env.DB, type);

    return c.json(interactions);
  } catch (error) {
    console.error('Error getting interactions by type:', error);
    return c.json(
      { error: 'Failed to retrieve interactions' },
      500
    );
  }
}

export async function handleGetInteractionStats(c: any) {
  try {
    // Ensure database is initialized
    try {
      await initializeDatabase(c.env.DB);
    } catch (dbError) {
      console.warn('Database initialization warning:', dbError);
    }

    const stats = await getInteractionStats(c.env.DB);
    return c.json(stats);
  } catch (error) {
    console.error('Error getting interaction stats:', error);
    return c.json(
      { error: 'Failed to retrieve statistics' },
      500
    );
  }
}

/**
 * Handle POST /sessions/{sessionId}/process request
 * Queues a session for processing
 */
export async function handleProcessSession(c: any) {
  try {
    const { sessionId } = c.req.valid('param');

    // Validate sessionId is not empty
    if (!sessionId || sessionId.trim().length === 0) {
      return c.json(
        { error: 'Session ID cannot be empty' },
        400
      );
    }

    // Queue the session for processing
    // Note: The actual session data would come from the web-ingest-service
    // This endpoint just triggers the processing pipeline
    const message = {
      sessionId,
      // The full message data would be populated by the queue system
      // This is a trigger message to indicate processing should start
      timestamp: Date.now(),
    };

    try {
      await c.env.PROCESSING_QUEUE.send(message);
      console.log(`Queued session ${sessionId} for processing`);

      return c.json(
        {
          message: `Session ${sessionId} has been queued for processing`,
          sessionId,
        },
        202  // 202 Accepted
      );
    } catch (queueError) {
      console.error(`Failed to queue session ${sessionId}:`, queueError);
      return c.json(
        { error: 'Failed to queue session for processing' },
        500
      );
    }
  } catch (error) {
    console.error('Error processing session request:', error);
    return c.json(
      { error: 'Failed to process request' },
      500
    );
  }
}
