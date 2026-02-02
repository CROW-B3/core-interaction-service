import { createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { HelloWorldSchema, ProcessSessionSchema, ErrorResponseSchema } from './types';

export const HelloWorldRoute = createRoute({
  method: 'get',
  path: '/',
  request: {},
  responses: {
    200: {
      content: { 'application/json': { schema: HelloWorldSchema } },
      description: 'Hello World',
    },
  },
});

/**
 * POST /sessions/{sessionId}/process - Trigger processing for a session
 */
const processSessionParams = z.object({
  sessionId: z.string().openapi({ param: { name: 'sessionId', in: 'path' } }),
});

export const ProcessSessionRoute = createRoute({
  method: 'post',
  path: '/sessions/{sessionId}/process',
  request: {
    params: processSessionParams,
  },
  responses: {
    202: {
      content: { 'application/json': { schema: ProcessSessionSchema } },
      description: 'Session processing has been queued',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid session ID',
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Internal server error',
    },
  },
});
