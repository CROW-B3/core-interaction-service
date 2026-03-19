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
    .map(i => `[${i.severity}] ${i.type}: ${i.description}`)
    .join('\n');

  const pageTimings = session.journey
    .map(
      p =>
        `${p.url}: ${Math.round(p.timeOnPageMs / 1000)}s dwell, ${p.interactions.length} interactions`
    )
    .join('\n');

  const errorContext = session.errors
    .map(e => `Error at ${e.url}: ${e.data?.message ?? 'unknown'}`)
    .join('\n');

  const prompt = `You are a technical performance analyst. Correlate web performance metrics with user behavior to identify friction points.

Session: ${session.metadata.deviceType} / ${session.metadata.browser} / ${session.metadata.operatingSystem}
Duration: ${Math.round(session.durationMs / 1000)}s | ${session.totalEventCount} events

Web Vitals: ${perfSummary || 'No metrics captured'}

Deterministic Issues Found:
${issuesSummary || 'None'}

Page Timings:
${pageTimings}

Errors:
${errorContext || 'None'}

API Errors: ${session.apiErrors.length}
Rage Clicks: ${session.rageClicks.length}

Analyze:
1. How did performance metrics correlate with user behavior changes?
2. Did slow loads cause page abandonment or reduced engagement?
3. Were there technical friction points (errors, broken UI, dead clicks)?
4. Did device/browser limitations contribute to poor experience?
5. What was the cumulative impact of performance issues on the session?

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
