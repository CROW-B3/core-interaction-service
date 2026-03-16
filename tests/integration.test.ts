import type { Environment } from '../src/types';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import analyze from '../src/routes/analyze';
import health from '../src/routes/health';
import interactions from '../src/routes/interactions';
import {
  createFakeJpeg,
  createMockD1,
  createMockEnv,
  createMockR2,
} from './helpers';

function createApp() {
  const app = new Hono<{ Bindings: Environment }>();
  app.route('/analyze', analyze);
  app.route('/interactions', interactions);
  app.route('/health', health);
  return app;
}

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

async function seedSession(
  r2: R2Bucket,
  storeId: string,
  sessionStart: number,
  sessionEnd: number
) {
  const fakeJpeg = createFakeJpeg();
  let count = 0;
  for (let sec = sessionStart; sec < sessionEnd; sec += 60) {
    await r2.put(`composites/${storeId}/${sec}.jpg`, fakeJpeg);
    count++;
  }
  return count;
}

// Mock Gemini API response
let geminiCallCount = 0;
function mockGeminiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (url.includes('generativelanguage.googleapis.com')) {
    geminiCallCount++;
    const mockAnalysis = {
      people: [
        {
          description: `Person ${geminiCallCount}`,
          location: 'tile 1',
          activity: 'walking',
        },
      ],
      interactions: [],
      movement_patterns: [`Movement pattern ${geminiCallCount}`],
      notable_events: [],
      summary: `Period ${geminiCallCount}: one person walking through the store.`,
    };

    return Promise.resolve(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(mockAnalysis) }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  }

  // Passthrough for non-Gemini requests
  return globalThis.__originalFetch(input, init);
}

declare global {
  // eslint-disable-next-line vars-on-top
  var __originalFetch: typeof fetch;
}

beforeEach(() => {
  geminiCallCount = 0;
  globalThis.__originalFetch = globalThis.fetch;
  globalThis.fetch = mockGeminiFetch as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = globalThis.__originalFetch;
});

describe('integration: full analysis pipeline', () => {
  it('pOST /analyze seeds interaction doc, GET /interactions retrieves it', async () => {
    const r2 = createMockR2();
    const db = createMockD1();
    const env = createMockEnv({ INGEST_FRAMES: r2, DB: db });
    const app = createApp();

    // 1. Seed composites for 1-hour session (60 frames, 1/min)
    const sessionStart = 3600;
    const sessionEnd = 7200;
    const seeded = await seedSession(r2, 'store1', sessionStart, sessionEnd);
    expect(seeded).toBe(60);

    // 2. POST /analyze
    const analyzeRes = await app.fetch(
      req('/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          store_id: 'store1',
          session_start: sessionStart,
          session_end: sessionEnd,
        }),
      }),
      env
    );

    expect(analyzeRes.status).toBe(200);
    const analyzeBody = (await analyzeRes.json()) as Record<string, any>;
    expect(analyzeBody.ok).toBe(true);
    expect(analyzeBody.interaction_id).toBeDefined();
    expect(analyzeBody.periods_analyzed).toBe(12);
    expect(analyzeBody.periods_failed).toBe(0);
    // Gemini called once per period
    expect(geminiCallCount).toBe(12);

    // 3. GET /interactions — verify doc was persisted
    const listRes = await app.fetch(
      req(`/interactions?store_id=store1&session_start=${sessionStart}`, {
        headers: { Authorization: 'Bearer test-token' },
      }),
      env
    );

    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as Record<string, any>;
    expect(listBody.ok).toBe(true);
    expect(listBody.interactions.length).toBe(1);

    const interaction = listBody.interactions[0];
    expect(interaction.store_id).toBe('store1');
    expect(interaction.session_start).toBe(sessionStart);
    expect(interaction.session_end).toBe(sessionEnd);
    expect(interaction.summary.periods_analyzed).toBe(12);
  });

  it('context chains between sequential periods', async () => {
    const r2 = createMockR2();
    const db = createMockD1();
    const env = createMockEnv({ INGEST_FRAMES: r2, DB: db });
    const app = createApp();

    // Seed 15 min of frames (3 periods)
    await seedSession(r2, 'store1', 3600, 4500);

    // Capture Gemini request bodies to verify context chaining
    const geminiRequests: any[] = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('generativelanguage.googleapis.com') && init?.body) {
        geminiRequests.push(JSON.parse(init.body as string));
      }
      return mockGeminiFetch(input, init);
    }) as typeof fetch;

    await app.fetch(
      req('/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          store_id: 'store1',
          session_start: 3600,
          session_end: 4500,
        }),
      }),
      env
    );

    expect(geminiRequests.length).toBe(3);

    // First period: no prior context
    const firstPrompt = geminiRequests[0].contents[0].parts[0].text;
    expect(firstPrompt).not.toContain('previous time period');

    // Second period: should include previous summary as context
    const secondPrompt = geminiRequests[1].contents[0].parts[0].text;
    expect(secondPrompt).toContain('previous time period');
  });

  it('pOST /analyze returns 401 without auth', async () => {
    const env = createMockEnv();
    const app = createApp();

    const res = await app.fetch(
      req('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: 'store1',
          session_start: 3600,
          session_end: 7200,
        }),
      }),
      env
    );

    expect(res.status).toBe(401);
  });

  it('pOST /analyze returns 400 for invalid body', async () => {
    const env = createMockEnv();
    const app = createApp();

    const res = await app.fetch(
      req('/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ store_id: '' }),
      }),
      env
    );

    expect(res.status).toBe(400);
  });

  it('handles session with no frames gracefully', async () => {
    const env = createMockEnv();
    const app = createApp();

    const res = await app.fetch(
      req('/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          store_id: 'empty-store',
          session_start: 3600,
          session_end: 7200,
        }),
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.periods_analyzed).toBe(0);
    expect(body.periods_failed).toBe(0);
  });

  it('partial Gemini failure still produces interaction doc', async () => {
    const r2 = createMockR2();
    const db = createMockD1();
    const env = createMockEnv({ INGEST_FRAMES: r2, DB: db });
    const app = createApp();

    await seedSession(r2, 'store1', 3600, 4500);

    // Fail on 2nd Gemini call
    let callNum = 0;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('generativelanguage.googleapis.com')) {
        callNum++;
        if (callNum === 2) {
          return Promise.resolve(
            new Response('{"error":{"message":"rate limit"}}', { status: 429 })
          );
        }
      }
      return mockGeminiFetch(input, init);
    }) as typeof fetch;

    const res = await app.fetch(
      req('/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          store_id: 'store1',
          session_start: 3600,
          session_end: 4500,
        }),
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.periods_analyzed).toBe(2);
    expect(body.periods_failed).toBe(1);

    // Interaction doc still persisted
    const listRes = await app.fetch(
      req('/interactions?store_id=store1&session_start=3600', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      env
    );
    const listBody = (await listRes.json()) as Record<string, any>;
    expect(listBody.interactions.length).toBe(1);
    expect(listBody.interactions[0].summary.periods_failed).toBe(1);
  });

  it('gET /health works', async () => {
    const env = createMockEnv();
    const app = createApp();

    const res = await app.fetch(req('/health'), env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('ok');
  });
});
