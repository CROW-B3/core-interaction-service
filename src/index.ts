import type { Environment, InteractionMessage } from './types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { logger } from 'hono/logger';
import { poweredBy } from 'hono/powered-by';
import * as schema from './db/schema';
import {
  GetInteractionsByOrgRoute,
  GetInteractionsSummaryRoute,
  HelloWorldRoute,
} from './routes';

const app = new OpenAPIHono<{ Bindings: Environment }>();
app.use(poweredBy());
app.use(logger());

app.openapi(HelloWorldRoute, c =>
  c.json({ text: 'Hello from Interaction Service!' })
);

app.openapi(GetInteractionsByOrgRoute, async c => {
  const db = drizzle(c.env.DB, { schema });
  const { orgId } = c.req.valid('param');
  const { page: pageStr, limit: limitStr, sourceType } = c.req.valid('query');

  const page = Number.parseInt(pageStr || '1', 10);
  const limit = Number.parseInt(limitStr || '20', 10);
  const offset = (page - 1) * limit;

  const interactions = await db
    .select()
    .from(schema.interaction)
    .where(eq(schema.interaction.organizationId, orgId))
    .limit(limit)
    .offset(offset)
    .orderBy(schema.interaction.timestamp);

  const allForCount = await db
    .select()
    .from(schema.interaction)
    .where(eq(schema.interaction.organizationId, orgId));

  const filtered = sourceType
    ? interactions.filter(i => i.sourceType === sourceType)
    : interactions;

  return c.json({
    interactions: filtered.map(i => ({
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
  const { orgId } = c.req.valid('param');

  const all = await db
    .select()
    .from(schema.interaction)
    .where(eq(schema.interaction.organizationId, orgId));

  const web = all.filter(i => i.sourceType === 'web').length;
  const cctv = all.filter(i => i.sourceType === 'cctv').length;
  const social = all.filter(i => i.sourceType === 'social').length;

  return c.json({ web, cctv, social, total: all.length });
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
