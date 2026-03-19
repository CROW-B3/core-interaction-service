import type {
  AgentResult,
  DeterministicIssue,
  PreprocessedSession,
  SynthesisResult,
  WhyConclusion,
} from './types';
import {
  buildFallbackAgentResult,
  buildJourneyNarrativeText,
  parseJsonFromLlm,
  runAiPrompt,
} from './types';

const AGENT_NAME = 'job-synthesis-agent';

export async function runJobSynthesisAgent(
  ai: Ai,
  session: PreprocessedSession,
  agentResults: AgentResult[],
  issues: DeterministicIssue[]
): Promise<SynthesisResult> {
  const agentFindings = agentResults
    .map(r => {
      const findings = r.findings
        .map(
          f =>
            `  - [${f.significance}] ${f.observation} (Evidence: ${f.evidence})`
        )
        .join('\n');
      return `${r.agentName} (confidence: ${r.confidence}):\n${findings || '  No findings'}`;
    })
    .join('\n\n');

  const issuesSummary = issues
    .map(
      i =>
        `[${i.severity}] ${i.type}: ${i.description}${i.url ? ` on ${i.url}` : ''}`
    )
    .join('\n');

  const journeyText = buildJourneyNarrativeText(session);

  const exitDetail = `Exit page: ${session.exitContext.lastPage}
Last action: ${session.exitContext.lastAction}
Exit page content: ${session.exitContext.lastDomSummary?.visibleContent?.slice(0, 200) ?? 'unknown'}
Cart at exit: ${session.exitContext.cartState ? JSON.stringify(session.exitContext.cartState) : 'empty'}`;

  const prompt = `You are a synthesis analyst. Your job is to produce SPECIFIC, EVIDENCE-BASED "why" conclusions explaining why this user left.

Session: ${session.metadata.deviceType} | Duration: ${Math.round(session.durationMs / 1000)}s
Referrer: ${session.metadata.referrer ?? 'direct'}

${journeyText}

${exitDetail}

Deterministic Issues:
${issuesSummary || 'None detected'}

Agent Analysis Results:
${agentFindings}

CRITICAL INSTRUCTIONS:
- Each "why" must be a SPECIFIC narrative statement about what happened, NOT a generic category label.
- You MUST reference specific content the user SAW (prices, product names, error messages, page titles) from the DOM content and journey data above.
- BAD example: "slow_performance caused user to leave"
- BAD example: "price sensitivity led to abandonment"
- GOOD example: "User saw Nike Air Max 90 at $129.99 on the product page, spent 32s comparing sizes, added to cart, but left after seeing $14.99 shipping fee on the checkout page"
- GOOD example: "User viewed the $99/mo Pro plan pricing page for 45s, scrolled to compare features with the $49/mo Basic plan, but left without clicking 'Start Trial' - likely found the price too high for the features offered"
- Reference ACTUAL pages visited, products viewed, prices seen, buttons clicked, error messages displayed, and time spent.
- The "journeyEvidence" field should be a 1-2 sentence description of the specific user actions that support this why.
- The "domEvidence" field should cite the specific DOM content the user saw that is relevant (product names, prices, error text, page headings).
- Each "why" should tell a STORY about what happened during this session.

Respond ONLY with valid JSON:
{
  "findings": [
    {"observation": "string", "evidence": "string", "significance": "high|medium|low"}
  ],
  "confidence": 0.0-1.0,
  "tags": ["string"],
  "whyConclusions": [
    {
      "why": "string - specific narrative of why the user left, referencing actual actions and content",
      "confidence": 0.0-1.0,
      "category": "string (price_sensitivity|slow_performance|missing_info|cart_abandonment|poor_ux|comparison_shopping|technical_error|content_mismatch|checkout_friction|out_of_stock|trust_concern|feature_gap)",
      "supportingEvidence": ["string - specific evidence from user actions"],
      "recommendations": ["string - actionable fix"],
      "journeyEvidence": "string - 1-2 sentence summary of the user's journey that supports this conclusion",
      "domEvidence": "string - specific DOM content the user saw (product names, prices, error messages, headings)"
    }
  ]
}`;

  const response = await runAiPrompt(ai, prompt, 2048);
  if (!response) {
    return {
      ...buildFallbackAgentResult(AGENT_NAME),
      whyConclusions: [],
    };
  }

  const parsed = parseJsonFromLlm<{
    findings?: {
      observation: string;
      evidence: string;
      significance: string;
    }[];
    confidence?: number;
    tags?: string[];
    whyConclusions?: WhyConclusion[];
  }>(response);

  if (!parsed) {
    return {
      ...buildFallbackAgentResult(AGENT_NAME),
      whyConclusions: [],
    };
  }

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
    whyConclusions: (parsed.whyConclusions ?? []).map(w => ({
      why: w.why,
      confidence: Math.max(0, Math.min(1, w.confidence ?? 0.5)),
      category: w.category ?? 'unknown',
      supportingEvidence: Array.isArray(w.supportingEvidence)
        ? w.supportingEvidence
        : [],
      recommendations: Array.isArray(w.recommendations)
        ? w.recommendations
        : [],
      journeyEvidence: w.journeyEvidence,
      domEvidence: w.domEvidence,
    })),
  };
}
