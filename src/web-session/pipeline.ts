import type { Environment } from '../types';
import type { SessionAnalysisPayload } from './agents/types';
import { runAnalysisPipeline } from './agents/runner';
import { classifySession } from './classifier';
import { detectDeterministicIssues } from './layer1-detector';
import { preprocessSession } from './preprocessor';
import { storeAnalysisResult } from './storage';

export async function runSessionAnalysis(
  payload: SessionAnalysisPayload,
  env: Environment
): Promise<void> {
  try {
    console.warn(
      `[Pipeline] Starting analysis for session ${payload.sessionId}`
    );

    const preprocessed = await preprocessSession(payload, env.AI);
    console.warn(
      `[Pipeline] Preprocessed: ${preprocessed.totalEventCount} events, ${preprocessed.journey.length} pages, ${preprocessed.pageDomSummaries.length} DOM summaries`
    );

    const layer = classifySession(preprocessed);
    console.warn(`[Pipeline] Classified as layer: ${layer}`);

    const deterministicIssues = detectDeterministicIssues(preprocessed);
    console.warn(
      `[Pipeline] Found ${deterministicIssues.length} deterministic issues`
    );

    const result = await runAnalysisPipeline(
      env.AI,
      preprocessed,
      deterministicIssues,
      layer
    );
    console.warn(
      `[Pipeline] Analysis complete: ${result.finalWhys.length} whys, confidence ${result.overallConfidence}, ${result.processingTimeMs}ms`
    );

    await storeAnalysisResult(
      env.DB,
      payload.projectId,
      payload.sessionId,
      payload.metadata,
      result
    );
    console.warn(`[Pipeline] Results stored for session ${payload.sessionId}`);
  } catch (err) {
    console.error(
      `[Pipeline] Failed to analyze session ${payload.sessionId}:`,
      err
    );
  }
}
