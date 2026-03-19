import type { AnalysisPipelineResult, SessionMetadata } from './agents/types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export async function storeAnalysisResult(
  db: D1Database,
  projectId: string,
  sessionId: string,
  metadata: SessionMetadata,
  result: AnalysisPipelineResult
): Promise<void> {
  const orm = drizzle(db, { schema });

  const summary = buildSummary(result, metadata);
  const tags = buildTags(result);

  await orm.insert(schema.interaction).values({
    id: crypto.randomUUID(),
    organizationId: projectId,
    sourceType: 'web',
    sessionId,
    data: JSON.stringify({
      layer: result.layer,
      deterministicIssues: result.deterministicIssues,
      agentResults: result.agentResults,
      synthesis: result.synthesis,
      redTeamReview: result.redTeamReview,
      finalWhys: result.finalWhys,
      processingTimeMs: result.processingTimeMs,
    }),
    summary,
    confidence: result.overallConfidence,
    tags: JSON.stringify(tags),
    productIds: null,
    timestamp: new Date(metadata.startedAt),
    createdAt: new Date(),
  });
}

function buildSummary(
  result: AnalysisPipelineResult,
  metadata: SessionMetadata
): string {
  const whySummary = result.finalWhys
    .slice(0, 3)
    .map(w => `${w.category}:${w.confidence.toFixed(2)}`)
    .join(', ');

  return `Layer ${result.layer === 'deterministic' ? '1' : result.layer === 'behavioral' ? '2' : '3'} | ${result.finalWhys.length} whys (${whySummary}) | ${metadata.deviceType}/${metadata.browser}`;
}

function buildTags(result: AnalysisPipelineResult): string[] {
  const tags: string[] = [`layer:${result.layer}`];

  for (const issue of result.deterministicIssues) {
    if (!tags.includes(issue.type)) tags.push(issue.type);
  }

  for (const why of result.finalWhys.slice(0, 3)) {
    if (!tags.includes(why.category)) tags.push(why.category);
  }

  return tags;
}
