import type { Environment } from '../types';
import { Hono } from 'hono';

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

  const session_start = c.req.query('session_start');

  let result;
  if (session_start) {
    result = await c.env.DB.prepare(
      `SELECT id, store_id, session_start, session_end, summary, created_at
       FROM interactions
       WHERE store_id = ? AND session_start = ?
       ORDER BY session_start DESC
       LIMIT 100`
    )
      .bind(store_id, Number.parseInt(session_start, 10))
      .all();
  } else {
    result = await c.env.DB.prepare(
      `SELECT id, store_id, session_start, session_end, summary, created_at
       FROM interactions
       WHERE store_id = ?
       ORDER BY session_start DESC
       LIMIT 100`
    )
      .bind(store_id)
      .all();
  }

  const interactions = (result.results ?? []).map(row => ({
    id: row.id as string,
    store_id: row.store_id as string,
    session_start: row.session_start as number,
    session_end: row.session_end as number,
    summary: JSON.parse(row.summary as string),
    created_at: row.created_at as string,
  }));

  return c.json({ ok: true, interactions });
});

export default app;
