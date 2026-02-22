import type { Environment, InteractionMessage } from './types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { DurableObject } from 'cloudflare:workers';
import { and, eq, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { logger } from 'hono/logger';
import { poweredBy } from 'hono/powered-by';
import * as schema from './db/schema';
import { createJWTMiddleware } from './middleware/jwt';
import {
  AnalyzeInteractionsRoute,
  CreateInteractionRoute,
  GetInteractionsByOrgRoute,
  GetInteractionsSummaryRoute,
  HelloWorldRoute,
} from './routes';

export class InteractionAnalyzerContainer extends DurableObject<Environment> {
  async fetch(request: Request): Promise<Response> {
    return (this as any).ctx.container.fetch(request);
  }
}

function buildBaseConditions(
  orgId: string,
  sourceType: string | undefined,
  q: string | undefined
) {
  const orgCondition = eq(schema.interaction.organizationId, orgId);
  const sourceCondition = sourceType
    ? eq(schema.interaction.sourceType, sourceType)
    : undefined;
  const textCondition = q
    ? or(
        like(schema.interaction.data, `%${q}%`),
        like(schema.interaction.summary, `%${q}%`)
      )
    : undefined;

  return and(orgCondition, sourceCondition, textCondition);
}

const app = new OpenAPIHono<{ Bindings: Environment }>();
app.use(poweredBy());
app.use(logger());

app.openapi(HelloWorldRoute, c =>
  c.json({ text: 'Hello from Interaction Service!' })
);

app.get('/health', c =>
  c.json({ status: 'ok', service: 'core-interaction-service' })
);

// POST /create-interaction — enqueue an interaction for async processing
app.openapi(CreateInteractionRoute, async c => {
  const body = c.req.valid('json');
  await c.env.INTERACTION_QUEUE.send(body);
  return c.json({ queued: true }, 202);
});

app.use('/api/v1/interactions/*', async (c, next) =>
  createJWTMiddleware(c.env)(c, next)
);

app.openapi(GetInteractionsByOrgRoute, async c => {
  const db = drizzle(c.env.DB, { schema });
  const { orgId: orgIdParam } = c.req.valid('param');
  const orgId = c.req.header('X-Organization-Id') ?? orgIdParam;
  const {
    page: pageStr,
    limit: limitStr,
    sourceType,
    q,
  } = c.req.valid('query');

  const page = Number.parseInt(pageStr || '1', 10);
  const limit = Number.parseInt(limitStr || '20', 10);
  const offset = (page - 1) * limit;

  const baseConditions = buildBaseConditions(orgId, sourceType, q);

  const interactions = await db
    .select()
    .from(schema.interaction)
    .where(baseConditions)
    .limit(limit)
    .offset(offset)
    .orderBy(schema.interaction.timestamp);

  const allForCount = await db
    .select()
    .from(schema.interaction)
    .where(baseConditions);

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
    total: allForCount.length,
    page,
    limit,
  });
});

app.openapi(GetInteractionsSummaryRoute, async c => {
  const db = drizzle(c.env.DB, { schema });
  const { orgId: orgIdParam } = c.req.valid('param');
  const orgId = c.req.header('X-Organization-Id') ?? orgIdParam;

  const all = await db
    .select()
    .from(schema.interaction)
    .where(eq(schema.interaction.organizationId, orgId));

  const web = all.filter(i => i.sourceType === 'web').length;
  const cctv = all.filter(i => i.sourceType === 'cctv').length;
  const social = all.filter(i => i.sourceType === 'social').length;

  return c.json({ web, cctv, social, total: all.length });
});

app.openapi(AnalyzeInteractionsRoute, async c => {
  const { orgId } = c.req.valid('param');
  const { period: periodParam, limit: limitParam } = c.req.valid('query');
  const headerOrgId = c.req.valid('header')['x-organization-id'];

  if (headerOrgId && headerOrgId !== orgId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });
  const fetchLimit = Number.parseInt(limitParam || '50', 10);
  const period = periodParam || 'weekly';

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
        insights: [],
        anomalies: [],
        recommendations: [],
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
        error: `Analysis container error: ${containerResponse.status}`,
        summary: '',
        insights: [],
        anomalies: [],
        recommendations: [],
      } as any,
      500
    );
  }

  const result = await containerResponse.json<{
    summary: string;
    insights: string[];
    anomalies: string[];
    recommendations: string[];
  }>();

  return c.json(result, 200);
});

app.doc('/docs', {
  openapi: '3.0.0',
  info: { version: '1.0.0', title: 'CROW Interaction Service API' },
});

export default {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<InteractionMessage>,
    env: Environment
  ): Promise<void> {
    const db = drizzle(env.DB, { schema });
    const now = new Date();

    for (const msg of batch.messages) {
      const body = msg.body;
      try {
        await db.insert(schema.interaction).values({
          id: crypto.randomUUID(),
          organizationId: body.organizationId,
          sourceType: body.sourceType,
          sessionId: body.sessionId ?? null,
          data: body.data,
          summary: body.summary ?? null,
          timestamp: new Date(body.timestamp),
          createdAt: now,
        });
        msg.ack();
      } catch (err) {
        console.error('Failed to insert interaction:', err);
        msg.retry();
      }
    }
  },
};
