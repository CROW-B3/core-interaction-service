import type { Environment } from '../types';
import { Hono } from 'hono';
import { z } from 'zod';
import { createEmbeddingClient } from '../lib/embeddings';

const SearchBodySchema = z.object({
  store_id: z.string().min(1),
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(20).default(5),
});

const app = new Hono<{ Bindings: Environment }>();

app.post('/', async c => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${c.env.AUTH_TOKEN}`) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const parsed = SearchBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.message }, 400);
  }

  const { store_id, query, top_k } = parsed.data;

  if (!c.env.VECTORIZE || !c.env.AI) {
    return c.json({ ok: false, error: 'Vectorize/AI not configured' }, 503);
  }

  try {
    const embeddings = createEmbeddingClient(c.env);
    const matches = await embeddings.query(store_id, query, top_k);

    return c.json({
      ok: true,
      results: matches.map(m => ({
        interaction_id: m.metadata.interaction_id,
        session_start: m.metadata.session_start,
        score: m.score,
        summary: m.metadata.summary_text,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Search failed: ${message}`);
    return c.json({ ok: false, error: message }, 500);
  }
});

export default app;
