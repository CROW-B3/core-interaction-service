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

const AGENT_NAME = 'behavioral-model-agent';

export async function runBehavioralModelAgent(
  ai: Ai,
  session: PreprocessedSession,
  _issues: DeterministicIssue[]
): Promise<AgentResult> {
  const journeyText = buildJourneyNarrativeText(session);

  const ecommerceActions = session.ecommerceEvents
    .map(e => {
      const d = e.data ?? {};
      const price = d.price ? ` ($${d.price})` : '';
      return `[${new Date(e.timestamp).toISOString()}] ${e.type}: ${d.productName ?? d.text ?? 'unknown'}${price} at ${e.url}`;
    })
    .join('\n');

  const rageClickDetails = session.rageClicks
    .map(e => {
      const target =
        e.data?.text ??
        e.data?.ariaLabel ??
        e.data?.tagName ??
        'unknown element';
      return `Rage-clicked "${target}" at ${e.url}`;
    })
    .join('\n');

  const exitInfo = `Last page: ${session.exitContext.lastPage}
Last action: ${session.exitContext.lastAction}
Cart: ${session.exitContext.cartState ? `${(session.exitContext.cartState as Record<string, unknown>).itemCount} items` : 'empty/none'}`;

  const prompt = `You are a behavioral psychology analyst. Analyze this REAL user session to understand psychological patterns from their ACTUAL actions and what they saw on each page.

Session: ${session.metadata.deviceType} / ${session.metadata.browser} | Duration: ${Math.round(session.durationMs / 1000)}s
Referrer: ${session.metadata.referrer ?? 'direct'}

${journeyText}

E-commerce Actions:
${ecommerceActions || 'None'}

Rage Click Details:
${rageClickDetails || 'None'}

${exitInfo}

IMPORTANT: Base your analysis on the SPECIFIC actions the user took and the ACTUAL content they viewed. Reference real elements, prices, page content, and user actions you can see in the data.

Analyze:
1. Hesitation signals - Did the user revisit pages, spend long time on specific content, or go back-and-forth?
2. Frustration indicators - What specific elements caused rage clicks? What broke the flow?
3. Decision fatigue - Were they comparing products/options without committing?
4. Price sensitivity - Did they view pricing, compare prices, or abandon after seeing a price?
5. Intent signals - What was their likely goal based on the pages visited and actions taken?

For each finding, cite the SPECIFIC user action or page content as evidence (e.g., "User spent 45s on pricing page viewing $99/mo plan, then navigated away without clicking CTA").

Respond ONLY with valid JSON:
{
  "findings": [
    {"observation": "string - specific behavioral insight", "evidence": "string - cite actual user actions/content from the journey", "significance": "high|medium|low"}
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
