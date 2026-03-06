import type { Environment } from '../src/types';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import calibrate from '../src/routes/calibrate';
import calibrations from '../src/routes/calibrations';
import registry from '../src/routes/registry';
import { createMockEnv } from './helpers';

function createTestApp() {
  const app = new Hono<{ Bindings: Environment }>();
  app.route('/calibrate', calibrate);
  app.route('/calibrations', calibrations);
  app.route('/registry', registry);
  return app;
}

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

describe('pOST /calibrate', () => {
  it('returns 401 without auth', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: 'store1', date: '2026-03-05' }),
      }),
      env
    );

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid date format', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/calibrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ store_id: 'store1', date: 'not-a-date' }),
      }),
      env
    );

    expect(res.status).toBe(400);
  });

  it('returns 500 when no sessions exist', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/calibrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ store_id: 'store1', date: '2026-03-05' }),
      }),
      env
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error).toContain('No sessions found');
  });
});

describe('gET /calibrations', () => {
  it('returns 401 without auth', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(req('/calibrations?store_id=store1'), env);
    expect(res.status).toBe(401);
  });

  it('returns empty list for new store', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/calibrations?store_id=store1', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.calibrations).toEqual([]);
  });
});

describe('gET /registry', () => {
  it('returns 401 without auth', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(req('/registry?store_id=store1'), env);
    expect(res.status).toBe(401);
  });

  it('returns empty camera list for new store', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/registry?store_id=store1', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.cameras).toEqual([]);
  });

  it('returns 400 without store_id', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/registry', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      env
    );

    expect(res.status).toBe(400);
  });
});
