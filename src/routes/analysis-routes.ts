import { createRoute, z } from '@hono/zod-openapi';
import { AnalysisResponseSchema, AnalysisStatsSchema } from '../types';

// --- Param Schemas ---

const SessionIdParam = z.object({
  sessionId: z.string().openapi({
    param: { name: 'sessionId', in: 'path' },
    example: 'sess_abc123',
  }),
});

// --- Response Schemas ---

const NotFoundResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.string(),
  })
  .openapi('NotFoundResponse');

const JourneyAnalysisResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        sessionId: z.string(),
        journeyAnalysis: z.any().nullable(),
      })
      .nullable(),
  })
  .openapi('JourneyAnalysisResponse');

const PageAnalysesResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        sessionId: z.string(),
        pageAnalyses: z.any().nullable(),
      })
      .nullable(),
  })
  .openapi('PageAnalysesResponse');

const ExitAnalysisResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        sessionId: z.string(),
        exitAnalysis: z.any().nullable(),
      })
      .nullable(),
  })
  .openapi('ExitAnalysisResponse');

const TriggerAnalysisResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    sessionId: z.string(),
  })
  .openapi('TriggerAnalysisResponse');

// --- Routes ---

export const GetSessionAnalysisRoute = createRoute({
  method: 'get',
  path: '/sessions/{sessionId}/analysis',
  request: {
    params: SessionIdParam,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: AnalysisResponseSchema } },
      description: 'Full analysis for the session',
    },
    404: {
      content: { 'application/json': { schema: NotFoundResponseSchema } },
      description: 'Analysis not found for this session',
    },
  },
});

export const GetJourneyAnalysisRoute = createRoute({
  method: 'get',
  path: '/sessions/{sessionId}/analysis/journey',
  request: {
    params: SessionIdParam,
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: JourneyAnalysisResponseSchema },
      },
      description: 'Journey analysis for the session',
    },
    404: {
      content: { 'application/json': { schema: NotFoundResponseSchema } },
      description: 'Analysis not found for this session',
    },
  },
});

export const GetPageAnalysesRoute = createRoute({
  method: 'get',
  path: '/sessions/{sessionId}/analysis/pages',
  request: {
    params: SessionIdParam,
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: PageAnalysesResponseSchema },
      },
      description: 'Page analyses for the session',
    },
    404: {
      content: { 'application/json': { schema: NotFoundResponseSchema } },
      description: 'Analysis not found for this session',
    },
  },
});

export const GetExitAnalysisRoute = createRoute({
  method: 'get',
  path: '/sessions/{sessionId}/analysis/exit',
  request: {
    params: SessionIdParam,
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: ExitAnalysisResponseSchema },
      },
      description: 'Exit analysis for the session',
    },
    404: {
      content: { 'application/json': { schema: NotFoundResponseSchema } },
      description: 'Analysis not found for this session',
    },
  },
});

export const GetAnalysisStatsRoute = createRoute({
  method: 'get',
  path: '/analyses/stats',
  request: {},
  responses: {
    200: {
      content: { 'application/json': { schema: AnalysisStatsSchema } },
      description: 'Aggregate analysis statistics',
    },
  },
});

export const TriggerAnalysisRoute = createRoute({
  method: 'post',
  path: '/sessions/{sessionId}/analyze',
  request: {
    params: SessionIdParam,
  },
  responses: {
    202: {
      content: {
        'application/json': { schema: TriggerAnalysisResponseSchema },
      },
      description: 'Analysis triggered successfully',
    },
  },
});
