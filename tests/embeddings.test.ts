import type { VectorMatch } from '../src/lib/embeddings';
import { describe, expect, it } from 'vitest';
import { analyzeSession, embedInteraction } from '../src/lib/analyzer';
import { extractEmbeddingText } from '../src/lib/embeddings';
import {
  createFakeJpeg,
  createMockEmbeddings,
  createMockEnv,
  createMockGemini,
  createMockR2,
} from './helpers';

async function seedFrames(
  r2: R2Bucket,
  storeId: string,
  start: number,
  end: number
) {
  const fakeJpeg = createFakeJpeg();
  for (let sec = start; sec < end; sec += 60) {
    await r2.put(`composites/${storeId}/${sec}.jpg`, fakeJpeg);
  }
}

describe('extractEmbeddingText', () => {
  it('combines summary and JSON text', () => {
    const result = extractEmbeddingText(
      'Session summary here',
      JSON.stringify({ text: 'Detailed text content' })
    );
    expect(result).toContain('Session summary here');
    expect(result).toContain('Detailed text content');
  });

  it('handles non-JSON summary gracefully', () => {
    const result = extractEmbeddingText('Just a summary', 'not json');
    expect(result).toContain('Just a summary');
  });

  it('truncates to 2000 chars', () => {
    const longText = 'x'.repeat(3000);
    const result = extractEmbeddingText(longText, '{}');
    expect(result.length).toBeLessThanOrEqual(2000);
  });
});

describe('embedInteraction', () => {
  it('embeds interaction into vectorize', async () => {
    const embeddings = createMockEmbeddings();

    await embedInteraction(
      embeddings,
      {
        interaction_id: 'int-1',
        store_id: 'store1',
        session_start: 3600,
        session_end: 7200,
        periods: [],
        summary: 'Test session summary',
        referenced_interactions: [],
      },
      JSON.stringify({ text: 'Test session summary' })
    );

    expect(embeddings.embedded.length).toBe(1);
    expect(embeddings.embedded[0].id).toBe('int-1');
    expect(embeddings.embedded[0].metadata.store_id).toBe('store1');
    expect(embeddings.embedded[0].metadata.session_start).toBe(3600);
  });
});

describe('analyzeSession with RAG', () => {
  it('queries vectorize for prior context', async () => {
    const r2 = createMockR2();
    const env = createMockEnv({ INGEST_FRAMES: r2 });
    const gemini = createMockGemini();
    const embeddings = createMockEmbeddings();

    await seedFrames(r2, 'store1', 3600, 4200);

    await analyzeSession(
      env,
      gemini,
      {
        store_id: 'store1',
        session_start: 3600,
        session_end: 4200,
      },
      embeddings
    );

    // Should have queried vectorize
    expect(embeddings.queries.length).toBe(1);
    expect(embeddings.queries[0].storeId).toBe('store1');
  });

  it('includes prior context in first period prompt when matches exist', async () => {
    const r2 = createMockR2();
    const env = createMockEnv({ INGEST_FRAMES: r2 });
    const gemini = createMockGemini();

    const priorMatches: VectorMatch[] = [
      {
        id: 'old-int-1',
        score: 0.85,
        metadata: {
          store_id: 'store1',
          session_start: 0,
          interaction_id: 'old-int-1',
          summary_text:
            'A tall man in a red jacket browsed sneakers for 20 minutes.',
        },
      },
    ];
    const embeddings = createMockEmbeddings(priorMatches);

    await seedFrames(r2, 'store1', 3600, 4200);

    const result = await analyzeSession(
      env,
      gemini,
      {
        store_id: 'store1',
        session_start: 3600,
        session_end: 4200,
      },
      embeddings
    );

    // First period should have received prior context
    expect(gemini.calls[0].previousSummary).toContain(
      'Prior context from previous sessions'
    );
    expect(gemini.calls[0].previousSummary).toContain('red jacket');

    // referenced_interactions should include the matched interaction
    expect(result.referenced_interactions).toContain('old-int-1');
  });

  it('does not inject prior context for subsequent periods', async () => {
    const r2 = createMockR2();
    const env = createMockEnv({ INGEST_FRAMES: r2 });
    const gemini = createMockGemini();

    const priorMatches: VectorMatch[] = [
      {
        id: 'old-int-1',
        score: 0.9,
        metadata: {
          store_id: 'store1',
          session_start: 0,
          interaction_id: 'old-int-1',
          summary_text: 'Prior session context.',
        },
      },
    ];
    const embeddings = createMockEmbeddings(priorMatches);

    await seedFrames(r2, 'store1', 3600, 4200);

    await analyzeSession(
      env,
      gemini,
      {
        store_id: 'store1',
        session_start: 3600,
        session_end: 4200,
      },
      embeddings
    );

    // Second period should only have previous period's summary, not prior session context
    expect(gemini.calls[1].previousSummary).not.toContain(
      'Prior context from previous sessions'
    );
    expect(gemini.calls[1].previousSummary).toBe(
      'One person browsing, conversation near entrance.'
    );
  });

  it('continues analysis if RAG query fails', async () => {
    const r2 = createMockR2();
    const env = createMockEnv({ INGEST_FRAMES: r2 });
    const gemini = createMockGemini();

    const failingEmbeddings = createMockEmbeddings();
    failingEmbeddings.query = async () => {
      throw new Error('Vectorize unavailable');
    };

    await seedFrames(r2, 'store1', 3600, 3900);

    const result = await analyzeSession(
      env,
      gemini,
      {
        store_id: 'store1',
        session_start: 3600,
        session_end: 3900,
      },
      failingEmbeddings
    );

    // Analysis should still succeed
    expect(result.periods.length).toBe(1);
    expect(result.periods[0].analysis).not.toBeNull();
    expect(result.referenced_interactions).toEqual([]);
  });

  it('works without embeddings client (null)', async () => {
    const r2 = createMockR2();
    const env = createMockEnv({ INGEST_FRAMES: r2 });
    const gemini = createMockGemini();

    await seedFrames(r2, 'store1', 3600, 3900);

    const result = await analyzeSession(
      env,
      gemini,
      {
        store_id: 'store1',
        session_start: 3600,
        session_end: 3900,
      },
      null
    );

    expect(result.periods.length).toBe(1);
    expect(result.referenced_interactions).toEqual([]);
  });
});
