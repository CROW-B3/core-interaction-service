import type {
  RedTeamChallenge,
  RedTeamResult,
  SynthesisResult,
  WhyConclusion,
} from './types';
import {
  buildFallbackAgentResult,
  parseJsonFromLlm,
  runAiPrompt,
} from './types';

const AGENT_NAME = 'red-team-agent';

export async function runRedTeamAgent(
  ai: Ai,
  synthesis: SynthesisResult
): Promise<RedTeamResult> {
  const whySummary = synthesis.whyConclusions
    .map(
      (w, i) =>
        `${i + 1}. "${w.why}" (confidence: ${w.confidence}, category: ${w.category})\n   Evidence: ${w.supportingEvidence.join('; ')}`
    )
    .join('\n');

  const findingsSummary = synthesis.findings
    .map(f => `- ${f.observation} [${f.significance}]`)
    .join('\n');

  const prompt = `You are a red team analyst. Challenge the session analysis conclusions and identify biases or alternative explanations.

Synthesis Conclusions:
${whySummary || 'No conclusions provided'}

Supporting Findings:
${findingsSummary || 'None'}

For each "why" conclusion:
1. Challenge it - what evidence might contradict it?
2. Provide an alternative explanation
3. Identify cognitive biases (confirmation bias, recency bias, etc.)
4. Adjust the confidence score based on your review

IMPORTANT: Keep the "why" statements SPECIFIC and narrative-based. Do NOT replace specific whys with generic category labels. Refine and improve the specificity of each why if possible.

Produce a final set of refined "whys" with adjusted confidence scores.

Respond ONLY with valid JSON:
{
  "findings": [
    {"observation": "string", "evidence": "string", "significance": "high|medium|low"}
  ],
  "confidence": 0.0-1.0,
  "tags": ["string"],
  "challenges": [
    {
      "originalWhy": "string",
      "challenge": "string",
      "alternativeExplanation": "string",
      "adjustedConfidence": 0.0-1.0,
      "biasIdentified": "string or null"
    }
  ],
  "finalWhys": [
    {
      "why": "string - refined specific narrative of why user left",
      "confidence": 0.0-1.0,
      "category": "string",
      "supportingEvidence": ["string"],
      "recommendations": ["string"],
      "journeyEvidence": "string - 1-2 sentence user journey summary"
    }
  ]
}`;

  const response = await runAiPrompt(ai, prompt, 1024);
  if (!response) {
    return {
      ...buildFallbackAgentResult(AGENT_NAME),
      challenges: [],
      finalWhys: synthesis.whyConclusions,
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
    challenges?: RedTeamChallenge[];
    finalWhys?: WhyConclusion[];
  }>(response);

  if (!parsed) {
    return {
      ...buildFallbackAgentResult(AGENT_NAME),
      challenges: [],
      finalWhys: synthesis.whyConclusions,
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
    challenges: (parsed.challenges ?? []).map(c => ({
      originalWhy: c.originalWhy,
      challenge: c.challenge,
      alternativeExplanation: c.alternativeExplanation,
      adjustedConfidence: Math.max(0, Math.min(1, c.adjustedConfidence ?? 0.5)),
      biasIdentified: c.biasIdentified,
    })),
    finalWhys: (parsed.finalWhys ?? synthesis.whyConclusions).map(w => ({
      why: w.why,
      confidence: Math.max(0, Math.min(1, w.confidence ?? 0.5)),
      category: w.category ?? 'unknown',
      supportingEvidence: Array.isArray(w.supportingEvidence)
        ? w.supportingEvidence
        : [],
      recommendations: Array.isArray(w.recommendations)
        ? w.recommendations
        : [],
      journeyEvidence: (w as unknown as Record<string, unknown>)
        .journeyEvidence as string | undefined,
    })),
  };
}
