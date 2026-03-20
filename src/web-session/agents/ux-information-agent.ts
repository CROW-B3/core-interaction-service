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

const AGENT_NAME = 'ux-information-agent';

export async function runUxInformationAgent(
  ai: Ai,
  session: PreprocessedSession,
  _issues: DeterministicIssue[]
): Promise<AgentResult> {
  const journeyText = buildJourneyNarrativeText(session);

  const domContext = session.pageDomSummaries
    .map(d => {
      const ctas = d.interactiveElements
        .map(e => `${e.tag}: "${e.text}"`)
        .join(', ');
      const forms =
        d.formFields.length > 0 ? `\n  Forms: ${d.formFields.join(', ')}` : '';
      const errors =
        d.errorIndicators.length > 0
          ? `\n  Errors: ${d.errorIndicators.join(', ')}`
          : '';
      return `Page: ${d.url}\n  Title: ${d.title}\n  Purpose: ${d.purpose}\n  Key Content: ${d.visibleContent}\n  CTAs: ${ctas}${forms}${errors}`;
    })
    .join('\n\n');

  const exitDom = session.exitContext.lastDomSummary;
  const exitContext = exitDom
    ? `Exit page content: "${exitDom.visibleContent?.slice(0, 300)}"\nExit page CTAs available: ${exitDom.interactiveElements.map(e => e.text).join(', ')}`
    : '';

  const prompt = `You are a UX information architecture analyst. Analyze what this user was looking for and whether the site helped them find it.

Session: ${session.metadata.deviceType} / ${session.metadata.browser} | Duration: ${Math.round(session.durationMs / 1000)}s | ${session.totalEventCount} events

${journeyText}

Page Content & Structure:
${domContext || 'No DOM data available'}

Exit: Left from ${session.exitContext.lastPage} after "${session.exitContext.lastAction}"
${exitContext}

IMPORTANT: Reference SPECIFIC page content, buttons clicked, and navigation paths. Explain what the user likely wanted based on the pages they visited and content they engaged with.

Analyze:
1. What specific information was the user seeking? (Based on pages visited and content viewed)
2. Did they find it? What content gaps or navigation dead-ends existed?
3. Were there UX issues? (Elements they clicked that didn't work, confusing navigation paths, missing CTAs)
4. What was the last thing they saw before leaving, and does it explain why they left?

For each finding, cite SPECIFIC page content, buttons, or navigation paths as evidence.

Respond ONLY with valid JSON:
{
  "findings": [
    {"observation": "string - specific UX insight", "evidence": "string - cite actual page content/actions", "significance": "high|medium|low"}
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
