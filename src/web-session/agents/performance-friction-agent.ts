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

const AGENT_NAME = 'performance-friction-agent';

export async function runPerformanceFrictionAgent(
  ai: Ai,
  session: PreprocessedSession,
  issues: DeterministicIssue[]
): Promise<AgentResult> {
  const perfSummary = Object.entries(session.performance)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
    .join(', ');

  const issuesSummary = issues
    .map(
      i =>
        `[${i.severity}] ${i.type}: ${i.description}${i.url ? ` on ${i.url}` : ''}`
    )
    .join('\n');

  const journeyText = buildJourneyNarrativeText(session);

  const errorContext = session.errors
    .map(
      e =>
        `Error at ${e.url}: ${e.data?.message ?? 'unknown'}${e.data?.filename ? ` (${e.data.filename}:${e.data.lineno})` : ''}`
    )
    .join('\n');

  const apiErrorContext = session.apiErrors
    .map(
      e =>
        `API ${e.data?.statusCode ?? 'error'} at ${e.data?.url ?? e.url ?? 'unknown'}`
    )
    .join('\n');

  const rageClickContext = session.rageClicks
    .map(
      e =>
        `Rage-clicked "${e.data?.text ?? e.data?.tagName ?? 'element'}" at ${e.url}`
    )
    .join('\n');

  const prompt = `You are a technical performance analyst. Analyze how technical performance and errors impacted this user's experience and behavior.

Session: ${session.metadata.deviceType} / ${session.metadata.browser} / ${session.metadata.operatingSystem}
Duration: ${Math.round(session.durationMs / 1000)}s | ${session.totalEventCount} events

Web Vitals: ${perfSummary || 'No metrics captured'}

Deterministic Issues:
${issuesSummary || 'None'}

${journeyText}

JavaScript Errors:
${errorContext || 'None'}

API Errors:
${apiErrorContext || 'None'}

Rage Clicks:
${rageClickContext || 'None'}

IMPORTANT: Correlate SPECIFIC performance issues with the user's behavior. For example, if LCP was 4s on a product page and the user left after 5s, that's a direct correlation.

Analyze:
1. Did slow page loads correlate with short dwell times or immediate exits?
2. Did errors or API failures happen at critical moments (checkout, form submission, product view)?
3. What specific elements did the user rage-click on, and were those elements broken or slow?
4. Did the cumulative friction of multiple issues drive the user away?

Respond ONLY with valid JSON:
{
  "findings": [
    {"observation": "string - specific performance insight", "evidence": "string - cite actual metrics and user behavior", "significance": "high|medium|low"}
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
