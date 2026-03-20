import type {
  AgentResult,
  AnalysisPipelineResult,
  DeterministicIssue,
  PreprocessedSession,
  RedTeamResult,
  SessionLayer,
  SynthesisResult,
  WhyConclusion,
} from './types';
import { runBehavioralModelAgent } from './behavioral-model-agent';
import { runCommerceRealityAgent } from './commerce-reality-agent';
import { runJobSynthesisAgent } from './job-synthesis-agent';
import { runPerformanceFrictionAgent } from './performance-friction-agent';
import { runRedTeamAgent } from './red-team-agent';
import { buildFallbackAgentResult } from './types';
import { runUxInformationAgent } from './ux-information-agent';

export async function runAnalysisPipeline(
  ai: Ai,
  session: PreprocessedSession,
  deterministicIssues: DeterministicIssue[],
  layer: SessionLayer
): Promise<AnalysisPipelineResult> {
  const startTime = Date.now();

  if (layer === 'dead') {
    return runDeadSessionPipeline(ai, session, deterministicIssues, startTime);
  }

  return runFullPipeline(ai, session, deterministicIssues, layer, startTime);
}

async function runDeadSessionPipeline(
  ai: Ai,
  session: PreprocessedSession,
  issues: DeterministicIssue[],
  startTime: number
): Promise<AnalysisPipelineResult> {
  const parallelResults = await Promise.allSettled([
    runUxInformationAgent(ai, session, issues),
    runCommerceRealityAgent(ai, session, issues),
  ]);

  const agentResults = parallelResults.map((r, i) => {
    const agentName =
      i === 0 ? 'ux-information-agent' : 'commerce-reality-agent';
    return r.status === 'fulfilled'
      ? r.value
      : buildFallbackAgentResult(agentName);
  });

  const synthesis = await runJobSynthesisAgent(
    ai,
    session,
    agentResults,
    issues
  );

  return buildResult(
    session,
    'dead',
    issues,
    agentResults,
    synthesis,
    undefined,
    synthesis.whyConclusions,
    startTime
  );
}

async function runFullPipeline(
  ai: Ai,
  session: PreprocessedSession,
  issues: DeterministicIssue[],
  layer: SessionLayer,
  startTime: number
): Promise<AnalysisPipelineResult> {
  const parallelResults = await Promise.allSettled([
    runUxInformationAgent(ai, session, issues),
    runBehavioralModelAgent(ai, session, issues),
    runPerformanceFrictionAgent(ai, session, issues),
    runCommerceRealityAgent(ai, session, issues),
  ]);

  const agentNames = [
    'ux-information-agent',
    'behavioral-model-agent',
    'performance-friction-agent',
    'commerce-reality-agent',
  ];

  const agentResults = parallelResults.map((r, i) =>
    r.status === 'fulfilled' ? r.value : buildFallbackAgentResult(agentNames[i])
  );

  const synthesis = await runJobSynthesisAgent(
    ai,
    session,
    agentResults,
    issues
  );
  const redTeam = await runRedTeamAgent(ai, synthesis, session);

  return buildResult(
    session,
    layer,
    issues,
    agentResults,
    synthesis,
    redTeam,
    redTeam.finalWhys,
    startTime
  );
}

function buildResult(
  session: PreprocessedSession,
  layer: SessionLayer,
  issues: DeterministicIssue[],
  agentResults: AgentResult[],
  synthesis: SynthesisResult,
  redTeam: RedTeamResult | undefined,
  finalWhys: WhyConclusion[],
  startTime: number
): AnalysisPipelineResult {
  const confidences = agentResults.map(r => r.confidence).filter(c => c > 0.1);
  const overallConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.1;

  return {
    sessionId: session.sessionId,
    projectId: session.projectId,
    layer,
    deterministicIssues: issues,
    agentResults,
    synthesis,
    redTeamReview: redTeam,
    finalWhys,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    processingTimeMs: Date.now() - startTime,
  };
}
