import type { Environment } from '../types';

export interface EmbeddingClient {
  embed: (text: string) => Promise<number[]>;
  query: (
    storeId: string,
    text: string,
    topK: number,
    excludeSessionStart?: number
  ) => Promise<VectorMatch[]>;
  insert: (
    id: string,
    values: number[],
    metadata: VectorMetadata
  ) => Promise<void>;
}

export interface VectorMetadata {
  store_id: string;
  session_start: number;
  interaction_id: string;
  summary_text: string;
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

const SIMILARITY_THRESHOLD = 0.7;

export function createEmbeddingClient(env: Environment): EmbeddingClient {
  return {
    async embed(text: string): Promise<number[]> {
      const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: [text],
      });
      return (result as { data: number[][] }).data[0];
    },

    async query(
      storeId: string,
      text: string,
      topK: number,
      excludeSessionStart?: number
    ): Promise<VectorMatch[]> {
      const vector = await this.embed(text);

      const results = await env.VECTORIZE.query(vector, {
        topK,
        filter: { store_id: storeId },
        returnMetadata: 'all',
      });

      return (results.matches ?? [])
        .filter(m => m.score >= SIMILARITY_THRESHOLD)
        .filter(
          m =>
            excludeSessionStart === undefined ||
            (m.metadata as unknown as VectorMetadata).session_start !==
              excludeSessionStart
        )
        .map(m => ({
          id: m.id,
          score: m.score,
          metadata: m.metadata as unknown as VectorMetadata,
        }));
    },

    async insert(
      id: string,
      values: number[],
      metadata: VectorMetadata
    ): Promise<void> {
      await env.VECTORIZE.upsert([
        {
          id,
          values,
          metadata: metadata as unknown as Record<string, string | number>,
        },
      ]);
    },
  };
}

/**
 * Extract key descriptors from an interaction summary for embedding.
 * Produces a concise text that captures the semantic content.
 */
export function extractEmbeddingText(
  summary: string,
  storeSummaryJson: string
): string {
  const parts: string[] = [summary];

  try {
    const parsed = JSON.parse(storeSummaryJson);
    if (parsed.text) parts.push(parsed.text);
  } catch {
    // summary might not be JSON — use as-is
  }

  return parts.join(' ').slice(0, 2000); // Truncate for embedding model limits
}
