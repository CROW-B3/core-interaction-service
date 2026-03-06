import type { Environment } from '../types';
import { Hono } from 'hono';
import { listCalibrations } from '../lib/calibrator';

const app = new Hono<{ Bindings: Environment }>();

app.get('/', async c => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${c.env.AUTH_TOKEN}`) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const store_id = c.req.query('store_id');
  if (!store_id) {
    return c.json({ ok: false, error: 'store_id is required' }, 400);
  }

  const calibrations = await listCalibrations(c.env.DB, store_id);
  return c.json({ ok: true, calibrations });
});

export default app;
