import type {
  AgentResult,
  DeterministicIssue,
  PreprocessedSession,
} from './types';
import {
  buildFallbackAgentResult,
  buildJourneyNarrativeText,
  parseJsonFromLlm,
  runAiPrompt,
} from './types';

const AGENT_NAME = 'commerce-reality-agent';

export async function runCommerceRealityAgent(
  ai: Ai,
  session: PreprocessedSession,
  _issues: DeterministicIssue[]
): Promise<AgentResult> {
  const journeyText = buildJourneyNarrativeText(session);

  const ecommerceTimeline = session.ecommerceEvents
    .map(e => {
      const data = e.data ?? {};
      const price = data.price ? ` ($${data.price})` : '';
      const variant = data.variantName ? ` [${data.variantName}]` : '';
      return `[${new Date(e.timestamp).toISOString()}] ${e.type}: ${data.productName ?? data.text ?? 'unknown'}${price}${variant} at ${e.url}`;
    })
    .join('\n');

  const productPages = session.pageDomSummaries
    .filter(p => p.productElements.length > 0)
    .map(p => {
      const products = p.productElements
        .map(
          pe =>
            `${pe.name ?? 'unknown'} (price: ${pe.price ?? 'not shown'}, stock: ${pe.stock ?? 'unknown'})`
        )
        .join(', ');
      const timeOnPage = session.journey.find(j => j.url === p.url);
      const timeStr = timeOnPage
        ? ` [${Math.round(timeOnPage.timeOnPageMs / 1000)}s on page]`
        : '';
      return `${p.url}${timeStr}: ${products}`;
    })
    .join('\n');

  const cartInfo = session.exitContext.cartState
    ? `Cart has ${(session.exitContext.cartState as Record<string, unknown>).itemCount} items. Last item: ${JSON.stringify((session.exitContext.cartState as Record<string, unknown>).lastItem ?? {})}`
    : 'Cart empty or not used';

  const prompt = `You are an e-commerce conversion analyst. Analyze this REAL user session to understand purchase intent and what specific barriers prevented conversion.

Session: ${session.metadata.deviceType} | Duration: ${Math.round(session.durationMs / 1000)}s
Referrer: ${session.metadata.referrer ?? 'direct'}

${journeyText}

E-commerce Events Timeline:
${ecommerceTimeline || 'No e-commerce events detected'}

Product Pages & Prices Viewed:
${productPages || 'No product pages detected'}

Cart Status: ${cartInfo}

Exit: Left from ${session.exitContext.lastPage} after "${session.exitContext.lastAction}"

IMPORTANT: Be SPECIFIC about what products/prices the user viewed and what actions they took. Reference actual prices, product names, and the user's specific behavior.

Analyze:
1. Purchase intent - What specific actions indicate browsing vs. buying intent?
2. Price reaction - Did the user view prices and leave? Compare products by price? Abandon after seeing total?
3. Product interest - Which specific products got attention (time spent, image zooms, variant selections)?
4. Cart behavior - Did they add items but not checkout? What was the last action before leaving?
5. Conversion barriers - What SPECIFIC thing likely stopped this user from converting? (e.g., "Viewed $299 headphones for 60s, selected color variant, but left after seeing $15 shipping")

Respond ONLY with valid JSON:
{
  "findings": [
    {"observation": "string - specific commerce insight", "evidence": "string - cite actual products, prices, and user actions", "significance": "high|medium|low"}
  ],
  "confidence": 0.0-1.0,
  "tags": ["string"]
}`;

  const response = await runAiPrompt(ai, prompt, 768);
  if (!response) return buildFallbackAgentResult(AGENT_NAME);

  const parsed = parseJsonFromLlm<{
    findings?: {
      observation: string;
      evidence: string;
      significance: string;
    }[];
    confidence?: number;
    tags?: string[];
  }>(response);

  if (!parsed) return buildFallbackAgentResult(AGENT_NAME);

  return {
    agentName: AGENT_NAME,
    findings: (parsed.findings ?? []).map(f => ({
      observation: f.observation,
      evidence: f.evidence,
      significance:
        f.significance === 'high' ||
        f.significance === 'medium' ||
        f.significance === 'low'
          ? f.significance
          : 'medium',
    })),
    confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
    tags: parsed.tags ?? [],
  };
}
