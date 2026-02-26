import type { Environment, SessionProcessingMessage } from './types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { instrument } from '@microlabs/otel-cf-workers';
import { logger } from 'hono/logger';
import { poweredBy } from 'hono/powered-by';
import { createOtelConfig } from './lib/otel';
import { handleQueueBatch } from './queue/consumer';
import {
  GetAnalysisStatsRoute,
  GetExitAnalysisRoute,
  GetJourneyAnalysisRoute,
  GetPageAnalysesRoute,
  GetSessionAnalysisRoute,
  HelloWorldRoute,
  TriggerAnalysisRoute,
} from './routes';
import {
  handleGetAnalysisStats,
  handleGetExitAnalysis,
  handleGetJourneyAnalysis,
  handleGetPageAnalyses,
  handleGetSessionAnalysis,
  handleTriggerAnalysis,
} from './routes/analysis-handlers';

const app = new OpenAPIHono<{ Bindings: Environment }>();
app.use(poweredBy());
app.use(logger());

app.openapi(HelloWorldRoute, c => {
  return c.json({ text: 'Hello Hono!' });
});

// Analysis routes
app.openapi(GetSessionAnalysisRoute, handleGetSessionAnalysis);
app.openapi(GetJourneyAnalysisRoute, handleGetJourneyAnalysis);
app.openapi(GetPageAnalysesRoute, handleGetPageAnalyses);
app.openapi(GetExitAnalysisRoute, handleGetExitAnalysis);
app.openapi(GetAnalysisStatsRoute, handleGetAnalysisStats);
app.openapi(TriggerAnalysisRoute, handleTriggerAnalysis);

app.doc('/docs', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Core Interaction Service API',
  },
});

const worker = {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<SessionProcessingMessage>,
    env: Environment
  ): Promise<void> {
    await handleQueueBatch(batch, env);
  },
};

export default instrument(
  worker,
  createOtelConfig('crow-core-interaction-service')
);
