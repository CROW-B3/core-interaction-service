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

const AGENT_NAME = 'behavioral-model-agent';

export async function runBehavioralModelAgent(
  ai: Ai,
  session: PreprocessedSession,
  _issues: DeterministicIssue[]
): Promise<AgentResult> {
  const interactionPattern = session.journey
    .map(p => {
      const clickCount = p.interactions.filter(i => i.type === 'click').length;
      const scrollCount = p.interactions.filter(
        i => i.type === 'scroll'
      ).length;
      const hoverCount = p.interactions.filter(i => i.type === 'hover').length;
      return `${p.url}: ${Math.round(p.timeOnPageMs / 1000)}s, ${clickCount} clicks, ${scrollCount} scrolls, ${hoverCount} hovers`;
    })
    .join('\n');

  const ecommerceActions = session.ecommerceEvents
    .map(
      e =>
        `${e.type}: ${e.data?.productName ?? e.data?.text ?? 'unknown'} at ${e.url}`
    )
    .join('\n');

  const exitInfo = `Last page: ${session.exitContext.lastPage}
Last action: ${session.exitContext.lastAction}
Cart: ${session.exitContext.cartState ? `${session.exitContext.cartState.itemCount} items` : 'empty/none'}`;

  const prompt = `You are a behavioral psychology analyst for web user behavior. Analyze this session for psychological patterns.

Session: ${session.metadata.deviceType} / ${session.metadata.browser} | Duration: ${Math.round(session.durationMs / 1000)}s
Referrer: ${session.metadata.referrer ?? 'direct'}

Interaction Patterns:
${interactionPattern}

E-commerce Actions:
${ecommerceActions || 'None'}

${exitInfo}

Rage clicks: ${session.rageClicks.length}
Event counts: ${JSON.stringify(session.eventCounts)}

Analyze behavioral psychology patterns:
1. Hesitation signals (long dwell times, repeated page visits, back-and-forth navigation)
2. Frustration indicators (rage clicks, rapid scrolling, form abandonment)
3. Decision fatigue (many product views without action, comparison behavior)
4. Price sensitivity (price page visits, coupon searches, cart modifications)
5. Intent level (browsing vs. high purchase intent)

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
