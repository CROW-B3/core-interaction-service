import type {
  AgentResult,
  DeterministicIssue,
  PreprocessedSession,
  SynthesisResult,
  WhyConclusion,
} from './types';
import {
  buildFallbackAgentResult,
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
    .map(i => `[${i.severity}] ${i.type}: ${i.description}`)
    .join('\n');

  const prompt = `You are a synthesis analyst. Combine findings from multiple analysis agents to determine WHY the user left this web session.

Session: ${session.metadata.deviceType} | Duration: ${Math.round(session.durationMs / 1000)}s | Exit: ${session.exitContext.lastPage}

Deterministic Issues:
${issuesSummary || 'None detected'}

Agent Findings:
${agentFindings}

Synthesize all findings into multiple ranked "why" conclusions for why the user exited. Each "why" should be a distinct reason with its own evidence chain.

Consider:
- Which findings from different agents corroborate each other?
- What is the most likely primary reason for exit?
- Are there secondary contributing factors?
- What specific, actionable recommendations address each "why"?

Respond ONLY with valid JSON:
{
  "findings": [
    {"observation": "string", "evidence": "string", "significance": "high|medium|low"}
  ],
  "confidence": 0.0-1.0,
  "tags": ["string"],
  "whyConclusions": [
    {
      "why": "string - clear statement of why user left",
      "confidence": 0.0-1.0,
      "category": "string (e.g. price_sensitivity, slow_performance, missing_info, cart_abandonment, poor_ux)",
      "supportingEvidence": ["string"],
      "recommendations": ["string"]
    }
  ]
}`;

  const response = await runAiPrompt(ai, prompt, 1024);
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
    })),
  };
}
