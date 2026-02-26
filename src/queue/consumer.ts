import type { Environment, SessionProcessingMessage } from '../types';
import { createDatabaseClient } from '../db/client';
import { analyzeSession } from '../llm/ai-analyzer';
import { normalizeEvents } from '../preprocessing/event-normalizer';
import { processReplayData } from '../preprocessing/replay-processor';
import {
  createPendingAnalysis,
  getAnalysisBySessionId,
  markAnalysisFailed,
  saveAnalysisResult,
} from '../repositories/analysis-repository';
import {
  fetchAllReplayData,
  fetchSessionExport,
} from '../services/data-fetcher';

export async function processSession(
  sessionId: string,
  env: Environment
): Promise<void> {
  const db = createDatabaseClient(env.DB);

  // Idempotency: skip if analysis already completed
  const existing = await getAnalysisBySessionId(db, sessionId);
  if (existing && existing.status === 'completed') {
    console.warn(
      `Analysis already completed for session ${sessionId}, skipping`
    );
    return;
  }

  // Create a pending analysis record
  await createPendingAnalysis(db, sessionId);

  const startTime = Date.now();

  try {
    // Fetch session export from web-ingest-service
    let exportResponse;
    try {
      exportResponse = await fetchSessionExport(
        env.WEB_INGEST_SERVICE_URL,
        sessionId
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Session not found or fetch failed for ${sessionId}: ${message}`
      );
      await markAnalysisFailed(db, sessionId, 'session_not_found');
      return;
    }

    const { session, events, replayChunks } = exportResponse.data;

    // Normalize events into a structured timeline
    const timeline = normalizeEvents(events);

    // Process replay data if available
    let domSnapshots = new Map<string, string>();
    if (replayChunks.length > 0) {
      try {
        const replayData = await fetchAllReplayData(
          env.WEB_INGEST_SERVICE_URL,
          sessionId,
          replayChunks
        );
        domSnapshots = processReplayData(replayData, events);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `Failed to fetch replay data for session ${sessionId}: ${message}. Continuing with empty DOM snapshots.`
        );
      }
    }

    // Run AI analysis
    const { result, modelUsed } = await analyzeSession(
      env.AI,
      session,
      timeline,
      domSnapshots
    );

    // Save results
    const durationMs = Date.now() - startTime;
    await saveAnalysisResult(
      db,
      sessionId,
      result,
      durationMs,
      events.length,
      replayChunks.length,
      modelUsed
    );

    console.warn(
      `Successfully processed session ${sessionId} in ${durationMs}ms using ${modelUsed}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to process session ${sessionId}: ${message}`);
    await markAnalysisFailed(db, sessionId, message);
  }
}

export async function handleQueueBatch(
  batch: MessageBatch<SessionProcessingMessage>,
  env: Environment
): Promise<void> {
  for (const message of batch.messages) {
    const { sessionId } = message.body;

    try {
      await processSession(sessionId, env);
      message.ack();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Unhandled error processing session ${sessionId}: ${errorMessage}`
      );
      message.retry();
    }
  }
}
