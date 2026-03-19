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

const AGENT_NAME = 'ux-information-agent';

export async function runUxInformationAgent(
  ai: Ai,
  session: PreprocessedSession,
  _issues: DeterministicIssue[]
): Promise<AgentResult> {
  const journeySummary = session.journey
    .map(
      (p, i) =>
        `${i + 1}. ${p.url} (${Math.round(p.timeOnPageMs / 1000)}s)${
          p.domSummary ? ` - ${p.domSummary.purpose}` : ''
        }${
          p.interactions.length > 0
            ? ` | Actions: ${p.interactions.map(a => a.detail ?? a.type).join(', ')}`
            : ''
        }`
    )
    .join('\n');

  const domContext = session.pageDomSummaries
    .map(
      d =>
        `Page: ${d.url}\n  Purpose: ${d.purpose}\n  Content: ${d.visibleContent}\n  CTAs: ${d.interactiveElements.map(e => e.text).join(', ')}`
    )
    .join('\n');

  const prompt = `You are a UX information architecture analyst. Analyze this web session to understand the user's information journey.

Session: ${session.metadata.deviceType} / ${session.metadata.browser} | Duration: ${Math.round(session.durationMs / 1000)}s | ${session.totalEventCount} events

User Journey:
${journeySummary}

Page Content Context:
${domContext || 'No DOM data available'}

Exit: Left from ${session.exitContext.lastPage} after "${session.exitContext.lastAction}"

Analyze:
1. What information was the user seeking?
2. Did they find what they needed? What gaps existed?
3. Were there information architecture issues (poor navigation, missing content, confusing labels)?
4. Was the content hierarchy effective?

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
      significance: validateSignificance(f.significance),
    })),
    confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
    tags: parsed.tags ?? [],
  };
}

function validateSignificance(s: string): 'high' | 'medium' | 'low' {
  if (s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
}
