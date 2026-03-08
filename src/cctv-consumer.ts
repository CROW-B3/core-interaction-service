import type {
  CctvBatchQueueMessage,
  Environment,
  FrameAnalysisResult,
  ProductCatalogItem,
  StructuredCctvInteraction,
} from './types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';

const LLAMA_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

async function fetchProductCatalogForOrganization(
  productServiceUrl: string,
  organizationId: string,
  internalGatewayKey: string
): Promise<ProductCatalogItem[]> {
  try {
    const response = await fetch(
      `${productServiceUrl}/api/v1/products/organization/${organizationId}`,
      {
        headers: {
          'X-Internal-Key': internalGatewayKey,
          'X-Organization-Id': organizationId,
          'X-System-Token': 'internal',
        },
      }
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      products?: ProductCatalogItem[];
    };
    return data.products ?? [];
  } catch {
    return [];
  }
}

function buildProductCatalogSummary(products: ProductCatalogItem[]): string {
  if (products.length === 0) return 'No product catalog available.';
  const productLines = products.map(
    p => `- ${p.id}: ${p.name} (${p.category ?? 'uncategorized'})`
  );
  return `Product catalog:\n${productLines.join('\n')}`;
}

function buildFrameAnalysesSummary(
  frameAnalyses: FrameAnalysisResult[]
): string {
  return frameAnalyses
    .map(f => `Frame ${f.frameIndex}: ${f.description}`)
    .join('\n');
}

function buildMatchingPrompt(
  framesSummary: string,
  productCatalogSummary: string
): string {
  return [
    'You are analyzing a batch of CCTV frame analyses from a retail environment.',
    'Match observed customer behavior to products from the catalog.',
    '',
    'Frame analyses:',
    framesSummary,
    '',
    productCatalogSummary,
    '',
    'Respond ONLY with valid JSON (no markdown, no explanation) in this exact format:',
    '{',
    '  "behavior": "string describing overall customer behavior",',
    '  "peopleCount": number,',
    '  "productInteractions": [{"productId": "id", "type": "browsing|pickup|purchase|return"}],',
    '  "confidence": number between 0 and 1,',
    '  "tags": ["tag1", "tag2"]',
    '}',
  ].join('\n');
}

function parseStructuredInteractionFromLlmResponse(
  responseText: string
): StructuredCctvInteraction {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return buildFallbackInteraction(responseText);

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      behavior: String(parsed.behavior ?? 'Unknown behavior observed'),
      peopleCount: Number(parsed.peopleCount ?? 0),
      productInteractions: Array.isArray(parsed.productInteractions)
        ? parsed.productInteractions.map((pi: any) => ({
            productId: String(pi.productId ?? ''),
            type: String(pi.type ?? 'unknown'),
          }))
        : [],
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    };
  } catch {
    return buildFallbackInteraction(responseText);
  }
}

function buildFallbackInteraction(rawText: string): StructuredCctvInteraction {
  return {
    behavior: rawText.slice(0, 500),
    peopleCount: 0,
    productInteractions: [],
    confidence: 0.1,
    tags: ['parse-failed', 'cctv'],
  };
}

async function runProductMatchingWithLlm(
  ai: Ai,
  frameAnalyses: FrameAnalysisResult[],
  products: ProductCatalogItem[]
): Promise<StructuredCctvInteraction> {
  const framesSummary = buildFrameAnalysesSummary(frameAnalyses);
  const catalogSummary = buildProductCatalogSummary(products);
  const prompt = buildMatchingPrompt(framesSummary, catalogSummary);

  try {
    const result = await ai.run(LLAMA_MODEL as any, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    });
    const output = result as { response?: string } | string;
    const responseText =
      typeof output === 'string' ? output : (output?.response ?? '');
    return parseStructuredInteractionFromLlmResponse(responseText);
  } catch {
    return buildFallbackInteraction('LLM analysis unavailable');
  }
}

function extractProductIdsFromInteraction(
  interaction: StructuredCctvInteraction
): string[] {
  return interaction.productInteractions.map(pi => pi.productId);
}

function buildInteractionDataJson(
  batch: CctvBatchQueueMessage,
  structured: StructuredCctvInteraction
): string {
  return JSON.stringify({
    cameraId: batch.cameraId,
    behavior: structured.behavior,
    peopleCount: structured.peopleCount,
    productInteractions: structured.productInteractions,
    batchIndex: batch.batchIndex,
    frameCount: batch.frameAnalyses.length,
    batchStartTimestamp: batch.batchStartTimestamp,
    batchEndTimestamp: batch.batchEndTimestamp,
  });
}

function buildInteractionSummary(
  structured: StructuredCctvInteraction
): string {
  const parts = [
    structured.behavior.slice(0, 150),
    `People: ${structured.peopleCount}`,
    `Products: ${structured.productInteractions.length}`,
  ];
  return parts.join(' | ');
}

export async function processCctvBatchMessage(
  batch: CctvBatchQueueMessage,
  env: Environment
): Promise<void> {
  const products = await fetchProductCatalogForOrganization(
    env.PRODUCT_SERVICE_URL,
    batch.organizationId,
    env.INTERNAL_GATEWAY_KEY ?? ''
  );

  const structured = await runProductMatchingWithLlm(
    env.AI,
    batch.frameAnalyses,
    products
  );

  const db = drizzle(env.DB, { schema });
  const productIds = extractProductIdsFromInteraction(structured);
  const dataJson = buildInteractionDataJson(batch, structured);
  const summary = buildInteractionSummary(structured);

  await db.insert(schema.interaction).values({
    id: crypto.randomUUID(),
    organizationId: batch.organizationId,
    sourceType: 'cctv',
    sessionId: batch.sessionId,
    data: dataJson,
    summary,
    confidence: structured.confidence,
    tags: JSON.stringify(structured.tags),
    productIds: JSON.stringify(productIds),
    timestamp: new Date(batch.batchEndTimestamp),
    createdAt: new Date(),
  });
}
