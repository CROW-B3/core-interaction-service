import type { Environment } from '../types';

const EMBEDDING_MODEL = '@cf/baai/bge-m3';

interface InteractionForVectorize {
  id: string;
  organizationId: string;
  sourceType: string;
  summary: string | null;
  tags: string | null;
}

function buildInteractionText(interaction: InteractionForVectorize): string {
  const parts: string[] = [];
  if (interaction.summary) parts.push(interaction.summary);
  if (interaction.tags) {
    try {
      const parsed = JSON.parse(interaction.tags);
      if (Array.isArray(parsed)) parts.push(parsed.join(', '));
    } catch {
      parts.push(interaction.tags);
    }
  }
  parts.push(`Source: ${interaction.sourceType}`);
  return parts.join(' - ');
}

async function generateEmbedding(
  env: Environment,
  text: string
): Promise<number[]> {
  const result = (await env.AI.run(
    EMBEDDING_MODEL,
    { text: [text] },
    { gateway: { id: env.AI_GATEWAY_ID } }
  )) as { data: number[][] };
  return result.data[0];
}

export async function vectorizeInteraction(
  env: Environment,
  interaction: InteractionForVectorize
): Promise<void> {
  const text = buildInteractionText(interaction);
  if (text.trim().length === 0) return;

  const values = await generateEmbedding(env, text);

  await env.INTERACTION_VECTORIZE.upsert([
    {
      id: interaction.id,
      values,
      metadata: {
        organizationId: interaction.organizationId,
        sourceType: interaction.sourceType,
        summary: interaction.summary ?? '',
      },
    },
  ]);
}

export async function searchInteractions(
  env: Environment,
  query: string,
  organizationId: string,
  topK = 10
): Promise<{ id: string; score: number; metadata: Record<string, string> }[]> {
  const queryEmbedding = await generateEmbedding(env, query);

  const results = await env.INTERACTION_VECTORIZE.query(queryEmbedding, {
    topK,
    filter: { organizationId },
    returnMetadata: 'all',
  });

  return results.matches.map(match => ({
    id: match.id,
    score: match.score,
    metadata: (match.metadata ?? {}) as Record<string, string>,
  }));
}
