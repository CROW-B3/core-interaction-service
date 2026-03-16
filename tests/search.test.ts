import type { Environment } from '../src/types';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import search from '../src/routes/search';
import { createMockEnv } from './helpers';

function createTestApp() {
  const app = new Hono<{ Bindings: Environment }>();
  app.route('/search', search);
  return app;
}

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

// Mock the Workers AI and Vectorize for search route tests
function createEnvWithSearchResults(
  results: Array<{
    id: string;
    score: number;
    metadata: Record<string, unknown>;
  }>
) {
  const env = createMockEnv();

  // Override AI to return embeddings
  env.AI = {
    run: async () => ({ data: [Array.from({ length: 768 }).fill(0.1)] }),
  } as unknown as Ai;

  // Override Vectorize to return search results
  env.VECTORIZE = {
    query: async () => ({
      matches: results.map(r => ({
        id: r.id,
        score: r.score,
        metadata: r.metadata,
      })),
      count: results.length,
    }),
    upsert: async () => ({ mutationId: 'mock' }),
  } as unknown as VectorizeIndex;

  return env;
}

describe('pOST /search', () => {
  it('returns 401 without auth', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: 'store1', query: 'person in red' }),
      }),
      env
    );

    expect(res.status).toBe(401);
  });

  it('returns 400 for missing query', async () => {
    const env = createMockEnv();
    const app = createTestApp();

    const res = await app.fetch(
      req('/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ store_id: 'store1' }),
      }),
      env
    );

    expect(res.status).toBe(400);
  });

  it('returns matching interactions', async () => {
    const env = createEnvWithSearchResults([
      {
        id: 'int-1',
        score: 0.92,
        metadata: {
          store_id: 'store1',
          session_start: 3600,
          interaction_id: 'int-1',
          summary_text: 'Person in red jacket browsing sneakers.',
        },
      },
      {
        id: 'int-2',
        score: 0.78,
        metadata: {
          store_id: 'store1',
          session_start: 7200,
          interaction_id: 'int-2',
          summary_text: 'Person in red outfit near checkout.',
        },
      },
    ]);
    const app = createTestApp();

    const res = await app.fetch(
      req('/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          store_id: 'store1',
          query: 'person in red jacket',
          top_k: 5,
        }),
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.results.length).toBe(2);
    expect(body.results[0].interaction_id).toBe('int-1');
    expect(body.results[0].score).toBe(0.92);
    expect(body.results[0].summary).toContain('red jacket');
  });

  it('returns empty results for no matches', async () => {
    const env = createEnvWithSearchResults([]);
    const app = createTestApp();

    const res = await app.fetch(
      req('/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          store_id: 'store1',
          query: 'something never seen',
        }),
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.results.length).toBe(0);
  });
});
