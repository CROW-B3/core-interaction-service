import type { Environment } from '../types';
import { Hono } from 'hono';
import { z } from 'zod';
import { persistCalibration, runCalibration } from '../lib/calibrator';
import { createGeminiClient } from '../lib/gemini';

const CalibrateBodySchema = z.object({
  store_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const app = new Hono<{ Bindings: Environment }>();

app.post('/', async c => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${c.env.AUTH_TOKEN}`) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const parsed = CalibrateBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.message }, 400);
  }

  const { store_id, date } = parsed.data;

  try {
    const gemini = createGeminiClient(c.env.GEMINI_API_KEY);
    const result = await runCalibration(c.env.DB, gemini, store_id, date);
    await persistCalibration(c.env.DB, result);

    return c.json({
      ok: true,
      calibration_id: result.id,
      confidence: result.reasoning.confidence,
      applied: result.applied,
      adjustments_count: result.adjustments.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Calibration failed for ${store_id} on ${date}: ${message}`);
    return c.json({ ok: false, error: message }, 500);
  }
});

export default app;
