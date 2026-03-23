import type {
  AnalysisPipelineResult,
  PreprocessedSession,
  SessionMetadata,
} from './agents/types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export async function storeAnalysisResult(
  db: D1Database,
  projectId: string,
  sessionId: string,
  metadata: SessionMetadata,
  result: AnalysisPipelineResult,
  session?: PreprocessedSession
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
      journeyNarrative: result.finalWhys.map(w => ({
        why: w.why,
        category: w.category,
        confidence: w.confidence,
        journeyEvidence: w.journeyEvidence,
        domEvidence: w.domEvidence,
        supportingEvidence: w.supportingEvidence,
      })),
      ...(session
        ? {
            userJourney: {
              steps: session.journeyNarrative.steps,
              pattern: session.journeyNarrative.pattern,
              totalPagesVisited: session.journeyNarrative.totalPagesVisited,
              uniquePagesVisited: session.journeyNarrative.uniquePagesVisited,
              revisitedPages: session.journeyNarrative.revisitedPages,
            },
            exitContext: {
              lastPage: session.exitContext.lastPage,
              lastAction: session.exitContext.lastAction,
              cartState: session.exitContext.cartState,
              lastDomSummary: session.exitContext.lastDomSummary,
            },
            domSummaries: session.pageDomSummaries.map(d => ({
              url: d.url,
              title: d.title,
              purpose: d.purpose,
              visibleContent: d.visibleContent,
              productElements: d.productElements,
            })),
          }
        : {}),
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
  _metadata: SessionMetadata
): string {
  if (result.finalWhys.length === 0) return '';
  return result.finalWhys[0].why;
}

function buildTags(result: AnalysisPipelineResult): string[] {
  const tags: string[] = [`layer:${result.layer}`];

  for (const issue of result.deterministicIssues) {
    if (!tags.includes(issue.type)) tags.push(issue.type);
  }

  for (const why of result.finalWhys.slice(0, 5)) {
    if (!tags.includes(why.category)) tags.push(why.category);
  }

  const hasHighConfidence = result.finalWhys.some(w => w.confidence >= 0.8);
  if (hasHighConfidence) tags.push('high_confidence');

  const hasJourneyEvidence = result.finalWhys.some(w => w.journeyEvidence);
  if (hasJourneyEvidence) tags.push('evidence_backed');

  const hasDomEvidence = result.finalWhys.some(w => w.domEvidence);
  if (hasDomEvidence) tags.push('dom_evidence');

  return tags;
}
