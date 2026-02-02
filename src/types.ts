import { z } from '@hono/zod-openapi';

export interface Environment {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  AI: any; // Cloudflare Workers AI
  PROCESSING_QUEUE: Queue;
}

export const HelloWorldSchema = z
  .object({
    text: z.string(),
  })
  .openapi('User');

/**
 * Schema for POST /sessions/{sessionId}/process request
 */
export const ProcessSessionSchema = z
  .object({
    message: z.string().openapi({ description: 'Status message' }),
    sessionId: z.string().openapi({ description: 'Session ID that was queued for processing' }),
  })
  .openapi('ProcessSessionResponse');

/**
 * Schema for error response
 */
export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ description: 'Error message' }),
  })
  .openapi('ErrorResponse');
