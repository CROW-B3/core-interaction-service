import { createRoute, z } from '@hono/zod-openapi';

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
