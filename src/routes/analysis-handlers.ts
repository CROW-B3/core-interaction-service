import type { Context } from 'hono';
import type { SessionAnalysis } from '../db/schema';
import type { Environment } from '../types';
import { createDatabaseClient } from '../db/client';
import { processSession } from '../queue/consumer';
import {
  getAnalysisBySessionId,
  getAnalysisStats,
} from '../repositories/analysis-repository';

interface Env {
  Bindings: Environment;
}

function serializeAnalysis(analysis: SessionAnalysis) {
  return {
    ...analysis,
    createdAt:
      analysis.createdAt instanceof Date
        ? Math.floor(analysis.createdAt.getTime() / 1000)
        : analysis.createdAt,
    processedAt:
      analysis.processedAt instanceof Date
        ? Math.floor(analysis.processedAt.getTime() / 1000)
        : analysis.processedAt,
  };
}

export async function handleGetSessionAnalysis(c: Context<Env>) {
  const sessionId = c.req.param('sessionId');
  const db = createDatabaseClient(c.env.DB);

  const analysis = await getAnalysisBySessionId(db, sessionId);

  if (!analysis) {
    return c.json(
      { success: false, error: `No analysis found for session ${sessionId}` },
      404
    );
  }

  return c.json({ success: true, data: serializeAnalysis(analysis) }, 200);
}

export async function handleGetJourneyAnalysis(c: Context<Env>) {
  const sessionId = c.req.param('sessionId');
  const db = createDatabaseClient(c.env.DB);

  const analysis = await getAnalysisBySessionId(db, sessionId);

  if (!analysis) {
    return c.json(
      { success: false, error: `No analysis found for session ${sessionId}` },
      404
    );
  }

  return c.json(
    {
      success: true,
      data: {
        sessionId: analysis.sessionId,
        journeyAnalysis: analysis.journeyAnalysis ?? null,
      },
    },
    200
  );
}

export async function handleGetPageAnalyses(c: Context<Env>) {
  const sessionId = c.req.param('sessionId');
  const db = createDatabaseClient(c.env.DB);

  const analysis = await getAnalysisBySessionId(db, sessionId);

  if (!analysis) {
    return c.json(
      { success: false, error: `No analysis found for session ${sessionId}` },
      404
    );
  }

  return c.json(
    {
      success: true,
      data: {
        sessionId: analysis.sessionId,
        pageAnalyses: analysis.pageAnalyses ?? null,
      },
    },
    200
  );
}

export async function handleGetExitAnalysis(c: Context<Env>) {
  const sessionId = c.req.param('sessionId');
  const db = createDatabaseClient(c.env.DB);

  const analysis = await getAnalysisBySessionId(db, sessionId);

  if (!analysis) {
    return c.json(
      { success: false, error: `No analysis found for session ${sessionId}` },
      404
    );
  }

  return c.json(
    {
      success: true,
      data: {
        sessionId: analysis.sessionId,
        exitAnalysis: analysis.exitAnalysis ?? null,
      },
    },
    200
  );
}

export async function handleGetAnalysisStats(c: Context<Env>) {
  const db = createDatabaseClient(c.env.DB);
  const stats = await getAnalysisStats(db);

  return c.json({ success: true, data: stats }, 200);
}

export async function handleTriggerAnalysis(c: Context<Env>) {
  const sessionId = c.req.param('sessionId');

  // Trigger processing in the background using waitUntil so the
  // response is returned immediately without blocking.
  c.executionCtx.waitUntil(processSession(sessionId, c.env));

  return c.json(
    {
      success: true,
      message: 'Analysis triggered',
      sessionId,
    },
    202
  );
}
