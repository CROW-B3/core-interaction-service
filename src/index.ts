import type {
  CctvBatchQueueMessage,
  Environment,
  InteractionMessage,
  SessionExpiryMessage,
} from './types';
import type { SessionAnalysisPayload } from './web-session/agents/types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { DurableObject } from 'cloudflare:workers';
import { and, count, eq, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { logger } from 'hono/logger';
import { processCctvBatchMessage } from './cctv-consumer';
import * as schema from './db/schema';
import { createJWTMiddleware } from './middleware/jwt';
import {
  AnalyzeInteractionsRoute,
  CreateInteractionRoute,
  GetInteractionsByOrgRoute,
  GetInteractionsSummaryRoute,
  HelloWorldRoute,
  SearchInteractionsRoute,
} from './routes';
import {
  searchInteractions,
  vectorizeInteraction,
} from './services/interaction-vectorize';
import { processWebSessionExpiry } from './web-session-consumer';
import { runSessionAnalysis } from './web-session/pipeline';

export class InteractionAnalyzerContainer extends DurableObject<Environment> {
  async fetch(request: Request): Promise<Response> {
    return (this as any).ctx.container.fetch(request);
  }
}

function escapeLikeWildcards(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

function buildBaseConditions(
  orgId: string,
  sourceType: string | undefined,
  q: string | undefined,
  productId?: string
) {
  const orgCondition = eq(schema.interaction.organizationId, orgId);
  const sourceCondition = sourceType
    ? eq(schema.interaction.sourceType, sourceType)
    : undefined;
  const textCondition = q
    ? or(
        like(schema.interaction.data, `%${escapeLikeWildcards(q)}%`),
        like(schema.interaction.summary, `%${escapeLikeWildcards(q)}%`)
      )
    : undefined;
  const productCondition = productId
    ? like(schema.interaction.productIds, `%${escapeLikeWildcards(productId)}%`)
    : undefined;

  return and(orgCondition, sourceCondition, textCondition, productCondition);
}

const app = new OpenAPIHono<{ Bindings: Environment }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'Bad Request', message: 'Invalid request parameters' },
        400
      );
    }
  },
});
app.use(logger());

app.use('/api/v1/*', async (c, next) => {
  if (!c.env.INTERNAL_GATEWAY_KEY) {
    return c.json({ error: 'Service misconfigured' }, 503);
  }
  const internalKey = c.req.header('X-Internal-Key');
  if (!internalKey || internalKey !== c.env.INTERNAL_GATEWAY_KEY) {
    return c.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      401
    );
  }
  return next();
});

app.use('/api/v1/*', async (c, next) => {
  const internalKey = c.req.header('X-Internal-Key');
  if (internalKey && c.env.INTERNAL_GATEWAY_KEY && internalKey === c.env.INTERNAL_GATEWAY_KEY) {
    return next();
  }
  const jwtMiddleware = createJWTMiddleware(c.env);
  return jwtMiddleware(c, next);
});

app.onError((err, c) => {
  const errorName = err instanceof Error ? err.name : '';
  const errorMessage = err instanceof Error ? err.message : '';
  if (
    errorName === 'ZodError' ||
    errorName === 'SyntaxError' ||
    errorMessage.includes('Malformed JSON')
  ) {
    return c.json(
      { error: 'Bad Request', message: 'Invalid request parameters' },
      400
    );
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.openapi(HelloWorldRoute, c =>
  c.json({ text: 'Hello from Interaction Service!' })
);

app.get('/health', c => c.json({ status: 'ok' }));

app.post('/analyze/session', async c => {
  try {
    const payload = await c.req.json<SessionAnalysisPayload>();
    if (!payload.sessionId || !payload.projectId) {
      return c.json({ error: 'sessionId and projectId are required' }, 400);
    }
    c.executionCtx.waitUntil(runSessionAnalysis(payload, c.env));
    return c.json({ accepted: true }, 202);
  } catch (err) {
    console.error('Failed to accept session analysis:', err);
    return c.json({ error: 'Failed to accept session analysis' }, 500);
  }
});

app.post('/internal/web-sessions/process', async c => {
  try {
    const body = await c.req.json<{
      sessionId: string;
      organizationId?: string | null;
    }>();
    if (!body.sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }
    await processWebSessionExpiry(body.sessionId, c.env, body.organizationId);
    return c.json({ processed: true });
  } catch (err) {
    console.error('Failed to process web session:', err);
    return c.json({ error: 'Failed to process web session' }, 500);
  }
});

app.openapi(CreateInteractionRoute, async c => {
  const db = drizzle(c.env.DB, { schema });
  const body = c.req.valid('json');
  const callerOrgId = c.req.header('X-Organization-Id');
  if (!callerOrgId || callerOrgId !== body.organizationId) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Cannot create interaction for another organization',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    ) as never;
  }
  const dataAsString =
    typeof body.data === 'string' ? body.data : JSON.stringify(body.data);
  const interactionId = crypto.randomUUID();
  await db.insert(schema.interaction).values({
    id: interactionId,
    organizationId: callerOrgId,
    sourceType: body.sourceType,
    sessionId: body.sessionId ?? null,
    data: dataAsString,
    summary: body.summary ?? null,
    confidence: null,
    tags: null,
    productIds: null,
    timestamp: new Date(body.timestamp),
    createdAt: new Date(),
  });
  if (body.summary) {
    c.executionCtx.waitUntil(
      vectorizeInteraction(c.env, {
        id: interactionId,
        organizationId: callerOrgId,
        sourceType: body.sourceType,
        summary: body.summary ?? null,
        tags: null,
      }).catch(err => console.error('Vectorize failed:', err))
    );
  }
  return c.json({ queued: true }, 202);
});

app.openapi(GetInteractionsByOrgRoute, async c => {
  const db = drizzle(c.env.DB, { schema });
  const { orgId: orgIdParam } = c.req.valid('param');
  const callerOrgId = c.req.valid('header')['x-organization-id'];

  if (!callerOrgId || callerOrgId !== orgIdParam) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Access denied to this organization',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    ) as never;
  }

  const orgId = orgIdParam;
  const {
    page: pageStr,
    limit: limitStr,
    sourceType,
    productId,
    q,
  } = c.req.valid('query');

  const page = Math.max(1, Number.parseInt(pageStr || '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(limitStr || '20', 10) || 20)
  );
  const offset = (page - 1) * limit;

  const baseConditions = buildBaseConditions(orgId, sourceType, q, productId);

  const [interactions, countResult] = await Promise.all([
    db
      .select()
      .from(schema.interaction)
      .where(baseConditions)
      .limit(limit)
      .offset(offset)
      .orderBy(schema.interaction.timestamp),
    db
      .select({ count: count() })
      .from(schema.interaction)
      .where(baseConditions),
  ]);

  return c.json({
    interactions: interactions.map(i => ({
      ...i,
      timestamp:
        i.timestamp instanceof Date
          ? i.timestamp.getTime()
          : Number(i.timestamp),
      createdAt:
        i.createdAt instanceof Date
          ? i.createdAt.getTime()
          : Number(i.createdAt),
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  });
});

app.openapi(GetInteractionsSummaryRoute, async c => {
  const db = drizzle(c.env.DB, { schema });
  const { orgId: orgIdParam } = c.req.valid('param');
  const callerOrgId2 = c.req.valid('header')['x-organization-id'];

  if (!callerOrgId2 || callerOrgId2 !== orgIdParam) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Access denied to this organization',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    ) as never;
  }

  const orgId = orgIdParam;

  const counts = await db
    .select({ sourceType: schema.interaction.sourceType, count: count() })
    .from(schema.interaction)
    .where(eq(schema.interaction.organizationId, orgId))
    .groupBy(schema.interaction.sourceType);

  const tally = { web: 0, cctv: 0, social: 0 };
  let total = 0;
  for (const row of counts) {
    const n = row.count ?? 0;
    total += n;
    if (row.sourceType === 'web') tally.web = n;
    else if (row.sourceType === 'cctv') tally.cctv = n;
    else if (row.sourceType === 'social') tally.social = n;
  }

  return c.json({ ...tally, total });
});

app.openapi(SearchInteractionsRoute, async c => {
  const { orgId: orgIdParam } = c.req.valid('param');
  const callerOrgId = c.req.valid('header')['x-organization-id'];

  if (!callerOrgId || callerOrgId !== orgIdParam) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Access denied to this organization',
      } as const,
      403 as const
    );
  }

  const { q, limit: limitStr } = c.req.valid('query');
  const topK = Math.min(
    50,
    Math.max(1, Number.parseInt(limitStr || '10', 10) || 10)
  );

  const matches = await searchInteractions(c.env, q, orgIdParam, topK);

  return c.json(
    {
      results: matches.map(m => ({
        id: m.id,
        score: m.score,
        sourceType: m.metadata.sourceType,
        summary: m.metadata.summary,
      })),
      query: q,
      total: matches.length,
    },
    200 as const
  );
});

app.openapi(AnalyzeInteractionsRoute, async c => {
  const { orgId } = c.req.valid('param');
  const { period: periodParam, limit: limitParam } = c.req.valid('query');
  const headerOrgId = c.req.valid('header')['x-organization-id'];

  if (!headerOrgId || headerOrgId !== orgId) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Access denied to this organization',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    ) as never;
  }

  const db = drizzle(c.env.DB, { schema });
  const fetchLimit = Math.min(
    200,
    Math.max(1, Number.parseInt(limitParam || '50', 10) || 50)
  );
  const VALID_PERIODS = new Set(['daily', 'weekly', 'monthly']);
  const period = VALID_PERIODS.has(periodParam ?? '') ? periodParam! : 'weekly';

  const interactions = await db
    .select()
    .from(schema.interaction)
    .where(eq(schema.interaction.organizationId, orgId))
    .limit(fetchLimit)
    .orderBy(schema.interaction.timestamp);

  const interactionPayload = interactions.map(i => ({
    id: i.id,
    sourceType: i.sourceType,
    sessionId: i.sessionId,
    data: i.data,
    summary: i.summary,
    timestamp:
      i.timestamp instanceof Date ? i.timestamp.getTime() : Number(i.timestamp),
  }));

  const stub = c.env.INTERACTION_ANALYZER.get(
    c.env.INTERACTION_ANALYZER.idFromName(orgId)
  );

  let containerResponse: Response;
  try {
    containerResponse = await stub.fetch('http://internal/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: orgId,
        interactions: interactionPayload,
        period,
      }),
    });
  } catch (err) {
    console.error('Container fetch failed:', err);
    return c.json(
      {
        error: 'Analysis container unavailable',
        summary: '',
        tags: [],
        confidence: 0,
        productIds: [],
        sentiment: 'neutral',
      } as any,
      500
    );
  }

  if (!containerResponse.ok) {
    const errText = await containerResponse.text();
    console.error(
      'Container returned non-OK status:',
      containerResponse.status,
      errText
    );
    return c.json(
      {
        error: 'Analysis failed. Please try again later.',
        summary: '',
        tags: [],
        confidence: 0,
        productIds: [],
        sentiment: 'neutral',
      } as any,
      500
    );
  }

  const result = await containerResponse.json<{
    summary: string;
    tags: string[];
    confidence: number;
    productIds: string[];
    sentiment: string;
  }>();

  return c.json(result, 200);
});

app.doc('/api/v1/docs', {
  openapi: '3.0.0',
  info: { version: '1.0.0', title: 'CROW Interaction Service API' },
});

function isCctvBatchMessage(body: unknown): body is CctvBatchQueueMessage {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as Record<string, unknown>;
  return Array.isArray(candidate.frameAnalyses);
}

function isSessionExpiryMessage(body: unknown): body is SessionExpiryMessage {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.expiredAt === 'string' &&
    !('sourceType' in candidate)
  );
}

function isValidInteractionMessage(body: unknown): body is InteractionMessage {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.sourceType === 'string' &&
    typeof candidate.data === 'string' &&
    typeof candidate.timestamp === 'number' &&
    !Number.isNaN(candidate.timestamp)
  );
}

async function handleInteractionQueueMessage(
  msg: Message<InteractionMessage>,
  env: Environment
): Promise<void> {
  const body = msg.body;
  if (!isValidInteractionMessage(body)) {
    console.error(
      'Skipping malformed interaction queue message:',
      JSON.stringify(body)
    );
    return;
  }
  const db = drizzle(env.DB, { schema });
  const interactionId = crypto.randomUUID();
  await db.insert(schema.interaction).values({
    id: interactionId,
    organizationId: body.organizationId ?? null,
    sourceType: body.sourceType,
    sessionId: body.sessionId ?? null,
    data: body.data,
    summary: body.summary ?? null,
    confidence: null,
    tags: null,
    productIds: null,
    timestamp: new Date(body.timestamp),
    createdAt: new Date(),
  });
  if (body.summary && body.organizationId) {
    await vectorizeInteraction(env, {
      id: interactionId,
      organizationId: body.organizationId,
      sourceType: body.sourceType,
      summary: body.summary ?? null,
      tags: null,
    }).catch(err => console.error('Vectorize failed:', err));
  }
}

async function handleSessionExpiryMessage(
  msg: Message<SessionExpiryMessage>,
  env: Environment
): Promise<void> {
  const body = msg.body;
  console.warn(
    `Processing session expiry for session: ${body.sessionId}, expired at: ${body.expiredAt}`
  );
  const db = drizzle(env.DB, { schema });
  await db.insert(schema.interaction).values({
    id: crypto.randomUUID(),
    organizationId: null,
    sourceType: 'web',
    sessionId: body.sessionId,
    data: JSON.stringify({
      type: 'session_expired',
      sessionId: body.sessionId,
      expiredAt: body.expiredAt,
    }),
    summary: null,
    confidence: null,
    tags: null,
    productIds: null,
    timestamp: new Date(body.expiredAt),
    createdAt: new Date(),
  });
}

async function handleCctvBatchQueueMessage(
  msg: Message<CctvBatchQueueMessage>,
  env: Environment
): Promise<void> {
  await processCctvBatchMessage(msg.body, env);
}

export default {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<
      InteractionMessage | CctvBatchQueueMessage | SessionExpiryMessage
    >,
    env: Environment
  ): Promise<void> {
    for (const msg of batch.messages) {
      try {
        if (isCctvBatchMessage(msg.body)) {
          await handleCctvBatchQueueMessage(
            msg as Message<CctvBatchQueueMessage>,
            env
          );
        } else if (isSessionExpiryMessage(msg.body)) {
          await handleSessionExpiryMessage(
            msg as Message<SessionExpiryMessage>,
            env
          );
        } else {
          await handleInteractionQueueMessage(
            msg as Message<InteractionMessage>,
            env
          );
        }
        msg.ack();
      } catch (err) {
        console.error('Failed to process queue message:', err);
        msg.retry();
      }
    }
  },
};
