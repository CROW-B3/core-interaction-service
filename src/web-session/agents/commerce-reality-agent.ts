import type {
  AgentResult,
  DeterministicIssue,
  PreprocessedSession,
} from './types';
import {
  buildFallbackAgentResult,
  parseJsonFromLlm,
  runAiPrompt,
} from './types';

const AGENT_NAME = 'commerce-reality-agent';

export async function runCommerceRealityAgent(
  ai: Ai,
  session: PreprocessedSession,
  _issues: DeterministicIssue[]
): Promise<AgentResult> {
  const ecommerceTimeline = session.ecommerceEvents
    .map(e => {
      const data = e.data ?? {};
      return `[${new Date(e.timestamp).toISOString()}] ${e.type}: ${data.productName ?? data.text ?? 'unknown'}${data.price ? ` ($${data.price})` : ''} at ${e.url}`;
    })
    .join('\n');

  const productPages = session.pageDomSummaries
    .filter(p => p.productElements.length > 0)
    .map(
      p =>
        `${p.url}: ${p.productElements.map(pe => `${pe.name ?? 'unknown'} (${pe.price ?? 'no price'}, ${pe.stock ?? 'unknown stock'})`).join(', ')}`
    )
    .join('\n');

  const cartInfo = session.exitContext.cartState
    ? `Cart has ${session.exitContext.cartState.itemCount} items`
    : 'Cart empty or not used';

  const journeyHighlights = session.journey
    .map(
      p =>
        `${p.url} (${Math.round(p.timeOnPageMs / 1000)}s) - ${p.interactions.filter(i => i.type === 'click').length} clicks`
    )
    .join('\n');

  const prompt = `You are an e-commerce conversion analyst. Analyze this web session for purchase intent and conversion barriers.

Session: ${session.metadata.deviceType} | Duration: ${Math.round(session.durationMs / 1000)}s
Referrer: ${session.metadata.referrer ?? 'direct'}

E-commerce Events Timeline:
${ecommerceTimeline || 'No e-commerce events'}

Product Pages Visited:
${productPages || 'No product pages detected'}

Cart Status: ${cartInfo}

Journey:
${journeyHighlights}

Exit: Left from ${session.exitContext.lastPage} after "${session.exitContext.lastAction}"

Analyze:
1. What was the user's purchase intent level (browsing, researching, ready to buy)?
2. Cart abandonment signals - did they add items but not proceed?
3. Price sensitivity indicators (comparing products, visiting sale pages, hesitating on checkout)
4. Product interest patterns (which products got most attention via time/clicks/zooms)
5. What conversion barriers did this session reveal?

Respond ONLY with valid JSON:
{
  "findings": [
    {"observation": "string", "evidence": "string", "significance": "high|medium|low"}
  ],
  "confidence": 0.0-1.0,
  "tags": ["string"]
}`;

  const response = await runAiPrompt(ai, prompt, 512);
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
