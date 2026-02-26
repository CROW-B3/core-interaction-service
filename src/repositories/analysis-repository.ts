import type { DatabaseClient } from '../db/client';
import type { AnalysisResult } from '../types';
import { count, eq } from 'drizzle-orm';
import { generateId } from '../db/client';
import { sessionAnalyses } from '../db/schema';

export async function createPendingAnalysis(
  database: DatabaseClient,
  sessionId: string
): Promise<string> {
  const id = generateId('ana');
  await database
    .insert(sessionAnalyses)
    .values({
      id,
      sessionId,
      status: 'pending',
    })
    .run();
  return id;
}

export async function saveAnalysisResult(
  database: DatabaseClient,
  sessionId: string,
  result: AnalysisResult,
  durationMs: number,
  eventCount: number,
  replayChunkCount: number,
  modelUsed: string
): Promise<void> {
  const id = generateId('ana');
  await database
    .insert(sessionAnalyses)
    .values({
      id,
      sessionId,
      status: 'completed',
      journeyAnalysis: result.journeyAnalysis,
      pageAnalyses: result.pageAnalyses,
      exitAnalysis: result.exitAnalysis,
      summary: result.summary,
      confidence: result.confidence,
      tags: result.tags,
      eventCount,
      replayChunkCount,
      processingDurationMs: durationMs,
      modelUsed,
      processedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: sessionAnalyses.sessionId,
      set: {
        status: 'completed',
        journeyAnalysis: result.journeyAnalysis,
        pageAnalyses: result.pageAnalyses,
        exitAnalysis: result.exitAnalysis,
        summary: result.summary,
        confidence: result.confidence,
        tags: result.tags,
        eventCount,
        replayChunkCount,
        processingDurationMs: durationMs,
        modelUsed,
        processedAt: new Date(),
        errorMessage: null,
      },
    })
    .run();
}

export async function markAnalysisFailed(
  database: DatabaseClient,
  sessionId: string,
  error: string
): Promise<void> {
  await database
    .update(sessionAnalyses)
    .set({
      status: 'failed',
      errorMessage: error,
      processedAt: new Date(),
    })
    .where(eq(sessionAnalyses.sessionId, sessionId))
    .run();
}

export async function getAnalysisBySessionId(
  database: DatabaseClient,
  sessionId: string
) {
  const result = await database
    .select()
    .from(sessionAnalyses)
    .where(eq(sessionAnalyses.sessionId, sessionId))
    .get();
  return result ?? null;
}

export async function getAnalysisStats(database: DatabaseClient) {
  const rows = await database
    .select({
      status: sessionAnalyses.status,
      count: count(),
    })
    .from(sessionAnalyses)
    .groupBy(sessionAnalyses.status)
    .all();

  const stats = {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const row of rows) {
    const statusKey = row.status as keyof typeof stats;
    if (statusKey in stats && statusKey !== 'total') {
      stats[statusKey] = row.count;
    }
    stats.total += row.count;
  }

  return stats;
}
