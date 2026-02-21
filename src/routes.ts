import { createRoute, z } from '@hono/zod-openapi';

export const AnalyzeInteractionsRoute = createRoute({
  method: 'post',
  path: '/api/v1/interactions/organization/:orgId/analyze',
  request: {
    params: z.object({ orgId: z.string() }),
    query: z.object({
      period: z.string().optional(),
      limit: z.string().optional(),
    }),
    headers: z.object({
      'x-organization-id': z.string().optional(),
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
    params: z.object({ orgId: z.string() }),
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
      sourceType: z.string().optional(),
      q: z.string().optional(),
    }),
    headers: z.object({
      'x-organization-id': z.string().optional(),
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
                organizationId: z.string(),
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
    params: z.object({ orgId: z.string() }),
    headers: z.object({
      'x-organization-id': z.string().optional(),
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
