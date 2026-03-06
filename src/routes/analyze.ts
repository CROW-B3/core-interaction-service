import type { Environment } from '../types';
import { Hono } from 'hono';
import {
  analyzeSession,
  embedInteraction,
  persistAnalysis,
} from '../lib/analyzer';
import { createEmbeddingClient } from '../lib/embeddings';
import { createGeminiClient } from '../lib/gemini';
import { SessionJobSchema } from '../types';

const app = new Hono<{ Bindings: Environment }>();

app.post('/', async c => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${c.env.AUTH_TOKEN}`) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const parsed = SessionJobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.message }, 400);
  }
  const job = parsed.data;

  try {
    const gemini = createGeminiClient(c.env.GEMINI_API_KEY);

    // Create embeddings client if Vectorize + AI are available
    const embeddings =
      c.env.VECTORIZE && c.env.AI ? createEmbeddingClient(c.env) : null;

    const result = await analyzeSession(c.env, gemini, job, embeddings);
    await persistAnalysis(c.env.DB, result);

    // Embed into Vectorize (best-effort, don't block response)
    if (embeddings) {
      try {
        const summaryJson = JSON.stringify({
          text: result.summary,
          periods_analyzed: result.periods.filter(p => p.analysis).length,
        });
        await embedInteraction(embeddings, result, summaryJson);
      } catch (err) {
        console.error(
          `Embedding failed for ${result.interaction_id}: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    const periodsAnalyzed = result.periods.filter(
      p => p.analysis !== null
    ).length;
    const periodsFailed = result.periods.filter(
      p => p.analysis === null
    ).length;

    return c.json({
      ok: true,
      interaction_id: result.interaction_id,
      periods_analyzed: periodsAnalyzed,
      periods_failed: periodsFailed,
      referenced_interactions: result.referenced_interactions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `Analysis failed for session ${job.session_start}: ${message}`
    );
    return c.json({ ok: false, error: message }, 500);
  }
});

export default app;
