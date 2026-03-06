import type { Environment } from '../src/types';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import health from '../src/routes/health';
import interactions from '../src/routes/interactions';
import { createMockD1, createMockEnv } from './helpers';

function createTestApp() {
  const app = new Hono<{ Bindings: Environment }>();
  app.route('/health', health);
  app.route('/interactions', interactions);
  return app;
}

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

describe('gET /health', () => {
  it('returns ok status', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(req('/health'), env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      status: 'ok',
      service: 'crow-core-interaction-service',
    });
  });
});

describe('gET /interactions', () => {
  it('returns 401 without auth', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(req('/interactions?store_id=store1'), env);
    expect(res.status).toBe(401);
  });

  it('returns empty list for new store', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/interactions?store_id=store1', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      env
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.interactions).toEqual([]);
  });

  it('returns interactions for store', async () => {
    const db = createMockD1();
    const env = createMockEnv({ DB: db });
    const app = createTestApp();

    // Insert a test interaction
    await db.batch([
      db
        .prepare(
          'INSERT INTO interactions (id, store_id, session_start, session_end, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(
          'int-1',
          'store1',
          3600,
          7200,
          JSON.stringify({ text: 'Test summary' }),
          '2026-03-06T00:00:00Z'
        ),
    ]);

    const res = await app.fetch(
      req('/interactions?store_id=store1', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      env
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.interactions.length).toBe(1);
    expect(body.interactions[0].id).toBe('int-1');
  });

  it('filters by session_start', async () => {
    const db = createMockD1();
    const env = createMockEnv({ DB: db });
    const app = createTestApp();

    await db.batch([
      db
        .prepare(
          'INSERT INTO interactions (id, store_id, session_start, session_end, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind('int-1', 'store1', 3600, 7200, '{}', '2026-03-06T00:00:00Z'),
      db
        .prepare(
          'INSERT INTO interactions (id, store_id, session_start, session_end, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind('int-2', 'store1', 7200, 10800, '{}', '2026-03-06T01:00:00Z'),
    ]);

    const res = await app.fetch(
      req('/interactions?store_id=store1&session_start=3600', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      env
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.interactions.length).toBe(1);
    expect(body.interactions[0].id).toBe('int-1');
  });
});
