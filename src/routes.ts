import { createRoute, z } from '@hono/zod-openapi';

export const AnalyzeInteractionsRoute = createRoute({
  method: 'post',
  path: '/api/v1/interactions/organization/:orgId/analyze',
  request: {
    params: z.object({ orgId: z.string().uuid() }),
    query: z.object({
      period: z.enum(['daily', 'weekly', 'monthly']).optional(),
      limit: z
        .string()
        .regex(/^[1-9]\d{0,2}$/)
        .optional(),
    }),
    headers: z.object({
      'x-organization-id': z.string().uuid(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            summary: z.string(),
            insights: z.array(z.string()),
            anomalies: z.array(z.string()),
            recommendations: z.array(z.string()),
          }),
        },
      },
      description: 'AI-generated interaction analysis',
    },
    403: {
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
      description: 'Forbidden',
    },
    500: {
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
      description: 'Internal server error',
    },
  },
});

export const HelloWorldRoute = createRoute({
  method: 'get',
  path: '/',
  request: {},
  responses: {
    200: {
      content: {
        'application/json': { schema: z.object({ text: z.string() }) },
      },
      description: 'Hello World',
    },
  },
});

export const GetInteractionsByOrgRoute = createRoute({
  method: 'get',
  path: '/api/v1/interactions/organization/:orgId',
  request: {
    params: z.object({ orgId: z.string().uuid() }),
    query: z.object({
      page: z
        .string()
        .regex(/^[1-9]\d*$/, 'page must be a positive integer')
        .optional(),
      limit: z
        .string()
        .regex(/^[1-9]\d*$/, 'limit must be a positive integer')
        .optional(),
      sourceType: z.enum(['web', 'cctv', 'social']).optional(),
      q: z.string().max(256).optional(),
    }),
    headers: z.object({
      'x-organization-id': z.string().uuid(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            interactions: z.array(
              z.object({
                id: z.string(),
                organizationId: z.string().nullable(),
                sourceType: z.string(),
                sessionId: z.string().nullable(),
                data: z.string(),
                summary: z.string().nullable(),
                timestamp: z.number(),
                createdAt: z.number(),
              })
            ),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
          }),
        },
      },
      description: 'Interactions for organization',
    },
  },
});

export const GetInteractionsSummaryRoute = createRoute({
  method: 'get',
  path: '/api/v1/interactions/organization/:orgId/summary',
  request: {
    params: z.object({ orgId: z.string().uuid() }),
    headers: z.object({
      'x-organization-id': z.string().uuid(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            web: z.number(),
            cctv: z.number(),
            social: z.number(),
            total: z.number(),
          }),
        },
      },
      description: 'Interaction counts by source type',
    },
  },
});

export const CreateInteractionRoute = createRoute({
  method: 'post',
  path: '/api/v1/interactions/create-interaction',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            organizationId: z.string().uuid(),
            sourceType: z.enum(['web', 'cctv', 'social']),
            sessionId: z.string().max(128).optional(),
            data: z.union([
              z.string().max(65536),
              z.record(z.string(), z.unknown()),
            ]),
            summary: z.string().max(4096).optional(),
            timestamp: z
              .number()
              .int()
              .min(0)
              .max(Date.now() + 86400000),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: z.object({ queued: z.boolean() }),
        },
      },
      description: 'Interaction queued for processing',
    },
    400: {
      content: {
        'application/json': { schema: z.object({ error: z.string() }) },
      },
      description: 'Bad request',
    },
  },
});
