import { describe, expect, it } from 'vitest';
import { analyzeSession, persistAnalysis } from '../src/lib/analyzer';
import {
  createFailingGemini,
  createMockD1,
  createMockEnv,
  createMockGemini,
} from './helpers';

// Helper to seed R2 with composite frames
async function seedFrames(
  r2: R2Bucket,
  storeId: string,
  start: number,
  end: number,
  intervalSec: number = 60
) {
  for (let sec = start; sec < end; sec += intervalSec) {
    const key = `composites/${storeId}/${sec}.jpg`;
    // 1x1 JPEG-like bytes (not real JPEG, just for testing)
    await r2.put(key, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  }
}

describe('analyzeSession', () => {
  it('analyzes session with multiple time periods', async () => {
    const env = createMockEnv();
    const gemini = createMockGemini();

    // Seed frames for a 1-hour session at 1 per minute (60 frames)
    await seedFrames(env.INGEST_FRAMES, 'store1', 3600, 7200, 60);

    const result = await analyzeSession(env, gemini, {
      store_id: 'store1',
      session_start: 3600,
      session_end: 7200,
    });

    expect(result.store_id).toBe('store1');
    expect(result.session_start).toBe(3600);
    expect(result.session_end).toBe(7200);
    // 3600-7200 with 300s periods = 12 periods
    expect(result.periods.length).toBe(12);
    expect(result.periods.every(p => p.analysis !== null)).toBe(true);
    // Gemini called once per period
    expect(gemini.callCount).toBe(12);
  });

  it('chains context between sequential periods', async () => {
    const env = createMockEnv();
    const gemini = createMockGemini();

    await seedFrames(env.INGEST_FRAMES, 'store1', 3600, 4200, 60);

    await analyzeSession(env, gemini, {
      store_id: 'store1',
      session_start: 3600,
      session_end: 4200,
    });

    // First call should have no previous summary
    expect(gemini.calls[0].previousSummary).toBeNull();
    // Second call should have previous period's summary
    expect(gemini.calls[1].previousSummary).toBe(
      'One person browsing, conversation near entrance.'
    );
  });

  it('handles empty session (no frames)', async () => {
    const env = createMockEnv();
    const gemini = createMockGemini();

    const result = await analyzeSession(env, gemini, {
      store_id: 'store1',
      session_start: 3600,
      session_end: 7200,
    });

    expect(result.periods.length).toBe(0);
    expect(gemini.callCount).toBe(0);
    expect(result.summary).toContain('No frames');
  });

  it('continues analysis when one period fails', async () => {
    const env = createMockEnv();
    // Fail on call 2 (second period)
    const gemini = createFailingGemini(2);

    await seedFrames(env.INGEST_FRAMES, 'store1', 3600, 4500, 60);

    const result = await analyzeSession(env, gemini, {
      store_id: 'store1',
      session_start: 3600,
      session_end: 4500,
    });

    // 3 periods (3600-3900, 3900-4200, 4200-4500)
    expect(result.periods.length).toBe(3);
    // Period 2 (index 1) should have failed
    expect(result.periods[1].analysis).toBeNull();
    expect(result.periods[1].error).toContain('Gemini API error');
    // Other periods should succeed
    expect(result.periods[0].analysis).not.toBeNull();
    expect(result.periods[2].analysis).not.toBeNull();
  });
});

describe('persistAnalysis', () => {
  it('writes interaction and period analyses to D1', async () => {
    const db = createMockD1();

    await persistAnalysis(db, {
      interaction_id: 'int-1',
      store_id: 'store1',
      session_start: 3600,
      session_end: 7200,
      referenced_interactions: [],
      periods: [
        {
          period_start: 3600,
          analysis: {
            people: [],
            interactions: [],
            movement_patterns: [],
            notable_events: [],
            summary: 'Quiet period.',
          },
        },
        {
          period_start: 3900,
          analysis: null,
          error: 'API timeout',
        },
      ],
      summary: 'Test session summary.',
    });

    // Verify interaction was inserted
    const result = await db
      .prepare('SELECT * FROM interactions WHERE store_id = ?')
      .bind('store1')
      .all();
    expect(result.results.length).toBe(1);
    expect((result.results[0] as Record<string, unknown>).id).toBe('int-1');
  });
});
